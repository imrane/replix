import { existsSync } from "node:fs";
import { readFile, writeFile } from "node:fs/promises";
import { join, dirname } from "node:path";
import { loadDotfilesConfigFromPath, type DotfilesPackDef } from "./resolver/dotfilesConfig";
import { resolveDotfilesSourceToPath, parseGithubSource } from "./resolver/sourceResolver";
import { loadLocalPack } from "./resolver/localPack";
import { execFileSync } from "node:child_process";

export type LockfilePack = {
  source: string;
  rev: string;
  version: string;
  requiredVars: string[];
};

export type NexusLockfile = {
  version: 1;
  packs: LockfilePack[];
};

function inferRevFromSource(source: string): string {
  if (source.startsWith("path:")) return "local";
  if (source.startsWith("github:")) {
    const g = parseGithubSource(source);
    if (!g) return "unknown";
    if (!g.ref) return "floating";
    return g.ref;
  }
  return "unknown";
}

function findGitRoot(start: string): string | null {
  let current = start;
  const root = "/";
  while (true) {
    if (existsSync(join(current, ".git"))) return current;
    if (current === root) return null;
    current = dirname(current);
  }
}

function resolveGitHead(path: string): string | null {
  const gitRoot = findGitRoot(path);
  if (!gitRoot) return null;
  try {
    const out = execFileSync("git", ["rev-parse", "HEAD"], {
      cwd: gitRoot,
      stdio: ["ignore", "pipe", "ignore"],
      env: process.env,
    })
      .toString()
      .trim();
    return out || null;
  } catch {
    return null;
  }
}

async function lockEntryFromPack(pack: DotfilesPackDef): Promise<LockfilePack> {
  const root = await resolveDotfilesSourceToPath(pack.source, { allowUnpinned: pack.allowUnpinned });
  const local = await loadLocalPack(root);
  const requiredVars = Object.keys(local.meta.vars?.required ?? {}).sort();

  const resolvedHead = resolveGitHead(root);
  const sourceRev = inferRevFromSource(pack.source);

  return {
    source: pack.source,
    rev: resolvedHead ?? sourceRev,
    version: local.meta.version,
    requiredVars,
  };
}

export async function buildLockSnapshot(dotfilesConfigPath: string): Promise<NexusLockfile> {
  const dotfiles = await loadDotfilesConfigFromPath(dotfilesConfigPath);
  const packDefs = dotfiles.packs ?? [];

  const packs: LockfilePack[] = [];
  for (const p of packDefs) packs.push(await lockEntryFromPack(p));
  packs.sort((a, b) => a.source.localeCompare(b.source));

  return { version: 1, packs };
}

export async function readLockfile(path: string): Promise<NexusLockfile | null> {
  if (!existsSync(path)) return null;
  try {
    const raw = await readFile(path, "utf8");
    const parsed = JSON.parse(raw) as NexusLockfile;
    if (parsed?.version !== 1 || !Array.isArray(parsed.packs)) return null;
    return parsed;
  } catch {
    return null;
  }
}

export function buildDiffSummary(prev: NexusLockfile | null, next: NexusLockfile): string[] {
  if (!prev) return ["new lockfile created"];

  const out: string[] = [];
  const prevBySource = new Map(prev.packs.map((p) => [p.source, p]));

  for (const p of next.packs) {
    const old = prevBySource.get(p.source);
    if (!old) {
      out.push(`pack added: ${p.source} @ ${p.version}`);
      continue;
    }
    if (old.version !== p.version) {
      out.push(`pack version: ${p.source} ${old.version} -> ${p.version}`);
    }
    if (old.rev !== p.rev) {
      out.push(`pack rev: ${p.source} ${old.rev} -> ${p.rev}`);
    }

    const oldReq = new Set(old.requiredVars);
    const newReq = new Set(p.requiredVars);
    for (const v of [...newReq].sort()) {
      if (!oldReq.has(v)) out.push(`new required var: ${p.source} ${v}`);
    }
  }

  return out;
}

export async function updateLockfile(params: {
  cwd: string;
  dotfilesConfigPath?: string;
}): Promise<{ path: string; lock: NexusLockfile; diff: string[] }> {
  const dotfilesConfigPath = params.dotfilesConfigPath ?? process.env.NEXUS_DOTFILES_CONFIG_JSON;
  if (!dotfilesConfigPath) {
    throw new Error("lock update requires NEXUS_DOTFILES_CONFIG_JSON");
  }

  const lock = await buildLockSnapshot(dotfilesConfigPath);
  const lockPath = join(params.cwd, "nexus.lock.json");

  const prev = await readLockfile(lockPath);
  const diff = buildDiffSummary(prev, lock);

  await writeFile(lockPath, JSON.stringify(lock, null, 2) + "\n", "utf8");

  return { path: lockPath, lock, diff };
}
