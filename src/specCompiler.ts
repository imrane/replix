import { parseClientSpecSchema, type ClientSpecSchema, type SpecArtifactKind } from "./specSchema";

export type ClientSpecSnapshot = {
  client: string;
  version?: string;
  source?: {
    docs?: string[];
    repo?: string;
  };
  artifacts: Array<{
    kind: SpecArtifactKind;
    path: string;
    ownerMarker?: string;
    cleanup?: "owned-only" | "full";
  }>;
};

export function compileClientSpec(snapshot: ClientSpecSnapshot): ClientSpecSchema {
  const normalized = {
    client: snapshot.client,
    version: snapshot.version ?? "unversioned",
    source: snapshot.source ?? {},
    artifacts: snapshot.artifacts.map((a) => ({
      ...a,
      cleanup: a.cleanup ?? "owned-only",
    })),
  };

  return parseClientSpecSchema(normalized);
}
