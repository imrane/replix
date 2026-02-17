import { existsSync } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import type { DotfilesPackDef } from "./resolver/dotfilesConfig";

export function localPacksConfigPath(cwd: string): string {
  return join(cwd, ".nexus", "packs.json");
}

type LocalPacksConfig = {
  packs: DotfilesPackDef[];
};

async function readLocalPacksConfig(path: string): Promise<LocalPacksConfig> {
  if (!existsSync(path)) return { packs: [] };
  const raw = await readFile(path, "utf8");
  const parsed = JSON.parse(raw) as Partial<LocalPacksConfig>;
  return { packs: Array.isArray(parsed.packs) ? parsed.packs : [] };
}

async function writeLocalPacksConfig(path: string, cfg: LocalPacksConfig): Promise<void> {
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, JSON.stringify({ packs: cfg.packs }, null, 2) + "\n", "utf8");
}

export async function listInstalledPacks(params: { cwd: string }): Promise<DotfilesPackDef[]> {
  const path = localPacksConfigPath(params.cwd);
  const cfg = await readLocalPacksConfig(path);
  return [...cfg.packs].sort((a, b) => a.source.localeCompare(b.source));
}

export async function installPack(params: { cwd: string; source: string; allowUnpinned?: boolean }): Promise<{ path: string; added: boolean }> {
  const path = localPacksConfigPath(params.cwd);
  const cfg = await readLocalPacksConfig(path);
  const exists = cfg.packs.some((p) => p.source === params.source);
  if (!exists) {
    cfg.packs.push({ source: params.source, allowUnpinned: params.allowUnpinned });
    cfg.packs.sort((a, b) => a.source.localeCompare(b.source));
    await writeLocalPacksConfig(path, cfg);
  }
  return { path, added: !exists };
}

export async function uninstallPack(params: { cwd: string; source: string }): Promise<{ path: string; removed: boolean }> {
  const path = localPacksConfigPath(params.cwd);
  const cfg = await readLocalPacksConfig(path);
  const next = cfg.packs.filter((p) => p.source !== params.source);
  const removed = next.length !== cfg.packs.length;
  if (removed) {
    await writeLocalPacksConfig(path, { packs: next });
  }
  return { path, removed };
}
