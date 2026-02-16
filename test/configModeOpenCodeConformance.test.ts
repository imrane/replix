import { test, expect } from "bun:test";
import { mkdtempSync, writeFileSync, mkdirSync, rmSync, existsSync } from "node:fs";
import { join } from "node:path";
import { runNexus } from "../src/runNexus";

test("config mode (v2) > opencode legacy plural paths are normalized to canonical singular dirs", async () => {
  const tmp = mkdtempSync("/tmp/nexus-config-opencode-conformance-");
  try {
    const repoRoot = join(tmp, "repo");
    mkdirSync(repoRoot, { recursive: true });

    const dotfilesCfg = {
      clients: {
        opencode: {
          files: {
            ".opencode/commands/review.md": { text: "# review\n" },
            ".opencode/agents/planner.md": { text: "# planner\n" },
          },
        },
      },
    };

    const dotfilesCfgPath = join(tmp, "dotfiles.json");
    writeFileSync(dotfilesCfgPath, JSON.stringify(dotfilesCfg));
    process.env.NEXUS_DOTFILES_CONFIG_JSON = dotfilesCfgPath;

    const nexusCfg = {
      version: 1,
      repoRoot,
      clients: ["opencode"],
      enable: {
        skills: [],
        mcp: [],
        clients: {
          opencode: {
            files: [".opencode/commands/review.md", ".opencode/agents/planner.md"],
          },
        },
      },
      overrides: { skills: {}, mcp: {} },
    };

    const nexusCfgPath = join(tmp, "nexus.json");
    writeFileSync(nexusCfgPath, JSON.stringify(nexusCfg));

    await runNexus({ cwd: repoRoot, configPath: nexusCfgPath });

    expect(existsSync(join(repoRoot, ".opencode", "command", "review.md"))).toBeTrue();
    expect(existsSync(join(repoRoot, ".opencode", "agent", "planner.md"))).toBeTrue();
    expect(existsSync(join(repoRoot, ".opencode", "commands", "review.md"))).toBeFalse();
    expect(existsSync(join(repoRoot, ".opencode", "agents", "planner.md"))).toBeFalse();
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
});
