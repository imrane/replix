import type { EnableSpec } from "./enable";

export type AvailableIds = {
  skills: Set<string>;
  mcp: Set<string>;
};

export type ResolvedEnable = {
  skills: string[];
  mcp: string[];
};

export function resolveEnabled(enable: EnableSpec, available: AvailableIds): ResolvedEnable {
  for (const id of enable.skills) {
    if (!available.skills.has(id)) {
      throw new Error(`missing enabled skill: ${id}`);
    }
  }
  for (const id of enable.mcp) {
    if (!available.mcp.has(id)) {
      throw new Error(`missing enabled mcp: ${id}`);
    }
  }

  return { skills: [...enable.skills], mcp: [...enable.mcp] };
}
