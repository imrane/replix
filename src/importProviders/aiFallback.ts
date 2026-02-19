import type { ImportProviderItem, NormalizedImport } from "./types";

const DRAFT_KINDS = new Set(["repo", "manifest", "docs", "article", "unknown"] as const);
const CONFIDENCE = new Set(["high", "medium", "low"] as const);

function isObject(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null;
}

function parseNormalized(stdout: string): Pick<NormalizedImport, "draft" | "confidence"> {
  let parsed: unknown;
  try {
    parsed = JSON.parse(stdout);
  } catch {
    throw new Error("AI normalizer returned non-JSON output");
  }

  if (!isObject(parsed)) throw new Error("AI normalizer output must be a JSON object");

  const draft = parsed.draft;
  if (!isObject(draft)) throw new Error("AI normalizer output missing draft object");

  const kind = draft.kind;
  const value = draft.value;
  if (typeof kind !== "string" || !DRAFT_KINDS.has(kind as any)) {
    throw new Error("AI normalizer draft.kind is invalid");
  }
  if (typeof value !== "string" || value.trim() === "") {
    throw new Error("AI normalizer draft.value must be a non-empty string");
  }

  const confidenceRaw = parsed.confidence;
  const confidence = typeof confidenceRaw === "string" && CONFIDENCE.has(confidenceRaw as any) ? (confidenceRaw as any) : "low";

  return {
    draft: { kind: kind as any, value },
    confidence,
  };
}

export function runAiFallbackNormalizer(params: {
  item: ImportProviderItem;
  command?: string;
}): Pick<NormalizedImport, "draft" | "confidence"> | null {
  const cmd = params.command ?? process.env.REPLIX_IMPORT_AI_NORMALIZER_CMD;
  if (!cmd) return null;

  const payload = {
    sourceId: params.item.id,
    sourceUrl: params.item.sourceUrl,
    title: params.item.title,
    content: params.item.content ?? "",
    metadata: params.item.metadata ?? {},
  };

  const out = Bun.spawnSync({
    cmd: ["sh", "-c", cmd],
    env: {
      ...process.env,
      REPLIX_IMPORT_NORMALIZE_PAYLOAD: JSON.stringify(payload),
    },
    stdout: "pipe",
    stderr: "pipe",
  });

  if (out.exitCode !== 0) {
    const err = out.stderr.toString().trim() || out.stdout.toString().trim() || `exit code ${out.exitCode}`;
    throw new Error(`AI normalizer command failed: ${err}`);
  }

  return parseNormalized(out.stdout.toString().trim());
}
