import { test, expect } from "bun:test";
import { mkdtempSync, writeFileSync, mkdirSync, rmSync, existsSync } from "node:fs";
import { join } from "node:path";
import { runNexus } from "../src/runNexus";

test("dotfiles config (v2) > claude.settings convenience emits .claude/settings.json", async () => {
  const tmp = mkdtempSync("/tmp/nexus-config-claude-settings-");
  try {
    const repoRoot = join(tmp, "repo");
    mkdirSync(repoRoot, { recursive: true });

    const dotfilesCfgPath = join(tmp, "dotfiles.json");
    writeFileSync(
      dotfilesCfgPath,
      JSON.stringify({
        claude: {
          settings: {
            text: JSON.stringify({ hooks: { Stop: [{ hooks: [{ type: "command", command: "echo hi" }] }] } }, null, 2),
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
        enable: {
          skills: [],
          mcp: [],
          clients: { claude: { files: [".claude/settings.json"] } },
        },
        overrides: { skills: {}, mcp: {} },
      }),
    );

    await runNexus({ cwd: repoRoot, configPath: nexusCfgPath });

    expect(existsSync(join(repoRoot, ".claude", "settings.json"))).toBeTrue();
    const t = await Bun.file(join(repoRoot, ".claude", "settings.json")).text();
    expect(t).toContain('"hooks"');
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
});
