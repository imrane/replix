import { test, expect } from "bun:test";
import { mkdtempSync, writeFileSync, mkdirSync, rmSync } from "node:fs";
import { join } from "node:path";
import { runNexus } from "../src/runNexus";

test("config mode (v2) > supports first-class claude commands/hooks/agents defs", async () => {
  const tmp = mkdtempSync("/tmp/nexus-config-claude-parity-");
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
          hooks: {
            "pre-commit.sh": { text: "#!/usr/bin/env bash\necho ok\n", executable: true },
          },
          agents: {
            "planner.md": { text: "# planner\n" },
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
        clients: ["claude"],
        enable: { skills: [], mcp: [] },
        overrides: { skills: {}, mcp: {} },
      }),
    );

    await runNexus({ cwd: repoRoot, configPath: nexusCfgPath });

    expect(await Bun.file(join(repoRoot, ".claude", "commands", "review.md")).text()).toContain("# review");
    expect(await Bun.file(join(repoRoot, ".claude", "hooks", "pre-commit.sh")).text()).toContain("echo ok");
    expect(await Bun.file(join(repoRoot, ".claude", "agents", "planner.md")).text()).toContain("# planner");
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
});
