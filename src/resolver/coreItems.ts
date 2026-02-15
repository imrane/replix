import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import type { LocalPack } from "./localPack";

export type ResolvedMcpServer = {
  name: string;
  server: { command: string; args?: string[]; env?: Record<string, string> };
};

// Upstream opencode uses singular dirs: opencode/command and opencode/agent.
// Keep legacy plural dir support as aliases when loading packs.
export type OpenCodeAssetKind = "command" | "agent" | "hooks" | "rules";

export type ResolvedOpenCodeAsset = {
  kind: OpenCodeAssetKind;
  fileName: string;
  srcPath: string;
};

async function loadDirFiles(
  root: string,
  kind: OpenCodeAssetKind,
  opts?: { markdownOnly?: boolean; dirName?: string },
): Promise<ResolvedOpenCodeAsset[]> {
  const dir = join(root, "opencode", opts?.dirName ?? kind);
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
  // canonical
  const [command, agent, hooks, rules] = await Promise.all([
    loadDirFiles(packRoot, "command", { markdownOnly: true }),
    loadDirFiles(packRoot, "agent", { markdownOnly: true }),
    loadDirFiles(packRoot, "hooks"),
    loadDirFiles(packRoot, "rules", { markdownOnly: true }),
  ]);

  // legacy aliases (plural dirs)
  const [legacyCommands, legacyAgents] = await Promise.all([
    loadDirFiles(packRoot, "command", { markdownOnly: true, dirName: "commands" }),
    loadDirFiles(packRoot, "agent", { markdownOnly: true, dirName: "agents" }),
  ]);

  const all = [...command, ...agent, ...hooks, ...rules, ...legacyCommands, ...legacyAgents];

  // de-dupe if both canonical + legacy exist with same fileName.
  const seen = new Set<string>();
  const deduped = all.filter((a) => {
    const k = `${a.kind}/${a.fileName}`;
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });

  return deduped.sort((a, b) => {
    if (a.kind === b.kind) return a.fileName.localeCompare(b.fileName);
    return a.kind.localeCompare(b.kind);
  });
}

export function packSkillByItemId(pack: LocalPack, itemId: string): { itemId: string; srcDir: string } {
  const s = pack.skills.find((x) => x.itemId === itemId);
  if (!s) throw new Error(`missing skill itemId in pack: ${itemId}`);
  return { itemId: s.itemId, srcDir: s.dir };
}
