import { writeFile } from "node:fs/promises";
import { join } from "node:path";

export type McpServerDef = {
  command: string;
  args?: string[];
  env?: Record<string, string>;
};

export type McpServerInput = {
  id: string;
  name: string;
  server: McpServerDef;
};

export type EmitMcpInput = {
  repoRoot: string;
  servers: McpServerInput[];
};

export async function emitMcp(input: EmitMcpInput): Promise<void> {
  const outPath = join(input.repoRoot, ".mcp.json");

  const mcpServers: Record<string, McpServerDef> = {};
  for (const s of input.servers) {
    if (!s.name) throw new Error(`mcp server missing name: ${s.id}`);
    mcpServers[s.name] = s.server;
  }

  const payload = {
    __generated_by: "replix",
    mcpServers,
  };

  await writeFile(outPath, JSON.stringify(payload, null, 2) + "\n", "utf8");
}
