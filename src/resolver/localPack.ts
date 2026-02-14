import { readdir, readFile, stat } from "node:fs/promises";
import { join } from "node:path";
import { parsePackJson, type PackJson } from "../packSchema";

export type LocalSkill = {
  itemId: string;
  dir: string;
  skillMdPath: string;
};

export type LocalPack = {
  root: string;
  meta: PackJson;
  skills: LocalSkill[];
};

async function listDirs(dir: string): Promise<string[]> {
  try {
    const entries = await readdir(dir, { withFileTypes: true });
    return entries.filter((e) => e.isDirectory()).map((e) => e.name).sort();
  } catch (e: any) {
    if (e?.code === "ENOENT") return [];
    throw e;
  }
}

export async function loadLocalPack(root: string): Promise<LocalPack> {
  const packJsonPath = join(root, "pack.json");
  const raw = await readFile(packJsonPath, "utf8");
  const meta = parsePackJson(JSON.parse(raw));

  const skillsRoot = join(root, "skills");
  const skillDirs = await listDirs(skillsRoot);

  const skills: LocalSkill[] = [];
  for (const itemId of skillDirs) {
    const dir = join(skillsRoot, itemId);
    const skillMdPath = join(dir, "SKILL.md");
    try {
      const s = await stat(skillMdPath);
      if (!s.isFile()) continue;
    } catch (e: any) {
      if (e?.code === "ENOENT") continue;
      throw e;
    }
    skills.push({ itemId, dir, skillMdPath });
  }

  return { root, meta, skills };
}
