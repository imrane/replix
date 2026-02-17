export type ReplixOverridesV1 = {
  skills: Record<string, { path: string }>;
  mcp: Record<string, unknown>;
};

export type ReplixEnableV1 = {
  skills: string[];
  mcp: string[];
  commands?: string[];
  hooks?: string[];
  agents?: string[];
  settings?: string[];
  clients?: Record<string, { files?: string[] }>;
};

export type ReplixConfigV1 = {
  version: 1;
  repoRoot: string | null;
  clients: string[];
  enable: ReplixEnableV1;
  vars: Record<string, string>;
  strictEnv?: boolean;
  layout?: "direct" | "generated";
  cleanup?: "owned-only" | "full";
  // v1 used `sources.*`; v2 naming is `overrides.*` (repo-local only).
  // parseReplixConfig accepts either, but returns normalized `overrides`.
  overrides: ReplixOverridesV1;
};

function isRecord(x: unknown): x is Record<string, unknown> {
  return typeof x === "object" && x !== null && !Array.isArray(x);
}

function assertStringArray(x: unknown, name: string): string[] {
  if (x === undefined) return [];
  if (!Array.isArray(x) || !x.every((v) => typeof v === "string")) {
    throw new Error(`${name} must be string[]`);
  }
  return x as string[];
}

function isSupportedCodexRepoPath(file: string): boolean {
  return (
    file === ".codex/config.toml" ||
    file.startsWith(".agents/skills/") ||
    file.startsWith(".codex/skills/")
  );
}

function validateClientFilePaths(client: string, files: string[], name: string): void {
  // Codex conformance: core supports .codex/config.toml, plus shim skill roots under .agents/skills and .codex/skills.
  if (client === "codex") {
    for (const file of files) {
      if (!isSupportedCodexRepoPath(file)) {
        throw new Error(
          `${name} contains unsupported codex repo file path: ${file} (supported: .codex/config.toml, .agents/skills/**, .codex/skills/**)`,
        );
      }
    }
  }
}

export function parseReplixConfig(input: unknown): ReplixConfigV1 {
  if (!isRecord(input)) throw new Error("config must be an object");
  if (input.version !== 1) throw new Error("config.version must be 1");

  const repoRoot = input.repoRoot;
  if (!(repoRoot === null || typeof repoRoot === "string")) {
    throw new Error("config.repoRoot must be string|null");
  }

  const clients = input.clients;
  if (!Array.isArray(clients) || !clients.every((c) => typeof c === "string")) {
    throw new Error("config.clients must be string[]");
  }

  const enable = input.enable;
  if (!isRecord(enable)) throw new Error("config.enable must be an object");
  const skills = assertStringArray(enable.skills, "config.enable.skills");
  const mcp = assertStringArray(enable.mcp, "config.enable.mcp");
  const commands = assertStringArray(enable.commands, "config.enable.commands");
  const hooks = assertStringArray(enable.hooks, "config.enable.hooks");
  const agents = assertStringArray(enable.agents, "config.enable.agents");
  const settings = assertStringArray(enable.settings, "config.enable.settings");

  const enableClientsRaw = (enable as any).clients;
  if (!(enableClientsRaw === undefined || isRecord(enableClientsRaw))) {
    throw new Error("config.enable.clients must be an object");
  }
  const enableClients: Record<string, { files?: string[] }> = {};
  for (const [client, v] of Object.entries(enableClientsRaw ?? {})) {
    if (!isRecord(v)) throw new Error(`config.enable.clients.${client} must be an object`);
    const filesRaw = (v as any).files;
    if (!(filesRaw === undefined || (Array.isArray(filesRaw) && filesRaw.every((f) => typeof f === "string")))) {
      throw new Error(`config.enable.clients.${client}.files must be string[]`);
    }
    const files = filesRaw as string[] | undefined;
    if (files) validateClientFilePaths(client, files, `config.enable.clients.${client}.files`);
    enableClients[client] = { files };
  }

  const overridesRaw = (input as any).overrides ?? (input as any).sources;
  if (!isRecord(overridesRaw)) {
    throw new Error(
      "config.overrides must be an object (or legacy config.sources). " +
        "Overrides are repo-local paths only; dotfiles registry is loaded via REPLIX_DOTFILES_CONFIG_JSON.",
    );
  }

  const overrideSkills = (overridesRaw as any).skills;
  if (!isRecord(overrideSkills)) throw new Error("config.overrides.skills must be an object");

  for (const [k, v] of Object.entries(overrideSkills)) {
    if (!isRecord(v) || typeof (v as any).path !== "string") {
      throw new Error(`config.overrides.skills.${k} must be { path: string }`);
    }
  }

  const overrideMcp = (overridesRaw as any).mcp;
  if (!isRecord(overrideMcp)) throw new Error("config.overrides.mcp must be an object");

  const varsRaw = (input as any).vars;
  if (!(varsRaw === undefined || isRecord(varsRaw))) {
    throw new Error("config.vars must be an object");
  }
  const vars: Record<string, string> = {};
  for (const [k, v] of Object.entries(varsRaw ?? {})) {
    if (typeof v !== "string") throw new Error(`config.vars.${k} must be a string`);
    vars[k] = v;
  }

  const strictEnvRaw = (input as any).strictEnv;
  if (!(strictEnvRaw === undefined || typeof strictEnvRaw === "boolean")) {
    throw new Error("config.strictEnv must be a boolean");
  }

  const layoutRaw = (input as any).layout;
  if (!(layoutRaw === undefined || layoutRaw === "direct" || layoutRaw === "generated")) {
    throw new Error('config.layout must be "direct"|"generated"');
  }

  const cleanupRaw = (input as any).cleanup;
  if (!(cleanupRaw === undefined || cleanupRaw === "owned-only" || cleanupRaw === "full")) {
    throw new Error('config.cleanup must be "owned-only"|"full"');
  }

  return {
    version: 1,
    repoRoot,
    clients,
    enable: { skills, mcp, commands, hooks, agents, settings, clients: enableClients },
    vars,
    strictEnv: strictEnvRaw,
    layout: layoutRaw,
    cleanup: cleanupRaw,
    overrides: {
      skills: overrideSkills as Record<string, { path: string }>,
      mcp: overrideMcp,
    },
  };
}
