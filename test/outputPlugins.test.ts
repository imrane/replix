import { describe, expect, test } from "bun:test";
import "../src/outputPlugins/builtins";
import { getOutputPlugin } from "../src/outputPlugins/registry";

describe("output plugins", () => {
  test("claude plugin computes managed desired paths", () => {
    const paths = getOutputPlugin("claude").desiredPaths({
      repoRoot: "/tmp/repo",
      claudeSkills: [{ id: "x", itemId: "writer", srcDir: "/tmp/src" }],
    });

    expect(paths).toContain("/tmp/repo/.claude/skills/writer");
    expect(paths).toContain("/tmp/repo/.claude/skills/writer/SKILL.md");
    expect(paths).toContain("/tmp/repo/.claude/skills/.nexus-managed");
  });

  test("mcp plugin omits paths when empty", () => {
    const paths = getOutputPlugin("mcp").desiredPaths({ repoRoot: "/tmp/repo", mcpServers: [] });
    expect(paths).toEqual([]);
  });

  test("codex plugin path gated by config payload", () => {
    const noPath = getOutputPlugin("codex").desiredPaths({ repoRoot: "/tmp/repo" });
    const yesPath = getOutputPlugin("codex").desiredPaths({ repoRoot: "/tmp/repo", codexConfigToml: "# managed\n" });

    expect(noPath).toEqual([]);
    expect(yesPath).toEqual(["/tmp/repo/.codex/config.toml"]);
  });

  test("opencode plugin includes native skills and opencode MCP config paths", () => {
    const paths = getOutputPlugin("opencode").desiredPaths({
      repoRoot: "/tmp/repo",
      claudeSkills: [{ id: "x", itemId: "humanizer", srcDir: "/tmp/src" }],
      mcpServers: [{ id: "m", name: "filesystem", server: { command: "npx" } }],
      openCodeAssets: [],
    });

    expect(paths).toContain("/tmp/repo/.opencode/skills/humanizer");
    expect(paths).toContain("/tmp/repo/.opencode/skills/humanizer/SKILL.md");
    expect(paths).toContain("/tmp/repo/opencode.json");
  });
});
