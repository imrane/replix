import { test, expect } from "bun:test";
import { mkdtempSync, writeFileSync, mkdirSync, rmSync, existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { runReplix } from "../src/runReplix";

test("config mode (v2) > opencode path normalization + native outputs", async () => {
  const tmp = mkdtempSync("/tmp/replix-config-opencode-");
  try {
    const repoRoot = join(tmp, "repo");
    const skillRoot = join(tmp, "skills", "humanizer");
    mkdirSync(repoRoot, { recursive: true });
    mkdirSync(skillRoot, { recursive: true });
    writeFileSync(join(skillRoot, "SKILL.md"), "---\nname: humanizer\ndescription: test\n---\n");

    const dotfilesCfgPath = join(tmp, "dotfiles.json");
    process.env.REPLIX_DOTFILES_CONFIG_JSON = dotfilesCfgPath;

    // 1) legacy plural paths normalize to canonical singular dirs
    writeFileSync(
      dotfilesCfgPath,
      JSON.stringify({
        clients: {
          opencode: {
            files: {
              ".opencode/commands/review.md": { text: "# review\n" },
              ".opencode/agents/planner.md": { text: "# planner\n" },
            },
          },
        },
      }),
    );

    const cfgPath = join(tmp, "replix.json");
    writeFileSync(
      cfgPath,
      JSON.stringify({
        version: 1,
        repoRoot,
        clients: ["opencode"],
        enable: {
          skills: [],
          mcp: [],
          clients: { opencode: { files: [".opencode/commands/review.md", ".opencode/agents/planner.md"] } },
        },
        overrides: { skills: {}, mcp: {} },
      }),
    );

    await runReplix({ cwd: repoRoot, configPath: cfgPath });

    expect(existsSync(join(repoRoot, ".opencode", "command", "review.md"))).toBeTrue();
    expect(existsSync(join(repoRoot, ".opencode", "agent", "planner.md"))).toBeTrue();
    expect(existsSync(join(repoRoot, ".opencode", "commands", "review.md"))).toBeFalse();
    expect(existsSync(join(repoRoot, ".opencode", "agents", "planner.md"))).toBeFalse();

    // 2) native outputs from canonical enable lists
    writeFileSync(
      dotfilesCfgPath,
      JSON.stringify({
        skills: { humanizer: { source: `path:${skillRoot}` } },
        mcp: {
          filesystem: { command: "npx", args: ["-y", "@modelcontextprotocol/server-filesystem", "/home"] },
        },
      }),
    );

    writeFileSync(
      cfgPath,
      JSON.stringify({
        version: 1,
        repoRoot,
        clients: ["opencode"],
        enable: { skills: ["humanizer"], mcp: ["filesystem"] },
        overrides: { skills: {}, mcp: {} },
      }),
    );

    await runReplix({ cwd: repoRoot, configPath: cfgPath });

    expect(existsSync(join(repoRoot, ".opencode", "skills", "humanizer", "SKILL.md"))).toBeTrue();
    const opencodeCfg = JSON.parse(readFileSync(join(repoRoot, "opencode.json"), "utf8"));
    expect(opencodeCfg.mcp.filesystem.command).toEqual(["npx", "-y", "@modelcontextprotocol/server-filesystem", "/home"]);
    expect(opencodeCfg.mcp.filesystem.type).toBe("local");
    expect(opencodeCfg.mcp.filesystem.enabled).toBeTrue();
  } finally {
    delete process.env.REPLIX_DOTFILES_CONFIG_JSON;
    rmSync(tmp, { recursive: true, force: true });
  }
});
