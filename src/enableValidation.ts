import type { EnableSpec } from "./enable";

export type AvailableIds = {
  skills: Set<string>;
  mcp: Set<string>;
  commands: Set<string>;
  hooks: Set<string>;
  agents: Set<string>;
  settings: Set<string>;
};

export type ResolvedEnable = {
  skills: string[];
  mcp: string[];
  commands: string[];
  hooks: string[];
  agents: string[];
  settings: string[];
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
  for (const id of enable.commands) {
    if (!available.commands.has(id)) {
      throw new Error(`missing enabled command: ${id}`);
    }
  }
  for (const id of enable.hooks) {
    if (!available.hooks.has(id)) {
      throw new Error(`missing enabled hook: ${id}`);
    }
  }
  for (const id of enable.agents) {
    if (!available.agents.has(id)) {
      throw new Error(`missing enabled agent: ${id}`);
    }
  }
  for (const id of enable.settings) {
    if (!available.settings.has(id)) {
      throw new Error(`missing enabled setting: ${id}`);
    }
  }

  return {
    skills: [...enable.skills],
    mcp: [...enable.mcp],
    commands: [...enable.commands],
    hooks: [...enable.hooks],
    agents: [...enable.agents],
    settings: [...enable.settings],
  };
}
