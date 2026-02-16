export type EnableSpec = {
  skills: string[];
  mcp: string[];
  commands: string[];
  hooks: string[];
  agents: string[];
  settings: string[];
};

function assertStringArray(x: unknown, name: string): string[] {
  if (x === undefined) return [];
  if (!Array.isArray(x)) throw new Error(`${name} must be an array`);
  for (const [i, v] of x.entries()) {
    if (typeof v !== "string") throw new Error(`${name}[${i}] must be a string`);
  }
  return x;
}

export function parseEnableSpec(input: unknown): EnableSpec {
  if (input === undefined || input === null) {
    return { skills: [], mcp: [], commands: [], hooks: [], agents: [], settings: [] };
  }
  if (typeof input !== "object" || Array.isArray(input))
    throw new Error("enable must be an object");

  const obj = input as Record<string, unknown>;
  return {
    skills: assertStringArray(obj.skills, "enable.skills"),
    mcp: assertStringArray(obj.mcp, "enable.mcp"),
    commands: assertStringArray(obj.commands, "enable.commands"),
    hooks: assertStringArray(obj.hooks, "enable.hooks"),
    agents: assertStringArray(obj.agents, "enable.agents"),
    settings: assertStringArray(obj.settings, "enable.settings"),
  };
}
