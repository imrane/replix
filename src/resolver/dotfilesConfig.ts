export type DotfilesSkillDef = {
  source: string;
  description?: string;
  tags?: string[];
};

export type DotfilesMcpDef = {
  command: string;
  args?: string[];
  env?: Record<string, string>;
};

export type DotfilesConfig = {
  skills?: Record<string, DotfilesSkillDef>;
  mcp?: Record<string, DotfilesMcpDef>;
  vars?: Record<string, string>;
  strictEnv?: boolean;
};

export type DotfilesRegistry = {
  skills: Map<string, DotfilesSkillDef>;
  mcp: Map<string, DotfilesMcpDef>;
  vars: Record<string, string>;
  strictEnv: boolean;
};

export async function loadDotfilesConfigFromPath(path: string): Promise<DotfilesConfig> {
  const raw = await Bun.file(path).text();
  const json = JSON.parse(raw) as DotfilesConfig;
  return json;
}

export async function loadDotfilesRegistryFromEnv(): Promise<DotfilesRegistry> {
  const p = process.env.NEXUS_DOTFILES_CONFIG_JSON;
  if (!p) {
    return { skills: new Map(), mcp: new Map(), vars: {}, strictEnv: true };
  }
  const cfg = await loadDotfilesConfigFromPath(p);

  const skills = new Map(Object.entries(cfg.skills ?? {}).sort((a, b) => a[0].localeCompare(b[0])));
  const mcp = new Map(Object.entries(cfg.mcp ?? {}).sort((a, b) => a[0].localeCompare(b[0])));

  return {
    skills,
    mcp,
    vars: cfg.vars ?? {},
    strictEnv: cfg.strictEnv ?? true,
  };
}
