import { test, expect } from "bun:test";
import { mkdtempSync, writeFileSync, mkdirSync, rmSync, existsSync } from "node:fs";
import { join } from "node:path";
import { runNexus } from "../src/runNexus";

function writeJson(path: string, value: unknown) {
  writeFileSync(path, JSON.stringify(value));
}

function baseConfig(repoRoot: string) {
  return {
    version: 1,
    repoRoot,
    clients: ["claude"],
    enable: { skills: [], mcp: [] },
    overrides: { skills: {}, mcp: {} },
  };
}

test("config mode (v2) > claude first-class artifacts emit command/hook/agent", async () => {
  const tmp = mkdtempSync("/tmp/nexus-config-claude-artifacts-");
  try {
    const repoRoot = join(tmp, "repo");
    mkdirSync(repoRoot, { recursive: true });

    const dotfilesCfgPath = join(tmp, "dotfiles.json");
    const nexusCfgPath = join(tmp, "nexus.json");

    writeJson(dotfilesCfgPath, {
      claude: {
        commands: { "review.md": { text: "# review\n" } },
        hooks: { "pre-commit.sh": { text: "#!/usr/bin/env bash\necho ok\n", executable: true } },
        agents: { "planner.md": { text: "# planner\n" } },
      },
    });
    process.env.NEXUS_DOTFILES_CONFIG_JSON = dotfilesCfgPath;

    writeJson(nexusCfgPath, baseConfig(repoRoot));
    await runNexus({ cwd: repoRoot, configPath: nexusCfgPath });

    expect(await Bun.file(join(repoRoot, ".claude", "commands", "review.md")).text()).toContain("# review");
    expect(await Bun.file(join(repoRoot, ".claude", "hooks", "pre-commit.sh")).text()).toContain("echo ok");
    expect(await Bun.file(join(repoRoot, ".claude", "agents", "planner.md")).text()).toContain("# planner");
  } finally {
    delete process.env.NEXUS_DOTFILES_CONFIG_JSON;
    rmSync(tmp, { recursive: true, force: true });
  }
});

test("config mode (v2) > claude first-class files support create/update/remove lifecycle", async () => {
  const tmp = mkdtempSync("/tmp/nexus-config-claude-lifecycle-");
  try {
    const repoRoot = join(tmp, "repo");
    mkdirSync(repoRoot, { recursive: true });

    const dotfilesCfgPath = join(tmp, "dotfiles.json");
    const nexusCfgPath = join(tmp, "nexus.json");
    writeJson(nexusCfgPath, baseConfig(repoRoot));
    process.env.NEXUS_DOTFILES_CONFIG_JSON = dotfilesCfgPath;

    writeJson(dotfilesCfgPath, {
      claude: {
        commands: { "review.md": { text: "# review v1\n" } },
        hooks: { "pre-commit.sh": { text: "#!/usr/bin/env bash\necho v1\n", executable: true } },
        agents: { "planner.md": { text: "# planner v1\n" } },
      },
    });
    await runNexus({ cwd: repoRoot, configPath: nexusCfgPath });

    expect(await Bun.file(join(repoRoot, ".claude", "commands", "review.md")).text()).toContain("v1");
    expect(await Bun.file(join(repoRoot, ".claude", "hooks", "pre-commit.sh")).text()).toContain("v1");
    expect(await Bun.file(join(repoRoot, ".claude", "agents", "planner.md")).text()).toContain("v1");

    writeJson(dotfilesCfgPath, {
      claude: {
        commands: { "review.md": { text: "# review v2\n" } },
        hooks: {},
        agents: { "planner.md": { text: "# planner v2\n" } },
      },
    });
    await runNexus({ cwd: repoRoot, configPath: nexusCfgPath });

    expect(await Bun.file(join(repoRoot, ".claude", "commands", "review.md")).text()).toContain("v2");
    expect(await Bun.file(join(repoRoot, ".claude", "agents", "planner.md")).text()).toContain("v2");
    expect(existsSync(join(repoRoot, ".claude", "hooks", "pre-commit.sh"))).toBe(false);

    writeJson(dotfilesCfgPath, { claude: {} });
    await runNexus({ cwd: repoRoot, configPath: nexusCfgPath });

    expect(existsSync(join(repoRoot, ".claude", "commands", "review.md"))).toBe(false);
    expect(existsSync(join(repoRoot, ".claude", "agents", "planner.md"))).toBe(false);
  } finally {
    delete process.env.NEXUS_DOTFILES_CONFIG_JSON;
    rmSync(tmp, { recursive: true, force: true });
  }
});

test("config mode (v2) > claude settings convenience emits settings files and cleanup", async () => {
  const tmp = mkdtempSync("/tmp/nexus-config-claude-settings-");
  try {
    const repoRoot = join(tmp, "repo");
    mkdirSync(repoRoot, { recursive: true });

    const dotfilesCfgPath = join(tmp, "dotfiles.json");
    const nexusCfgPath = join(tmp, "nexus.json");
    process.env.NEXUS_DOTFILES_CONFIG_JSON = dotfilesCfgPath;

    writeJson(dotfilesCfgPath, {
      claude: {
        settings: { text: JSON.stringify({ hooks: { Stop: [{ hooks: [{ type: "command", command: "echo hi" }] }] } }, null, 2) },
        settingsLocal: { text: JSON.stringify({ hooks: { Stop: [{ hooks: [{ type: "command", command: "echo local" }] }] } }, null, 2) },
      },
    });

    writeJson(nexusCfgPath, {
      ...baseConfig(repoRoot),
      enable: { skills: [], mcp: [], clients: { claude: { files: [".claude/settings.local.json"] } } },
    });
    await runNexus({ cwd: repoRoot, configPath: nexusCfgPath });

    expect(existsSync(join(repoRoot, ".claude", "settings.local.json"))).toBeTrue();
    expect(existsSync(join(repoRoot, ".claude", "settings.json"))).toBeFalse();
    expect(await Bun.file(join(repoRoot, ".claude", "settings.local.json")).text()).toContain("echo local");

    writeJson(nexusCfgPath, {
      ...baseConfig(repoRoot),
      enable: { skills: [], mcp: [], clients: { claude: { files: [".claude/settings.json"] } } },
    });
    await runNexus({ cwd: repoRoot, configPath: nexusCfgPath });

    expect(existsSync(join(repoRoot, ".claude", "settings.local.json"))).toBeFalse();
    expect(existsSync(join(repoRoot, ".claude", "settings.json"))).toBeTrue();
    expect(await Bun.file(join(repoRoot, ".claude", "settings.json")).text()).toContain("hooks");
  } finally {
    delete process.env.NEXUS_DOTFILES_CONFIG_JSON;
    rmSync(tmp, { recursive: true, force: true });
  }
});
