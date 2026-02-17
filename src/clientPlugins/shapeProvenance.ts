import { readFile } from "node:fs/promises";

export type ShapeSnapshot = {
  client: string;
  capturedAt: string;
  versionNote: string;
  sources: string[];
};

export async function validateShapeSnapshot(path: string, maxAgeDays = 30): Promise<string[]> {
  const raw = await readFile(path, "utf8");
  const parsed = JSON.parse(raw) as Partial<ShapeSnapshot>;
  const errors: string[] = [];

  if (!parsed.client || typeof parsed.client !== "string") errors.push("missing client");
  if (!parsed.versionNote || typeof parsed.versionNote !== "string") errors.push("missing versionNote");
  if (!parsed.capturedAt || typeof parsed.capturedAt !== "string") {
    errors.push("missing capturedAt");
  } else {
    const t = Date.parse(parsed.capturedAt);
    if (Number.isNaN(t)) {
      errors.push("invalid capturedAt");
    } else {
      const ageDays = (Date.now() - t) / (1000 * 60 * 60 * 24);
      if (ageDays > maxAgeDays) errors.push(`snapshot too old (${Math.floor(ageDays)}d)`);
    }
  }

  if (!Array.isArray(parsed.sources) || parsed.sources.length === 0) {
    errors.push("missing sources");
  } else {
    for (const s of parsed.sources) {
      if (typeof s !== "string" || !s.startsWith("http")) {
        errors.push(`invalid source url: ${String(s)}`);
      }
    }
  }

  return errors;
}
