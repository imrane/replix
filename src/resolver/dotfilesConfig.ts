import { readdir, stat } from "node:fs/promises";
import { join } from "node:path";
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

export type DotfilesClaudeDef = {
  // Convenience sections for repo-scoped Claude Code artifacts.
  commands?: Record<string, DotfilesClientFileDef>;
  hooks?: Record<string, DotfilesClientFileDef>;
  agents?: Record<string, DotfilesClientFileDef>;

  // Settings are single files (not directories).
  // These map to `.claude/settings.json` and `.claude/settings.local.json` in the repo.
  settings?: DotfilesClientFileDef;
  settingsLocal?: DotfilesClientFileDef;
};

export type DotfilesPluginDef = {
  module: string;
};

export type DotfilesPackDef = {
  source: string;
  allowUnpinned?: boolean;
};

export type DotfilesConfig = {
  packs?: DotfilesPackDef[];
  skills?: Record<string, DotfilesSkillDef>;
  mcp?: Record<string, DotfilesMcpDef>;
  clients?: Record<string, DotfilesClientDef>;
  plugins?: Record<string, DotfilesPluginDef>;
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

function toClaudeClientFiles(cfg: DotfilesConfig): Record<string, DotfilesClientFileDef> {
  const out: Record<string, DotfilesClientFileDef> = { ...(cfg.clients?.claude?.files ?? {}) };

  const sections: Array<["commands" | "hooks" | "agents", string]> = [
    ["commands", ".claude/commands"],
    ["hooks", ".claude/hooks"],
    ["agents", ".claude/agents"],
  ];

  for (const [section, base] of sections) {
    const defs = cfg.claude?.[section] ?? {};
    for (const [name, def] of Object.entries(defs)) {
      const rel = `${base}/${name}`.replace(/\/+/g, "/").replace(/^\/+/, "");
      if (out[rel]) throw new Error(`duplicate claude file path in dotfiles config: ${rel}`);
      out[rel] = def;
    }
  }

  if (cfg.claude?.settings) {
    const rel = ".claude/settings.json";
    if (out[rel]) throw new Error(`duplicate claude file path in dotfiles config: ${rel}`);
    out[rel] = cfg.claude.settings;
  }

  if (cfg.claude?.settingsLocal) {
    const rel = ".claude/settings.local.json";
    if (out[rel]) throw new Error(`duplicate claude file path in dotfiles config: ${rel}`);
    out[rel] = cfg.claude.settingsLocal;
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
    for (const skill of localPack.skills) {
      skills.set(skill.itemId, { source: `path:${skill.dir}` });
    }

    const mcpServers = await loadPackMcpServers(root);
    for (const entry of mcpServers) {
      mcp.set(entry.name, entry.server);
    }

    const commands = await listFiles(join(root, "commands"), { markdownOnly: true });
    for (const name of commands) {
      claudeFiles[`.claude/commands/${name}`] = { source: `path:${join(root, "commands", name)}` };
    }

    const hooks = await listFiles(join(root, "hooks"));
    for (const name of hooks) {
      claudeFiles[`.claude/hooks/${name}`] = {
        source: `path:${join(root, "hooks", name)}`,
        executable: true,
      };
    }

    const agents = await listFiles(join(root, "agents"), { markdownOnly: true });
    for (const name of agents) {
      claudeFiles[`.claude/agents/${name}`] = { source: `path:${join(root, "agents", name)}` };
    }
  }

  return { skills, mcp, claudeFiles };
}

export async function loadDotfilesRegistryFromEnv(): Promise<DotfilesRegistry> {
  const p = process.env.NEXUS_DOTFILES_CONFIG_JSON;
  if (!p) {
    return { skills: new Map(), mcp: new Map(), clients: new Map(), plugins: new Map(), vars: {}, strictEnv: true };
  }
  const cfg = await loadDotfilesConfigFromPath(p);

  const packs = await buildRegistryFromPacks(cfg.packs);

  // Pack-first, direct dotfiles entries override pack-provided defs.
  const skills = new Map([...packs.skills.entries(), ...Object.entries(cfg.skills ?? {})].sort((a, b) => a[0].localeCompare(b[0])));
  const mcp = new Map([...packs.mcp.entries(), ...Object.entries(cfg.mcp ?? {})].sort((a, b) => a[0].localeCompare(b[0])));

  const clientObj: Record<string, DotfilesClientDef> = { ...(cfg.clients ?? {}) };
  const claudeFiles = {
    ...packs.claudeFiles,
    ...toClaudeClientFiles(cfg),
  };

  if (Object.keys(claudeFiles).length > 0) {
    clientObj.claude = {
      ...(clientObj.claude ?? {}),
      files: {
        ...(clientObj.claude?.files ?? {}),
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
