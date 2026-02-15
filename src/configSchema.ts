export type NexusOverridesV1 = {
  skills: Record<string, { path: string }>;
  mcp: Record<string, unknown>;
};

export type NexusConfigV1 = {
  version: 1;
  repoRoot: string | null;
  clients: string[];
  enable: {
    skills: string[];
    mcp: string[];
  };
  vars: Record<string, string>;
  strictEnv?: boolean;
  layout?: "direct" | "generated";
  cleanup?: "owned-only" | "full";
  // v1 used `sources.*`; v2 naming is `overrides.*` (repo-local only).
  // parseNexusConfig accepts either, but returns normalized `overrides`.
  overrides: NexusOverridesV1;
};

function isRecord(x: unknown): x is Record<string, unknown> {
  return typeof x === "object" && x !== null && !Array.isArray(x);
}

export function parseNexusConfig(input: unknown): NexusConfigV1 {
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
  const skills = enable.skills;
  const mcp = enable.mcp;
  if (!Array.isArray(skills) || !skills.every((s) => typeof s === "string")) {
    throw new Error("config.enable.skills must be string[]");
  }
  if (!Array.isArray(mcp) || !mcp.every((s) => typeof s === "string")) {
    throw new Error("config.enable.mcp must be string[]");
  }

  const overridesRaw = (input as any).overrides ?? (input as any).sources;
  if (!isRecord(overridesRaw)) {
    throw new Error(
      "config.overrides must be an object (or legacy config.sources). " +
        "Overrides are repo-local paths only; dotfiles registry is loaded via NEXUS_DOTFILES_CONFIG_JSON.",
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
    enable: { skills, mcp },
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
