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
  commands?: Map<string, { kind: "command"; itemId: string }>;
  hooks?: Map<string, { kind: "hook"; itemId: string }>;
  agents?: Map<string, { kind: "agent"; itemId: string }>;
  settings?: Map<string, { kind: "setting"; itemId: string }>;
};

export type CompileInput = {
  available: AvailableItems;
  enable: EnableSpec;
};

export type ArtifactNode = {
  id: string;
  item: { kind: "command" | "hook" | "agent" | "setting"; itemId: string };
};

export type CanonicalGraph = {
  skills: SkillNode[];
  mcp: McpNode[];
  commands: ArtifactNode[];
  hooks: ArtifactNode[];
  agents: ArtifactNode[];
  settings: ArtifactNode[];
};

export function compileGraph(input: CompileInput): CanonicalGraph {
  const { available, enable } = input;
  const commandsMap = available.commands ?? new Map<string, { kind: "command"; itemId: string }>();
  const hooksMap = available.hooks ?? new Map<string, { kind: "hook"; itemId: string }>();
  const agentsMap = available.agents ?? new Map<string, { kind: "agent"; itemId: string }>();
  const settingsMap = available.settings ?? new Map<string, { kind: "setting"; itemId: string }>();

  const resolved = resolveEnabled(enable, {
    skills: new Set(available.skills.keys()),
    mcp: new Set(available.mcp.keys()),
    commands: new Set(commandsMap.keys()),
    hooks: new Set(hooksMap.keys()),
    agents: new Set(agentsMap.keys()),
    settings: new Set(settingsMap.keys()),
  });

  // Safety: ensure no id collisions across ALL enabled outputs.
  ensureNoCollisions([
    ...resolved.skills,
    ...resolved.mcp,
    ...resolved.commands,
    ...resolved.hooks,
    ...resolved.agents,
    ...resolved.settings,
  ]);

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

  const commands: ArtifactNode[] = resolved.commands.map((id) => {
    const item = commandsMap.get(id);
    if (!item) throw new Error(`missing enabled command: ${id}`);
    return { id, item };
  });

  const hooks: ArtifactNode[] = resolved.hooks.map((id) => {
    const item = hooksMap.get(id);
    if (!item) throw new Error(`missing enabled hook: ${id}`);
    return { id, item };
  });

  const agents: ArtifactNode[] = resolved.agents.map((id) => {
    const item = agentsMap.get(id);
    if (!item) throw new Error(`missing enabled agent: ${id}`);
    return { id, item };
  });

  const settings: ArtifactNode[] = resolved.settings.map((id) => {
    const item = settingsMap.get(id);
    if (!item) throw new Error(`missing enabled setting: ${id}`);
    return { id, item };
  });

  return { skills, mcp, commands, hooks, agents, settings };
}
