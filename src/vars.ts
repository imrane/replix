import { readFile, readdir } from "node:fs/promises";
import { join } from "node:path";

export type VarSource = "builtin" | "config" | "dotfiles" | "file" | "process" | "missing";

export type ResolvedVars = {
  values: Record<string, string>;
  sourceByVar: Record<string, Exclude<VarSource, "missing" | "builtin">>;
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
  const dirs = [join(repoRoot, ".nexus", "vars"), "/run/secrets", "/var/run/secrets"];

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
