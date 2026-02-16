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

export type DotfilesConfig = {
  skills?: Record<string, DotfilesSkillDef>;
  mcp?: Record<string, DotfilesMcpDef>;
  clients?: Record<string, DotfilesClientDef>;
  claude?: DotfilesClaudeDef;
  vars?: Record<string, string>;
  strictEnv?: boolean;
};

export type DotfilesRegistry = {
  skills: Map<string, DotfilesSkillDef>;
  mcp: Map<string, DotfilesMcpDef>;
  clients: Map<string, DotfilesClientDef>;
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

  // Convenience: single-file repo settings
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

export async function loadDotfilesRegistryFromEnv(): Promise<DotfilesRegistry> {
  const p = process.env.NEXUS_DOTFILES_CONFIG_JSON;
  if (!p) {
    return { skills: new Map(), mcp: new Map(), clients: new Map(), vars: {}, strictEnv: true };
  }
  const cfg = await loadDotfilesConfigFromPath(p);

  const skills = new Map(Object.entries(cfg.skills ?? {}).sort((a, b) => a[0].localeCompare(b[0])));
  const mcp = new Map(Object.entries(cfg.mcp ?? {}).sort((a, b) => a[0].localeCompare(b[0])));

  const clientObj: Record<string, DotfilesClientDef> = { ...(cfg.clients ?? {}) };
  const claudeFiles = toClaudeClientFiles(cfg);
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

  return {
    skills,
    mcp,
    clients,
    vars: cfg.vars ?? {},
    strictEnv: cfg.strictEnv ?? true,
  };
}
