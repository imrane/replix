import { test, expect } from "bun:test";
import { mkdtempSync, writeFileSync, mkdirSync, rmSync } from "node:fs";
import { join } from "node:path";
import { runReplix } from "../src/runReplix";

test("config mode (v2) > claude parity rejects duplicate file paths across first-class + clients map", async () => {
  const tmp = mkdtempSync("/tmp/replix-config-claude-collision-");
  try {
    const repoRoot = join(tmp, "repo");
    mkdirSync(repoRoot, { recursive: true });

    const dotfilesCfgPath = join(tmp, "dotfiles.json");
    writeFileSync(
      dotfilesCfgPath,
      JSON.stringify({
        clients: {
          claude: {
            files: {
              ".claude/commands/review.md": { text: "# from-clients\n" },
            },
          },
        },
        claude: {
          commands: {
            "review.md": { text: "# from-first-class\n" },
          },
        },
      }),
    );
    process.env.REPLIX_DOTFILES_CONFIG_JSON = dotfilesCfgPath;

    const replixCfgPath = join(tmp, "replix.json");
    writeFileSync(
      replixCfgPath,
      JSON.stringify({
        version: 1,
        repoRoot,
        clients: ["claude"],
        enable: { skills: [], mcp: [] },
        overrides: { skills: {}, mcp: {} },
      }),
    );

    await expect(runReplix({ cwd: repoRoot, configPath: replixCfgPath })).rejects.toThrow(
      /duplicate claude file path/i,
    );
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
});
