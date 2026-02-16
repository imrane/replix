import type { ClaudeSkillInput } from "../emitters/claude";
import type { McpServerInput } from "../emitters/mcp";
import type { OpenCodeAssetInput } from "../emitters/opencode";

export type OutputPluginContext = {
  repoRoot: string;
  claudeSkills?: ClaudeSkillInput[];
  mcpServers?: McpServerInput[];
  codexConfigToml?: string;
  openCodeAssets?: OpenCodeAssetInput[];
};

export type OutputPlugin = {
  id: "claude" | "mcp" | "codex" | "opencode";
  desiredPaths: (ctx: OutputPluginContext) => string[];
  emit: (ctx: OutputPluginContext) => Promise<void>;
};
