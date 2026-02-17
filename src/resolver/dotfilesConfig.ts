import { existsSync } from "node:fs";
import { readdir, readFile, stat } from "node:fs/promises";
import { basename, join } from "node:path";
import { loadPackMcpServers } from "./coreItems";
import { loadLocalPack } from "./localPack";
import { resolveDotfilesSourceToPath } from "./sourceResolver";

export type DotfilesSkillDef = {
  source: string;
  description?: string;
  tags?: string[];
  allowUnpinned?: boolean;
};

export type DotfilesMcpDef = {
  command: string;
  args?: string[];
  env?: Record<string, string>;
};

export type DotfilesClientFileDef = {
  text?: string;
  source?: string;
  mode?: string;
  executable?: boolean;
  allowUnpinned?: boolean;
};

export type DotfilesClientDef = {
  files?: Record<string, DotfilesClientFileDef>;
};

export type DotfilesArtifactsDef = {
  commands?: Record<string, DotfilesClientFileDef>;
  hooks?: Record<string, DotfilesClientFileDef>;
  agents?: Record<string, DotfilesClientFileDef>;
  settings?: DotfilesClientFileDef;
  settingsLocal?: DotfilesClientFileDef;
};

export type DotfilesClaudeDef = DotfilesArtifactsDef;

export type DotfilesPluginDef = {
  module: string;
};

export type DotfilesPackDef = {
  source: string;
  allowUnpinned?: boolean;
  signaturePublicKey?: string;
};

export type DotfilesConfig = {
  packs?: DotfilesPackDef[];
  skills?: Record<string, DotfilesSkillDef>;
  mcp?: Record<string, DotfilesMcpDef>;
  clients?: Record<string, DotfilesClientDef>;
  plugins?: Record<string, DotfilesPluginDef>;
  artifacts?: DotfilesArtifactsDef;
  claude?: DotfilesClaudeDef;
  vars?: Record<string, string>;
  strictEnv?: boolean;
};

export type DotfilesRegistry = {
  skills: Map<string, DotfilesSkillDef>;
  mcp: Map<string, DotfilesMcpDef>;
  clients: Map<string, DotfilesClientDef>;
  plugins: Map<string, DotfilesPluginDef>;
  vars: Record<string, string>;
  strictEnv: boolean;
};

export async function loadDotfilesConfigFromPath(path: string): Promise<DotfilesConfig> {
  const raw = await Bun.file(path).text();
  const json = JSON.parse(raw) as DotfilesConfig;
  return json;
}

function mapArtifactsToClaudeFiles(defs: DotfilesArtifactsDef | undefined): Record<string, DotfilesClientFileDef> {
  const out: Record<string, DotfilesClientFileDef> = {};

  const sections: Array<["commands" | "hooks" | "agents", string]> = [
    ["commands", ".claude/commands"],
    ["hooks", ".claude/hooks"],
    ["agents", ".claude/agents"],
  ];

  for (const [section, base] of sections) {
    const items = defs?.[section] ?? {};
    for (const [name, def] of Object.entries(items)) {
      const rel = `${base}/${name}`.replace(/\/+/g, "/").replace(/^\/+/, "");
      if (out[rel]) throw new Error(`duplicate claude file path in dotfiles config: ${rel}`);
      out[rel] = def;
    }
  }

  if (defs?.settings) {
    const rel = ".claude/settings.json";
    if (out[rel]) throw new Error(`duplicate claude file path in dotfiles config: ${rel}`);
    out[rel] = defs.settings;
  }

  if (defs?.settingsLocal) {
    const rel = ".claude/settings.local.json";
    if (out[rel]) throw new Error(`duplicate claude file path in dotfiles config: ${rel}`);
    out[rel] = defs.settingsLocal;
  }

  return out;
}

async function listFiles(dir: string, opts?: { markdownOnly?: boolean }): Promise<string[]> {
  try {
    const entries = await readdir(dir, { withFileTypes: true });
    return entries
      .filter((e) => e.isFile() && (!opts?.markdownOnly || e.name.endsWith(".md")))
      .map((e) => e.name)
      .sort();
  } catch (e: any) {
    if (e?.code === "ENOENT") return [];
    throw e;
  }
}

async function assertRefFile(packRoot: string, relPath: string, opts?: { markdownOnly?: boolean }): Promise<string> {
  const abs = join(packRoot, relPath);
  const s = await stat(abs).catch(() => null);
  if (!s?.isFile()) throw new Error(`pack reference file not found: ${relPath}`);
  if (opts?.markdownOnly && !relPath.endsWith(".md")) {
    throw new Error(`pack reference must be markdown: ${relPath}`);
  }
  return abs;
}

async function loadMcpServersFromFile(path: string): Promise<Array<{ name: string; server: DotfilesMcpDef }>> {
  const raw = await readFile(path, "utf8");
  const obj = JSON.parse(raw) as Record<string, DotfilesMcpDef>;
  return Object.keys(obj)
    .sort((a, b) => a.localeCompare(b))
    .map((name) => ({ name, server: obj[name]! }));
}

async function buildRegistryFromPacks(packs: DotfilesPackDef[] | undefined): Promise<{
  skills: Map<string, DotfilesSkillDef>;
  mcp: Map<string, DotfilesMcpDef>;
  claudeFiles: Record<string, DotfilesClientFileDef>;
}> {
  const skills = new Map<string, DotfilesSkillDef>();
  const mcp = new Map<string, DotfilesMcpDef>();
  const claudeFiles: Record<string, DotfilesClientFileDef> = {};

  for (const pack of packs ?? []) {
    const root = await resolveDotfilesSourceToPath(pack.source, { allowUnpinned: pack.allowUnpinned });

    const s = await stat(join(root, "pack.json")).catch(() => null);
    if (!s?.isFile()) throw new Error(`dotfiles pack source must contain pack.json: ${pack.source}`);

    const localPack = await loadLocalPack(root);

    const refSkills = localPack.meta.references?.skills ?? [];
    if (refSkills.length > 0) {
      for (const rel of refSkills) {
        const fileName = basename(rel);
        if (fileName !== "SKILL.md") {
          throw new Error(`pack.references.skills entries must point to SKILL.md: ${rel}`);
        }
        await assertRefFile(root, rel, { markdownOnly: true });
        const itemId = basename(join(rel, ".."));
        skills.set(itemId, { source: `path:${join(root, rel, "..")}` });
      }
    } else {
      for (const skill of localPack.skills) {
        skills.set(skill.itemId, { source: `path:${skill.dir}` });
      }
    }

    const mcpRefs = localPack.meta.references?.mcp ?? [];
    if (mcpRefs.length > 0) {
      for (const rel of mcpRefs) {
        const abs = await assertRefFile(root, rel);
        const entries = await loadMcpServersFromFile(abs);
        for (const entry of entries) mcp.set(entry.name, entry.server);
      }
    } else {
      const mcpServers = await loadPackMcpServers(root);
      for (const entry of mcpServers) {
        mcp.set(entry.name, entry.server);
      }
    }

    const commandRefs = localPack.meta.references?.commands ?? (await listFiles(join(root, "commands"), { markdownOnly: true })).map((n) => `commands/${n}`);
    for (const rel of commandRefs) {
      await assertRefFile(root, rel, { markdownOnly: true });
      const name = basename(rel);
      claudeFiles[`.claude/commands/${name}`] = { source: `path:${join(root, rel)}` };
    }

    const hookRefs = localPack.meta.references?.hooks ?? (await listFiles(join(root, "hooks"))).map((n) => `hooks/${n}`);
    for (const rel of hookRefs) {
      await assertRefFile(root, rel);
      const name = basename(rel);
      claudeFiles[`.claude/hooks/${name}`] = {
        source: `path:${join(root, rel)}`,
        executable: true,
      };
    }

    const agentRefs = localPack.meta.references?.agents ?? (await listFiles(join(root, "agents"), { markdownOnly: true })).map((n) => `agents/${n}`);
    for (const rel of agentRefs) {
      await assertRefFile(root, rel, { markdownOnly: true });
      const name = basename(rel);
      claudeFiles[`.claude/agents/${name}`] = { source: `path:${join(root, rel)}` };
    }
  }

  return { skills, mcp, claudeFiles };
}

function assertNoPathCollisions(
  existing: Record<string, DotfilesClientFileDef>,
  incoming: Record<string, DotfilesClientFileDef>,
  label: string,
): void {
  for (const p of Object.keys(incoming)) {
    if (existing[p]) {
      throw new Error(`duplicate claude file path in dotfiles config: ${p} (${label})`);
    }
  }
}

export function resolveDotfilesConfigPath(params?: { cwd?: string; explicitPath?: string | null }): string | null {
  const explicit = params?.explicitPath ?? null;
  if (explicit) return explicit;

  const envPath = process.env.REPLIX_DOTFILES_CONFIG_JSON;
  if (envPath) return envPath;

  const cwd = params?.cwd ?? process.cwd();
  const localPath = join(cwd, ".replix", "packs.json");
  if (existsSync(localPath)) return localPath;

  return null;
}

export async function loadDotfilesRegistryFromEnv(params?: {
  cwd?: string;
  dotfilesConfigPath?: string | null;
}): Promise<DotfilesRegistry> {
  const p = resolveDotfilesConfigPath({ cwd: params?.cwd, explicitPath: params?.dotfilesConfigPath ?? null });
  if (!p) {
    return { skills: new Map(), mcp: new Map(), clients: new Map(), plugins: new Map(), vars: {}, strictEnv: true };
  }
  const cfg = await loadDotfilesConfigFromPath(p);

  const packs = await buildRegistryFromPacks(cfg.packs);

  // Pack-first, direct dotfiles entries override pack-provided defs.
  const skills = new Map([...packs.skills.entries(), ...Object.entries(cfg.skills ?? {})].sort((a, b) => a[0].localeCompare(b[0])));
  const mcp = new Map([...packs.mcp.entries(), ...Object.entries(cfg.mcp ?? {})].sort((a, b) => a[0].localeCompare(b[0])));

  const clientObj: Record<string, DotfilesClientDef> = { ...(cfg.clients ?? {}) };
  const explicitClaudeFiles = { ...(clientObj.claude?.files ?? {}) };
  const packClaudeFiles = packs.claudeFiles;
  const legacyClaudeFiles = mapArtifactsToClaudeFiles(cfg.claude);
  const canonicalArtifactFiles = mapArtifactsToClaudeFiles(cfg.artifacts);

  assertNoPathCollisions(explicitClaudeFiles, packClaudeFiles, "packs");
  assertNoPathCollisions(explicitClaudeFiles, legacyClaudeFiles, "claude.*");
  assertNoPathCollisions(explicitClaudeFiles, canonicalArtifactFiles, "artifacts.*");

  // precedence: packs < legacy claude < canonical artifacts
  const claudeFiles = {
    ...packClaudeFiles,
    ...legacyClaudeFiles,
    ...canonicalArtifactFiles,
  };

  if (Object.keys(claudeFiles).length > 0) {
    clientObj.claude = {
      ...(clientObj.claude ?? {}),
      files: {
        ...explicitClaudeFiles,
        ...claudeFiles,
      },
    };
  }

  const clients = new Map(Object.entries(clientObj).sort((a, b) => a[0].localeCompare(b[0])));
  const plugins = new Map(Object.entries(cfg.plugins ?? {}).sort((a, b) => a[0].localeCompare(b[0])));

  return {
    skills,
    mcp,
    clients,
    plugins,
    vars: cfg.vars ?? {},
    strictEnv: cfg.strictEnv ?? true,
  };
}
