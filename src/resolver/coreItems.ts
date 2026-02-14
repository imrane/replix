import { readFile } from "node:fs/promises";
import { join } from "node:path";
import type { LocalPack } from "./localPack";

export type ResolvedMcpServer = {
  name: string;
  server: { command: string; args?: string[]; env?: Record<string, string> };
};

export type ResolvedOpenCodeCommand = {
  fileName: string;
  srcPath: string;
};

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

export async function loadPackOpenCodeCommands(packRoot: string): Promise<ResolvedOpenCodeCommand[]> {
  const dir = join(packRoot, "opencode", "commands");
  try {
    const entries = await (await import("node:fs/promises")).readdir(dir, { withFileTypes: true });
    return entries
      .filter((e) => e.isFile() && e.name.endsWith(".md"))
      .map((e) => ({ fileName: e.name, srcPath: join(dir, e.name) }))
      .sort((a, b) => a.fileName.localeCompare(b.fileName));
  } catch (e: any) {
    if (e?.code === "ENOENT") return [];
    throw e;
  }
}

export function packSkillByItemId(pack: LocalPack, itemId: string): { itemId: string; srcDir: string } {
  const s = pack.skills.find((x) => x.itemId === itemId);
  if (!s) throw new Error(`missing skill itemId in pack: ${itemId}`);
  return { itemId: s.itemId, srcDir: s.dir };
}
