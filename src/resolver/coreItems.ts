import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import type { LocalPack } from "./localPack";

export type ResolvedMcpServer = {
  name: string;
  server: { command: string; args?: string[]; env?: Record<string, string> };
};

export type OpenCodeAssetKind = "commands" | "agents" | "hooks" | "rules";

export type ResolvedOpenCodeAsset = {
  kind: OpenCodeAssetKind;
  fileName: string;
  srcPath: string;
};

async function loadDirFiles(
  root: string,
  kind: OpenCodeAssetKind,
  opts?: { markdownOnly?: boolean },
): Promise<ResolvedOpenCodeAsset[]> {
  const dir = join(root, "opencode", kind);
  try {
    const entries = await readdir(dir, { withFileTypes: true });
    return entries
      .filter((e) => e.isFile() && (!opts?.markdownOnly || e.name.endsWith(".md")))
      .map((e) => ({ kind, fileName: e.name, srcPath: join(dir, e.name) }))
      .sort((a, b) => a.fileName.localeCompare(b.fileName));
  } catch (e: any) {
    if (e?.code === "ENOENT") return [];
    throw e;
  }
}

export async function loadPackMcpServers(packRoot: string): Promise<ResolvedMcpServer[]> {
  const p = join(packRoot, "mcp", "servers.json");
  try {
    const raw = await readFile(p, "utf8");
    const obj = JSON.parse(raw) as Record<string, any>;
    return Object.keys(obj)
      .sort()
      .map((name) => ({ name, server: obj[name] }));
  } catch (e: any) {
    if (e?.code === "ENOENT") return [];
    throw e;
  }
}

export async function loadPackOpenCodeAssets(packRoot: string): Promise<ResolvedOpenCodeAsset[]> {
  const [commands, agents, hooks, rules] = await Promise.all([
    loadDirFiles(packRoot, "commands", { markdownOnly: true }),
    loadDirFiles(packRoot, "agents", { markdownOnly: true }),
    loadDirFiles(packRoot, "hooks"),
    loadDirFiles(packRoot, "rules", { markdownOnly: true }),
  ]);

  return [...commands, ...agents, ...hooks, ...rules].sort((a, b) => {
    if (a.kind === b.kind) return a.fileName.localeCompare(b.fileName);
    return a.kind.localeCompare(b.kind);
  });
}

export function packSkillByItemId(pack: LocalPack, itemId: string): { itemId: string; srcDir: string } {
  const s = pack.skills.find((x) => x.itemId === itemId);
  if (!s) throw new Error(`missing skill itemId in pack: ${itemId}`);
  return { itemId: s.itemId, srcDir: s.dir };
}
