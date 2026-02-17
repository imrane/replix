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
      join(skillsRoot, ".replix-managed"),
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
  desiredPaths: ({ repoRoot, codexConfigToml, claudeSkills = [], mcpServers = [] }) => {
    const configPath = typeof codexConfigToml === "string" || mcpServers.length > 0 ? [join(repoRoot, ".codex", "config.toml")] : [];
    const skillPaths = claudeSkills.flatMap((s) => [
      join(repoRoot, ".agents", "skills", s.itemId),
      join(repoRoot, ".agents", "skills", s.itemId, "SKILL.md"),
    ]);
    return [...configPath, ...skillPaths];
  },
  emit: async ({ repoRoot, codexConfigToml, claudeSkills = [], mcpServers = [] }) => {
    await emitCodex({ repoRoot, configToml: codexConfigToml, skills: claudeSkills, mcpServers });
  },
});

registerOutputPlugin({
  id: "opencode",
  desiredPaths: ({ repoRoot, openCodeAssets = [], claudeSkills = [], mcpServers = [] }) => {
    const root = join(repoRoot, ".opencode");
    const skillPaths = claudeSkills.flatMap((s) => [join(root, "skills", s.itemId), join(root, "skills", s.itemId, "SKILL.md")]);
    const mcpConfig = mcpServers.length > 0 ? [join(repoRoot, "opencode.json")] : [];
    return [join(root, ".replix-managed"), ...openCodeAssets.map((asset) => join(root, asset.kind, asset.fileName)), ...skillPaths, ...mcpConfig];
  },
  emit: async ({ repoRoot, openCodeAssets = [], claudeSkills = [], mcpServers = [] }) => {
    await emitOpenCode({ repoRoot, assets: openCodeAssets, skills: claudeSkills, mcpServers });
  },
});
