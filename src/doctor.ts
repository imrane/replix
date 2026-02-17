import { join } from "node:path";
import { parseNexusConfig } from "./configSchema";
import { loadDotfilesRegistryFromEnv } from "./resolver/dotfilesConfig";
import { compilePlanFromConfig, compilePlanFromPack } from "./compile/plan";
import { checkNexusConfig } from "./check";
import { loadLocalPack } from "./resolver/localPack";
import { loadPackMcpServers, loadPackOpenCodeAssets } from "./resolver/coreItems";
import { resolveVars, type VarSource } from "./vars";
import type { PackVarsContract } from "./packSchema";
import { buildLockSnapshot, buildDiffSummary, readLockfile } from "./lockfile";

type DoctorVarSource = VarSource | "builtin" | "missing";

type VarRequirement = {
  pack: string;
  variable: string;
  source: DoctorVarSource;
  usedBy: string[];
  missing: boolean;
};

export type DoctorResult = {
  ok: boolean;
  problems: string[];
  notes: string[];
};

async function findPackRoot(start: string): Promise<string | null> {
  let current = start;
  const root = "/";
  while (true) {
    try {
      const packJson = join(current, "pack.json");
      await Bun.file(packJson).text();
      return current;
    } catch {
      if (current === root) return null;
      current = join(current, "..");
    }
  }
}

function extractTemplateVars(input: string): string[] {
  const out: string[] = [];
  const re = /\$\{([^}]+)\}/g;
  let m: RegExpExecArray | null = null;
  while ((m = re.exec(input)) !== null) {
    const expr = m[1]?.trim() ?? "";
    if (!expr) continue;
    out.push(expr.startsWith("ENV:") ? expr.slice(4) : expr);
  }
  return out;
}

function collectMcpTemplateVars(mcpName: string, server: { command: string; args?: string[]; env?: Record<string, string> }): Map<string, Set<string>> {
  const refs = new Map<string, Set<string>>();
  const add = (variable: string, usedBy: string) => {
    if (!refs.has(variable)) refs.set(variable, new Set());
    refs.get(variable)!.add(usedBy);
  };

  for (const v of extractTemplateVars(server.command)) add(v, `mcp.${mcpName}.command`);
  for (const arg of server.args ?? []) {
    for (const v of extractTemplateVars(arg)) add(v, `mcp.${mcpName}.args`);
  }
  for (const [k, vraw] of Object.entries(server.env ?? {})) {
    for (const v of extractTemplateVars(vraw)) add(v, `mcp.${mcpName}.env.${k}`);
  }
  return refs;
}

async function buildVarRequirements(params: {
  enabledMcp: string[];
  dotfilesMcp: Map<string, { command: string; args?: string[]; env?: Record<string, string> }>;
  repoRoot: string;
  cfgVars: Record<string, string>;
  dotfilesVars: Record<string, string>;
}): Promise<VarRequirement[]> {
  const { enabledMcp, dotfilesMcp, repoRoot, cfgVars, dotfilesVars } = params;

  const resolved = await resolveVars({
    repoRoot,
    cfgVars,
    dotfilesVars,
  });

  const entries = new Map<string, Set<string>>();
  for (const name of enabledMcp) {
    const server = dotfilesMcp.get(name);
    if (!server) continue;
    const refs = collectMcpTemplateVars(name, server);
    for (const [variable, usedBy] of refs.entries()) {
      if (!entries.has(variable)) entries.set(variable, new Set());
      for (const u of usedBy) entries.get(variable)!.add(u);
    }
  }

  const reqs: VarRequirement[] = [];
  for (const [variable, usedBy] of [...entries.entries()].sort((a, b) => a[0].localeCompare(b[0]))) {
    let source: DoctorVarSource = "missing";
    if (variable === "PROJECT_ROOT") source = "builtin";
    else if (resolved.sourceByVar[variable]) source = resolved.sourceByVar[variable];

    reqs.push({
      pack: "config",
      variable,
      source,
      usedBy: [...usedBy].sort(),
      missing: source === "missing",
    });
  }

  return reqs;
}

function pushVarMatrixNotes(notes: string[], reqs: VarRequirement[]): void {
  notes.push("variable matrix:");
  if (reqs.length === 0) {
    notes.push("  (no template variables referenced by enabled MCP servers)");
    return;
  }

  for (const req of reqs) {
    const status = req.missing ? "missing" : "ok";
    notes.push(`  [${status}] pack=${req.pack} var=${req.variable} source=${req.source} usedBy=${req.usedBy.join(",")}`);
  }
}

async function evaluatePackVarsContract(params: {
  packId: string;
  repoRoot: string;
  vars: PackVarsContract;
}): Promise<{ requirements: VarRequirement[]; problems: string[]; notes: string[] }> {
  const { packId, repoRoot, vars } = params;
  const problems: string[] = [];
  const notes: string[] = [];

  const resolved = await resolveVars({
    repoRoot,
    cfgVars: {},
    dotfilesVars: {},
  });

  const requirements: VarRequirement[] = [];
  const requiredKeys = Object.keys(vars.required).sort();
  const optionalKeys = Object.keys(vars.optional).sort();

  for (const key of requiredKeys) {
    const source = (resolved.sourceByVar[key] ?? "missing") as DoctorVarSource;
    const missing = source === "missing";
    requirements.push({
      pack: packId,
      variable: key,
      source,
      usedBy: ["pack.vars.required"],
      missing,
    });

    if (missing) {
      problems.push(`pack ${packId} blocked: missing required variable ${key}`);
      problems.push(`  fix: write secret to .nexus/vars/${key} (recommended), or set ${key}_FILE, or export ${key}`);
    }
  }

  for (const key of optionalKeys) {
    const source = (resolved.sourceByVar[key] ?? "missing") as DoctorVarSource;
    requirements.push({
      pack: packId,
      variable: key,
      source,
      usedBy: ["pack.vars.optional"],
      missing: false,
    });
  }

  if (requiredKeys.length === 0 && optionalKeys.length === 0) {
    notes.push(`pack ${packId}: no vars contract entries`);
  } else if (problems.length === 0) {
    notes.push(`pack ${packId}: ready`);
  }

  return { requirements, problems, notes };
}

export async function runDoctor(args: { cwd: string; configPath?: string | null }): Promise<DoctorResult> {
  const { cwd, configPath } = args;
  const problems: string[] = [];
  const notes: string[] = [];

  if (configPath) {
    try {
      const raw = await Bun.file(configPath).text();
      const cfg = parseNexusConfig(JSON.parse(raw));
      notes.push(`config parsed: ${configPath}`);

      const dotfiles = await loadDotfilesRegistryFromEnv();
      notes.push(`dotfiles loaded: skills=${dotfiles.skills.size}, mcp=${dotfiles.mcp.size}`);

      const repoRoot = cfg.repoRoot ?? cwd;
      const varReqs = await buildVarRequirements({
        enabledMcp: cfg.enable.mcp,
        dotfilesMcp: dotfiles.mcp,
        repoRoot,
        cfgVars: cfg.vars,
        dotfilesVars: dotfiles.vars,
      });
      pushVarMatrixNotes(notes, varReqs);

      const missing = varReqs.filter((v) => v.missing);
      const strictEnv = cfg.strictEnv ?? dotfiles.strictEnv;
      if (missing.length > 0 && strictEnv) {
        for (const m of missing) {
          problems.push(`missing required variable: ${m.variable} (used by ${m.usedBy.join(",")})`);
        }
      } else if (missing.length > 0) {
        notes.push(`strictEnv=false: ${missing.length} unresolved template variable(s) tolerated`);
      }

      if (!(missing.length > 0 && strictEnv)) {
        await compilePlanFromConfig({ cfg, dotfiles, cwd });
        notes.push("compile plan check: ok");
      }

      const drift = await checkNexusConfig(configPath, cwd);
      if (drift.ok) {
        notes.push("output drift: none");
      } else {
        problems.push(`output drift detected (${drift.changes.length})`);
        for (const c of drift.changes) problems.push(`  ${c}`);
      }

      const dotfilesPath = process.env.NEXUS_DOTFILES_CONFIG_JSON;
      if (dotfilesPath) {
        const lockPath = join(repoRoot, "nexus.lock.json");
        const current = await buildLockSnapshot(dotfilesPath);
        const existing = await readLockfile(lockPath);
        if (!existing) {
          notes.push("lockfile: missing (run `nexus lock update`)");
        } else {
          const lockDiff = buildDiffSummary(existing, current);
          if (lockDiff.length > 0) {
            problems.push(`lockfile drift detected (${lockDiff.length})`);
            for (const d of lockDiff) problems.push(`  ${d}`);
            problems.push("  fix: run `nexus lock update`");
          } else {
            notes.push("lockfile: in sync");
          }
        }
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      problems.push(msg);
    }

    return { ok: problems.length === 0, problems, notes };
  }

  const packRoot = await findPackRoot(cwd);
  if (!packRoot) {
    return {
      ok: false,
      problems: ["No pack.json found and no --config specified."],
      notes,
    };
  }

  try {
    const pack = await loadLocalPack(packRoot);
    const mcpServers = await loadPackMcpServers(packRoot);
    const openCodeAssets = await loadPackOpenCodeAssets(packRoot);
    await compilePlanFromPack({ pack, packRoot, mcpServers, openCodeAssets });
    notes.push(`pack parsed: ${pack.meta.id}@${pack.meta.version}`);
    notes.push(`pack skills: ${pack.skills.length}`);
    notes.push(`pack mcp servers: ${mcpServers.length}`);

    if (pack.meta.vars) {
      const contract = await evaluatePackVarsContract({
        packId: pack.meta.id,
        repoRoot: packRoot,
        vars: pack.meta.vars,
      });
      pushVarMatrixNotes(notes, contract.requirements);
      notes.push(...contract.notes);
      problems.push(...contract.problems);
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    problems.push(msg);
  }

  return { ok: problems.length === 0, problems, notes };
}
