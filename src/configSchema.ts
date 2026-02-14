export type NexusConfigV1 = {
  version: 1;
  repoRoot: string | null;
  clients: string[];
  enable: {
    skills: string[];
    mcp: string[];
  };
  sources: {
    skills: Record<string, { path: string }>;
    mcp: Record<string, unknown>;
  };
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

  const sources = input.sources;
  if (!isRecord(sources)) throw new Error("config.sources must be an object");
  const srcSkills = sources.skills;
  if (!isRecord(srcSkills)) throw new Error("config.sources.skills must be an object");

  for (const [k, v] of Object.entries(srcSkills)) {
    if (!isRecord(v) || typeof v.path !== "string") {
      throw new Error(`config.sources.skills.${k} must be { path: string }`);
    }
  }

  const srcMcp = sources.mcp;
  if (!isRecord(srcMcp)) throw new Error("config.sources.mcp must be an object");

  return {
    version: 1,
    repoRoot,
    clients,
    enable: { skills, mcp },
    sources: {
      skills: srcSkills as Record<string, { path: string }>,
      mcp: srcMcp,
    },
  };
}
