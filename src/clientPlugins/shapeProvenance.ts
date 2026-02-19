import { readFile } from "node:fs/promises";

export type ShapeSnapshot = {
  client: string;
  capturedAt: string;
  versionNote: string;
  sources: string[];
};

export type ShapeRefreshChecklist = {
  client: string;
  capturedAt: string;
  ageDays: number;
  dueForRefresh: boolean;
  sources: string[];
  steps: string[];
};

export type ShapeValidationResult = {
  ok: boolean;
  errors: string[];
  warnings: string[];
  checklist: ShapeRefreshChecklist | null;
};

const WARN_THRESHOLD_DAYS = 20;

export async function validateShapeSnapshot(
  path: string,
  maxAgeDays = 30,
): Promise<ShapeValidationResult> {
  const raw = await readFile(path, "utf8");
  const parsed = JSON.parse(raw) as Partial<ShapeSnapshot>;
  const errors: string[] = [];
  const warnings: string[] = [];
  let checklist: ShapeRefreshChecklist | null = null;

  if (!parsed.client || typeof parsed.client !== "string") errors.push("missing client");
  if (!parsed.versionNote || typeof parsed.versionNote !== "string") errors.push("missing versionNote");

  const sources = Array.isArray(parsed.sources) ? parsed.sources : [];
  if (sources.length === 0) {
    errors.push("missing sources");
  } else {
    for (const s of sources) {
      if (typeof s !== "string" || !s.startsWith("http")) {
        errors.push(`invalid source url: ${String(s)}`);
      }
    }
  }

  let ageDays = 0;
  let capturedAt = parsed.capturedAt ?? "";

  if (!capturedAt || typeof capturedAt !== "string") {
    errors.push("missing capturedAt");
  } else {
    const t = Date.parse(capturedAt);
    if (Number.isNaN(t)) {
      errors.push("invalid capturedAt");
    } else {
      ageDays = (Date.now() - t) / (1000 * 60 * 60 * 24);
      if (ageDays > maxAgeDays) {
        errors.push(`snapshot too old (${Math.floor(ageDays)}d, max ${maxAgeDays}d)`);
      } else if (ageDays > WARN_THRESHOLD_DAYS) {
        warnings.push(
          `snapshot approaching expiry (${Math.floor(ageDays)}d old, expires at ${maxAgeDays}d)`,
        );
      }
    }
  }

  const client = parsed.client ?? "unknown";
  const dueForRefresh = ageDays > WARN_THRESHOLD_DAYS;

  if (dueForRefresh || errors.length > 0) {
    checklist = {
      client,
      capturedAt,
      ageDays: Math.floor(ageDays),
      dueForRefresh,
      sources: sources.filter((s) => typeof s === "string"),
      steps: buildRefreshSteps(client, sources.filter((s) => typeof s === "string")),
    };
  }

  return {
    ok: errors.length === 0,
    errors,
    warnings,
    checklist,
  };
}

function buildRefreshSteps(client: string, sources: string[]): string[] {
  const steps: string[] = [
    `1. Review current ${client} docs at the source URLs below`,
    ...sources.map((s) => `   - ${s}`),
    `2. Note any new fields, changed paths, or removed features`,
    `3. Update src/clientPlugins/<client>/client-shape.snapshot.json:`,
    `   - Set "capturedAt" to today's ISO date (e.g. ${new Date().toISOString().slice(0, 19)}Z)`,
    `   - Update "versionNote" with the current client version/note`,
    `   - Update "keyShapes" and "scopes" to reflect any schema changes`,
    `4. Run: replix spec validate-client-shapes`,
    `5. If shape changed, update corresponding emitter/adapter for ${client}`,
  ];
  return steps;
}
