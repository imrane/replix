import { test, expect } from "bun:test";
import { mkdtempSync, writeFileSync, mkdirSync, rmSync, existsSync } from "node:fs";
import { join } from "node:path";
import { runNexus } from "../src/runNexus";

test("dotfiles config (v2) > claude.settingsLocal convenience emits .claude/settings.local.json", async () => {
  const tmp = mkdtempSync("/tmp/nexus-config-claude-settings-local-");
  try {
    const repoRoot = join(tmp, "repo");
    mkdirSync(repoRoot, { recursive: true });

    const dotfilesCfgPath = join(tmp, "dotfiles.json");
    writeFileSync(
      dotfilesCfgPath,
      JSON.stringify({
        claude: {
          settingsLocal: {
            text: JSON.stringify({ hooks: { Stop: [{ hooks: [{ type: "command", command: "echo local" }] }] } }, null, 2),
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
          clients: { claude: { files: [".claude/settings.local.json"] } },
        },
        overrides: { skills: {}, mcp: {} },
      }),
    );

    await runNexus({ cwd: repoRoot, configPath: nexusCfgPath });

    expect(existsSync(join(repoRoot, ".claude", "settings.local.json"))).toBeTrue();
    const t = await Bun.file(join(repoRoot, ".claude", "settings.local.json")).text();
    expect(t).toContain('"echo local"');
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
});

test("dotfiles config (v2) > cleanup removes stale settings.local when no longer enabled", async () => {
  const tmp = mkdtempSync("/tmp/nexus-config-claude-settings-local-cleanup-");
  try {
    const repoRoot = join(tmp, "repo");
    mkdirSync(repoRoot, { recursive: true });

    const dotfilesCfgPath = join(tmp, "dotfiles.json");
    writeFileSync(
      dotfilesCfgPath,
      JSON.stringify({
        claude: {
          settings: { text: "{\n  \"v\": 1\n}\n" },
          settingsLocal: { text: "{\n  \"v\": 2\n}\n" },
        },
      }),
    );
    process.env.NEXUS_DOTFILES_CONFIG_JSON = dotfilesCfgPath;

    const nexusCfgPath = join(tmp, "nexus.json");

    // First: enable local settings
    writeFileSync(
      nexusCfgPath,
      JSON.stringify({
        version: 1,
        repoRoot,
        clients: ["claude"],
        enable: {
          skills: [],
          mcp: [],
          clients: { claude: { files: [".claude/settings.local.json"] } },
        },
        overrides: { skills: {}, mcp: {} },
      }),
    );
    await runNexus({ cwd: repoRoot, configPath: nexusCfgPath });
    expect(existsSync(join(repoRoot, ".claude", "settings.local.json"))).toBeTrue();
    expect(existsSync(join(repoRoot, ".claude", "settings.json"))).toBeFalse();

    // Then: switch to non-local settings and ensure local is removed
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

    expect(existsSync(join(repoRoot, ".claude", "settings.local.json"))).toBeFalse();
    expect(existsSync(join(repoRoot, ".claude", "settings.json"))).toBeTrue();
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
});
