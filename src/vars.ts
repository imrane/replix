import { readFile, readdir } from "node:fs/promises";
import { join } from "node:path";
import type { PackVarsContract } from "./packSchema";

export type VarSource = "builtin" | "config" | "dotfiles" | "file" | "process" | "contract-default" | "missing";

export type ResolvedVars = {
  values: Record<string, string>;
  sourceByVar: Record<string, Exclude<VarSource, "missing" | "builtin">>;
};

export type PackContractResolution = {
  values: Record<string, string>;
  sourceByVar: Record<string, Exclude<VarSource, "missing" | "builtin">>;
  missingRequired: string[];
  interpolationErrors: string[];
  /** Var names marked secret:true in the pack contract — never log or display their values. */
  secretVars: string[];
};

async function readVarFile(path: string): Promise<string | null> {
  try {
    const raw = await readFile(path, "utf8");
    return raw.replace(/\r?\n$/, "");
  } catch {
    return null;
  }
}

async function collectDefaultFileVars(repoRoot: string): Promise<Record<string, string>> {
  const out: Record<string, string> = {};
  const dirs = [join(repoRoot, ".replix", "vars"), "/run/secrets", "/var/run/secrets"];

  for (const dir of dirs) {
    let names: string[] = [];
    try {
      names = (await readdir(dir)).sort();
    } catch {
      continue;
    }

    for (const name of names) {
      if (!name || name.startsWith(".")) continue;
      if (out[name] !== undefined) continue;
      const value = await readVarFile(join(dir, name));
      if (value !== null) out[name] = value;
    }
  }

  return out;
}

async function collectEnvFileVars(processVars: Record<string, string>): Promise<Record<string, string>> {
  const out: Record<string, string> = {};

  for (const [k, p] of Object.entries(processVars)) {
    if (!k.endsWith("_FILE")) continue;
    const varName = k.slice(0, -5);
    if (!varName) continue;
    const value = await readVarFile(p);
    if (value !== null) out[varName] = value;
  }

  return out;
}

export async function resolveVars(params: {
  repoRoot: string;
  cfgVars: Record<string, string>;
  dotfilesVars: Record<string, string>;
  processEnv?: NodeJS.ProcessEnv;
}): Promise<ResolvedVars> {
  const processVars = Object.fromEntries(
    Object.entries(params.processEnv ?? process.env)
      .filter(([, v]) => typeof v === "string")
      .map(([k, v]) => [k, v as string]),
  );

  const envFileVars = await collectEnvFileVars(processVars);
  const defaultFileVars = await collectDefaultFileVars(params.repoRoot);

  const fileVars = {
    ...defaultFileVars,
    ...envFileVars,
  };

  // precedence: process < file < dotfiles < config
  const values: Record<string, string> = {
    ...processVars,
    ...fileVars,
    ...params.dotfilesVars,
    ...params.cfgVars,
  };

  const sourceByVar: Record<string, Exclude<VarSource, "missing" | "builtin">> = {};
  for (const k of Object.keys(processVars)) sourceByVar[k] = "process";
  for (const k of Object.keys(fileVars)) sourceByVar[k] = "file";
  for (const k of Object.keys(params.dotfilesVars)) sourceByVar[k] = "dotfiles";
  for (const k of Object.keys(params.cfgVars)) sourceByVar[k] = "config";

  return { values, sourceByVar };
}

function templateValue(input: string, values: Record<string, string>, strict: boolean): { output: string; missing: string[] } {
  const missing: string[] = [];
  const output = input.replace(/\$\{([^}]+)\}/g, (_m, exprRaw: string) => {
    const expr = exprRaw.trim();
    const key = expr.startsWith("ENV:") ? expr.slice(4) : expr;
    const v = values[key];
    if (v !== undefined) return v;
    missing.push(key);
    return strict ? `__MISSING_VAR__:${key}` : "";
  });
  return { output, missing };
}

export async function resolvePackContractVars(params: {
  repoRoot: string;
  cfgVars: Record<string, string>;
  dotfilesVars: Record<string, string>;
  contract: PackVarsContract;
  strictInterpolation?: boolean;
  processEnv?: NodeJS.ProcessEnv;
}): Promise<PackContractResolution> {
  const strictInterpolation = params.strictInterpolation ?? true;
  const base = await resolveVars({
    repoRoot: params.repoRoot,
    cfgVars: params.cfgVars,
    dotfilesVars: params.dotfilesVars,
    processEnv: params.processEnv,
  });

  const values: Record<string, string> = { ...base.values };
  const sourceByVar: Record<string, Exclude<VarSource, "missing" | "builtin">> = { ...base.sourceByVar };
  const required = Object.keys(params.contract.required).sort();
  const optional = Object.keys(params.contract.optional).sort();
  const allKeys = [...new Set([...required, ...optional])];

  // Apply defaults for unset vars.
  for (const key of allKeys) {
    if (values[key] !== undefined) continue;
    const spec = params.contract.required[key] ?? params.contract.optional[key];
    if (spec?.default !== undefined) {
      values[key] = spec.default;
      sourceByVar[key] = "contract-default";
    }
  }

  const interpolationErrors: string[] = [];
  // Resolve nested interpolation in defaults over a bounded number of passes.
  for (let i = 0; i < 4; i++) {
    let changed = false;
    for (const key of allKeys) {
      const current = values[key];
      if (current === undefined || !current.includes("${")) continue;
      const rendered = templateValue(current, values, strictInterpolation);
      if (rendered.missing.length > 0) {
        for (const miss of rendered.missing) {
          interpolationErrors.push(`variable ${key} references unresolved variable ${miss}`);
        }
      }
      if (rendered.output !== current) {
        values[key] = rendered.output;
        changed = true;
      }
    }
    if (!changed) break;
  }

  const missingRequired = required.filter((k) => values[k] === undefined || values[k] === "");

  const secretVars = allKeys
    .filter((k) => {
      const spec = params.contract.required[k] ?? params.contract.optional[k];
      return spec?.secret === true;
    })
    .sort();

  return {
    values,
    sourceByVar,
    missingRequired,
    interpolationErrors: [...new Set(interpolationErrors)].sort(),
    secretVars,
  };
}
