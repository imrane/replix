import { createHash } from "node:crypto";
import type { EnableSpec } from "./enable";

export type StateHashInput = {
  packs: Array<{ id: string; rev: string }>;
  enable: EnableSpec;
  clients: string[];
  layout: string;
};

function stable(obj: any): any {
  if (Array.isArray(obj)) return obj.map(stable);
  if (obj && typeof obj === "object") {
    const out: Record<string, any> = {};
    for (const k of Object.keys(obj).sort()) out[k] = stable(obj[k]);
    return out;
  }
  return obj;
}

export function computeStateHash(input: StateHashInput): string {
  const normalized = stable({
    ...input,
    packs: [...input.packs].sort((a, b) => a.id.localeCompare(b.id)),
    clients: [...input.clients].sort(),
    enable: {
      skills: [...input.enable.skills].sort(),
      mcp: [...input.enable.mcp].sort(),
    },
  });

  const json = JSON.stringify(normalized);
  return createHash("sha256").update(json).digest("hex");
}
