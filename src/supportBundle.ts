import { existsSync } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { readRecentLogLines } from "./opsLog";

type FileSnapshot = {
  path: string;
  exists: boolean;
  content?: unknown;
  error?: string;
};

async function readJsonIfExists(path: string): Promise<FileSnapshot> {
  if (!existsSync(path)) return { path, exists: false };
  try {
    const raw = await readFile(path, "utf8");
    return { path, exists: true, content: JSON.parse(raw) };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return { path, exists: true, error: msg };
  }
}

export async function createSupportBundle(params: {
  cwd: string;
}): Promise<{ path: string }> {
  const cwd = params.cwd;
  const ts = new Date().toISOString().replaceAll(":", "-");

  const repoConfigPath = join(cwd, ".nexus", "repo.json");
  const packsPath = join(cwd, ".nexus", "packs.json");
  const lockPath = join(cwd, "nexus.lock.json");

  const bundle = {
    schemaVersion: 1,
    generatedAt: new Date().toISOString(),
    cwd,
    files: {
      repoConfig: await readJsonIfExists(repoConfigPath),
      packs: await readJsonIfExists(packsPath),
      lockfile: await readJsonIfExists(lockPath),
    },
    logs: {
      recentEvents: await readRecentLogLines({ cwd, maxLines: 200 }),
    },
  };

  const outDir = join(cwd, ".nexus", "support");
  await mkdir(outDir, { recursive: true });
  const outPath = join(outDir, `nexus-support-${ts}.json`);
  await writeFile(outPath, JSON.stringify(bundle, null, 2) + "\n", "utf8");
  return { path: outPath };
}
