import type { EnableSpec } from "./enable";
import { resolveEnabled } from "./enableValidation";
import { ensureNoCollisions } from "./collision";

export type SkillNode = {
  id: string;
  item: { kind: "skill"; itemId: string };
};

export type McpNode = {
  id: string;
  item: { kind: "mcp"; name: string };
};

export type AvailableItems = {
  skills: Map<string, { kind: "skill"; itemId: string }>;
  mcp: Map<string, { kind: "mcp"; name: string }>;
};

export type CompileInput = {
  available: AvailableItems;
  enable: EnableSpec;
};

export type CanonicalGraph = {
  skills: SkillNode[];
  mcp: McpNode[];
};

export function compileGraph(input: CompileInput): CanonicalGraph {
  const { available, enable } = input;

  const resolved = resolveEnabled(enable, {
    skills: new Set(available.skills.keys()),
    mcp: new Set(available.mcp.keys()),
  });

  // Safety: ensure no id collisions across ALL enabled outputs.
  ensureNoCollisions([...resolved.skills, ...resolved.mcp]);

  const skills: SkillNode[] = resolved.skills.map((id) => {
    const item = available.skills.get(id);
    if (!item) throw new Error(`missing enabled skill: ${id}`);
    return { id, item };
  });

  const mcp: McpNode[] = resolved.mcp.map((id) => {
    const item = available.mcp.get(id);
    if (!item) throw new Error(`missing enabled mcp: ${id}`);
    return { id, item };
  });

  return { skills, mcp };
}
