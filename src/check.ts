import { cp, mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { existsSync, type Dirent } from "node:fs";
import { join, relative } from "node:path";
import { tmpdir } from "node:os";
import { runNexus } from "./runNexus";
import { parseNexusConfig } from "./configSchema";

async function listFilesRec(root: string, rel = ""): Promise<string[]> {
  const dir = rel ? join(root, rel) : root;
  let entries: Dirent[] = [];
  try {
    entries = await readdir(dir, { withFileTypes: true });
  } catch {
    return [];
  }

  const out: string[] = [];
  for (const e of entries) {
    const childRel = rel ? join(rel, e.name) : e.name;
    if (e.isDirectory()) out.push(...(await listFilesRec(root, childRel)));
    else if (e.isFile()) out.push(childRel);
  }
  return out;
}

async function readTextSafe(path: string): Promise<string | null> {
  try {
    return await readFile(path, "utf8");
  } catch {
    return null;
  }
}

async function managedPaths(repoRoot: string): Promise<Set<string>> {
  const out = new Set<string>();

  for (const rel of await listFilesRec(repoRoot, ".claude")) out.add(rel);

  const mcpPath = join(repoRoot, ".mcp.json");
  if (existsSync(mcpPath)) {
    const raw = await readTextSafe(mcpPath);
    if (raw?.includes('"__generated_by": "nexus"')) out.add(".mcp.json");
  }

  const manifestPath = join(repoRoot, ".nexus", "custom-files-owned.json");
  if (existsSync(manifestPath)) {
    out.add(join(".nexus", "custom-files-owned.json"));
    const raw = await readTextSafe(manifestPath);
    try {
      const parsed = JSON.parse(raw ?? "{}");
      const arr = Array.isArray(parsed?.paths) ? parsed.paths : [];
      for (const p of arr) {
        if (typeof p === "string") out.add(p.replace(/^\/+/, ""));
      }
    } catch {
      // ignore malformed manifest
    }
  }

  return out;
}

export async function checkNexusConfig(configPath: string, cwd: string): Promise<{ ok: boolean; changes: string[] }> {
  const raw = await readFile(configPath, "utf8");
  const cfg = parseNexusConfig(JSON.parse(raw));
  const realRoot = cfg.repoRoot ?? cwd;

  const tmp = await mkdtemp(join(tmpdir(), "nexus-check-"));
  const tmpRepo = join(tmp, "repo");

  try {
    await cp(realRoot, tmpRepo, {
      recursive: true,
      force: true,
      filter: (src) => {
        const rel = relative(realRoot, src);
        if (!rel || rel === ".") return true;
        if (rel.startsWith(".git")) return false;
        if (rel.startsWith("node_modules")) return false;
        if (rel.startsWith(".direnv")) return false;
        return true;
      },
    });

    const checkCfg = { ...cfg, repoRoot: tmpRepo };
    const checkCfgPath = join(tmp, "check-config.json");
    await writeFile(checkCfgPath, JSON.stringify(checkCfg, null, 2), "utf8");

    // Force recomputation in check mode so stale/edited outputs are detected even if state hash matches.
    await rm(join(tmpRepo, ".claude", ".nexus-state"), { force: true });
    await runNexus({ cwd: tmpRepo, configPath: checkCfgPath });

    const desired = await managedPaths(tmpRepo);
    const existing = await managedPaths(realRoot);
    const all = new Set<string>([...desired, ...existing]);

    const changes: string[] = [];
    for (const rel of [...all].sort()) {
      const left = await readTextSafe(join(realRoot, rel));
      const right = await readTextSafe(join(tmpRepo, rel));
      if (left === right) continue;
      if (left == null && right != null) changes.push(`ADD ${rel}`);
      else if (left != null && right == null) changes.push(`REMOVE ${rel}`);
      else changes.push(`MODIFY ${rel}`);
    }

    return { ok: changes.length === 0, changes };
  } finally {
    await rm(tmp, { recursive: true, force: true });
  }
}
