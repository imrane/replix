import { mkdir, access, writeFile } from "node:fs/promises";
import { constants } from "node:fs";
import { join } from "node:path";
import { updateLockfile } from "./lockfile";

async function exists(path: string): Promise<boolean> {
  try {
    await access(path, constants.F_OK);
    return true;
  } catch {
    return false;
  }
}

function readArgValue(flag: string): string | null {
  const idx = process.argv.indexOf(flag);
  if (idx === -1) return null;
  const v = process.argv[idx + 1];
  return typeof v === "string" ? v : null;
}

function isFlagPresent(flag: string): boolean {
  return process.argv.includes(flag);
}

export async function runInit(params: { cwd: string }): Promise<{ created: string[]; notes: string[] }> {
  const cwd = params.cwd;
  const created: string[] = [];
  const notes: string[] = [];

  const client = readArgValue("--client") ?? "claude";
  const force = isFlagPresent("--force");
  const withLock = isFlagPresent("--with-lock");

  const nexusDir = join(cwd, ".nexus");
  const varsDir = join(nexusDir, "vars");
  const configPath = join(nexusDir, "repo.json");
  const varsExamplePath = join(varsDir, ".example");

  await mkdir(varsDir, { recursive: true });

  const config = {
    version: 1,
    repoRoot: cwd,
    clients: [client],
    enable: {
      skills: [],
      mcp: [],
    },
    overrides: {
      skills: {},
      mcp: {},
    },
  };

  if (!(await exists(configPath)) || force) {
    await writeFile(configPath, JSON.stringify(config, null, 2) + "\n", "utf8");
    created.push(configPath);
  } else {
    notes.push(`exists (kept): ${configPath}`);
  }

  const varsExample = [
    "# Put one secret per file in this directory",
    "# Example:",
    "# echo -n \"your-token\" > .nexus/vars/API_TOKEN",
    "#",
    "# File-based vars are preferred and loaded before plain env.",
    "",
  ].join("\n");

  if (!(await exists(varsExamplePath)) || force) {
    await writeFile(varsExamplePath, varsExample, "utf8");
    created.push(varsExamplePath);
  } else {
    notes.push(`exists (kept): ${varsExamplePath}`);
  }

  if (withLock) {
    try {
      const out = await updateLockfile({ cwd });
      created.push(out.path);
      for (const d of out.diff) notes.push(`lock: ${d}`);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      notes.push(`lock skipped: ${msg}`);
    }
  }

  return { created, notes };
}
