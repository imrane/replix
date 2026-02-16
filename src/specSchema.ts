export type SpecArtifactKind = "skill" | "mcp" | "command" | "hook" | "agent" | "settings";

export type SpecArtifact = {
  kind: SpecArtifactKind;
  path: string;
  ownerMarker?: string;
  cleanup: "owned-only" | "full";
};

export type ClientSpecSchema = {
  client: string;
  version: string;
  source: {
    docs?: string[];
    repo?: string;
  };
  artifacts: SpecArtifact[];
};

function isRecord(x: unknown): x is Record<string, unknown> {
  return typeof x === "object" && x !== null && !Array.isArray(x);
}

const ROOTS: Record<string, string[]> = {
  claude: [".claude/"],
  codex: [".codex/", ".agents/skills/"],
  opencode: [".opencode/"],
  mcp: [".mcp.json"],
};

function isPathAllowed(client: string, p: string): boolean {
  const roots = ROOTS[client] ?? [];
  return roots.some((r) => p === r || p.startsWith(r));
}

function parseArtifact(raw: unknown, index: number): SpecArtifact {
  if (!isRecord(raw)) throw new Error(`artifacts[${index}] must be object`);

  const kind = raw.kind;
  const path = raw.path;
  const cleanup = raw.cleanup;

  const kinds: SpecArtifactKind[] = ["skill", "mcp", "command", "hook", "agent", "settings"];
  if (!kinds.includes(kind as SpecArtifactKind)) {
    throw new Error(`artifacts[${index}].kind must be one of: ${kinds.join(", ")}`);
  }
  if (typeof path !== "string" || path.length === 0) {
    throw new Error(`artifacts[${index}].path must be non-empty string`);
  }
  if (!(cleanup === "owned-only" || cleanup === "full")) {
    throw new Error(`artifacts[${index}].cleanup must be \"owned-only\"|\"full\"`);
  }

  const ownerMarker = raw.ownerMarker;
  if (!(ownerMarker === undefined || typeof ownerMarker === "string")) {
    throw new Error(`artifacts[${index}].ownerMarker must be string`);
  }

  return {
    kind: kind as SpecArtifactKind,
    path,
    ownerMarker,
    cleanup,
  };
}

export function parseClientSpecSchema(input: unknown): ClientSpecSchema {
  if (!isRecord(input)) throw new Error("spec schema must be object");

  const client = input.client;
  const version = input.version;
  const source = input.source;
  const artifacts = input.artifacts;

  if (typeof client !== "string" || client.length === 0) throw new Error("client must be non-empty string");
  if (typeof version !== "string" || version.length === 0) throw new Error("version must be non-empty string");
  if (!isRecord(source)) throw new Error("source must be object");
  if (!Array.isArray(artifacts)) throw new Error("artifacts must be array");

  const docs = source.docs;
  if (!(docs === undefined || (Array.isArray(docs) && docs.every((d) => typeof d === "string")))) {
    throw new Error("source.docs must be string[]");
  }
  const repo = source.repo;
  if (!(repo === undefined || typeof repo === "string")) {
    throw new Error("source.repo must be string");
  }

  const parsedArtifacts = artifacts.map(parseArtifact);

  for (const [i, a] of parsedArtifacts.entries()) {
    if (!isPathAllowed(client, a.path)) {
      throw new Error(`artifacts[${i}].path is outside allowed roots for client ${client}: ${a.path}`);
    }
  }

  return {
    client,
    version,
    source: {
      docs: docs as string[] | undefined,
      repo: repo as string | undefined,
    },
    artifacts: parsedArtifacts,
  };
}
