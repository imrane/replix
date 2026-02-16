import { test, expect } from "bun:test";
import { mkdtempSync, writeFileSync, mkdirSync, rmSync, existsSync } from "node:fs";
import { join } from "node:path";
import { runNexus } from "../src/runNexus";

test("config mode (v2) > canonical selectors enable claude artifacts without path-level files list", async () => {
  const tmp = mkdtempSync("/tmp/nexus-config-canonical-selectors-");
  try {
    const repoRoot = join(tmp, "repo");
    mkdirSync(repoRoot, { recursive: true });

    const dotfilesCfgPath = join(tmp, "dotfiles.json");
    writeFileSync(
      dotfilesCfgPath,
      JSON.stringify({
        claude: {
          commands: {
            "review.md": { text: "# review\n" },
            "ship.md": { text: "# ship\n" },
          },
          hooks: {
            "pre-commit.sh": { text: "#!/usr/bin/env bash\necho ok\n", executable: true },
          },
          agents: {
            "planner.md": { text: "# planner\n" },
          },
          settings: { text: "{\"model\":\"sonnet\"}\n" },
        },
      }),
    );
    process.env.NEXUS_DOTFILES_CONFIG_JSON = dotfilesCfgPath;

    const nexusCfgPath = join(tmp, "nexus.json");
    writeFileSync(
      nexusCfgPath,
      JSON.stringify({
        version: 1,
        repoRoot,
        clients: ["claude"],
        enable: {
          skills: [],
          mcp: [],
          commands: ["review.md"],
          hooks: ["pre-commit.sh"],
          agents: ["planner.md"],
          settings: ["settings"],
        },
        overrides: { skills: {}, mcp: {} },
      }),
    );

    await runNexus({ cwd: repoRoot, configPath: nexusCfgPath });

    expect(await Bun.file(join(repoRoot, ".claude", "commands", "review.md")).text()).toContain("# review");
    expect(existsSync(join(repoRoot, ".claude", "commands", "ship.md"))).toBe(false);
    expect(await Bun.file(join(repoRoot, ".claude", "hooks", "pre-commit.sh")).text()).toContain("echo ok");
    expect(await Bun.file(join(repoRoot, ".claude", "agents", "planner.md")).text()).toContain("# planner");
    expect(await Bun.file(join(repoRoot, ".claude", "settings.json")).text()).toContain("sonnet");
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
});

test("config mode (v2) > canonical selectors do not require non-claude client file defs", async () => {
  const tmp = mkdtempSync("/tmp/nexus-config-canonical-selectors-multiclient-");
  try {
    const repoRoot = join(tmp, "repo");
    mkdirSync(repoRoot, { recursive: true });

    const dotfilesCfgPath = join(tmp, "dotfiles.json");
    writeFileSync(
      dotfilesCfgPath,
      JSON.stringify({
        claude: {
          commands: {
            "review.md": { text: "# review\n" },
          },
        },
      }),
    );
    process.env.NEXUS_DOTFILES_CONFIG_JSON = dotfilesCfgPath;

    const nexusCfgPath = join(tmp, "nexus.json");
    writeFileSync(
      nexusCfgPath,
      JSON.stringify({
        version: 1,
        repoRoot,
        clients: ["claude", "opencode"],
        enable: {
          skills: [],
          mcp: [],
          commands: ["review.md"],
        },
        overrides: { skills: {}, mcp: {} },
      }),
    );

    await runNexus({ cwd: repoRoot, configPath: nexusCfgPath });

    expect(await Bun.file(join(repoRoot, ".claude", "commands", "review.md")).text()).toContain("# review");
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
});
