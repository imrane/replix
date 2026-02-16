import { join } from "node:path";
import { emitClaude } from "../emitters/claude";
import { emitMcp } from "../emitters/mcp";
import { emitCodex } from "../emitters/codex";
import { emitOpenCode } from "../emitters/opencode";
import { registerOutputPlugin } from "./registry";

registerOutputPlugin({
  id: "claude",
  desiredPaths: ({ repoRoot, claudeSkills = [] }) => {
    const skillsRoot = join(repoRoot, ".claude", "skills");
    return [
      ...claudeSkills.flatMap((s) => [join(skillsRoot, s.itemId), join(skillsRoot, s.itemId, "SKILL.md")]),
      join(skillsRoot, ".nexus-managed"),
    ];
  },
  emit: async ({ repoRoot, claudeSkills = [] }) => {
    await emitClaude({ repoRoot, skills: claudeSkills });
  },
});

registerOutputPlugin({
  id: "mcp",
  desiredPaths: ({ repoRoot, mcpServers = [] }) => (mcpServers.length > 0 ? [join(repoRoot, ".mcp.json")] : []),
  emit: async ({ repoRoot, mcpServers = [] }) => {
    if (mcpServers.length === 0) return;
    await emitMcp({ repoRoot, servers: mcpServers });
  },
});

registerOutputPlugin({
  id: "codex",
  desiredPaths: ({ repoRoot, codexConfigToml }) => (typeof codexConfigToml === "string" ? [join(repoRoot, ".codex", "config.toml")] : []),
  emit: async ({ repoRoot, codexConfigToml }) => {
    if (typeof codexConfigToml !== "string") return;
    await emitCodex({ repoRoot, configToml: codexConfigToml });
  },
});

registerOutputPlugin({
  id: "opencode",
  desiredPaths: ({ repoRoot, openCodeAssets = [] }) => {
    const root = join(repoRoot, ".opencode");
    return [join(root, ".nexus-managed"), ...openCodeAssets.map((asset) => join(root, asset.kind, asset.fileName))];
  },
  emit: async ({ repoRoot, openCodeAssets = [] }) => {
    await emitOpenCode({ repoRoot, assets: openCodeAssets });
  },
});
