import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";

export function statePath(repoRoot: string): string {
  return join(repoRoot, ".claude", ".nexus-state");
}

export async function writeStateHash(repoRoot: string, hash: string): Promise<void> {
  const dir = join(repoRoot, ".claude");
  await mkdir(dir, { recursive: true });
  await writeFile(statePath(repoRoot), hash + "\n", "utf8");
}

export async function readStateHash(repoRoot: string): Promise<string | null> {
  try {
    const raw = await readFile(statePath(repoRoot), "utf8");
    return raw.trim() || null;
  } catch (e: any) {
    if (e?.code === "ENOENT") return null;
    throw e;
  }
}

export async function shouldSkipEmit(repoRoot: string, desiredHash: string): Promise<boolean> {
  const existing = await readStateHash(repoRoot);
  return existing === desiredHash;
}
