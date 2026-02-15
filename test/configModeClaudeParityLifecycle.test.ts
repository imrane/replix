import { test, expect } from "bun:test";
import { mkdtempSync, writeFileSync, mkdirSync, rmSync, existsSync } from "node:fs";
import { join } from "node:path";
import { runNexus } from "../src/runNexus";

function writeDotfiles(path: string, body: unknown) {
  writeFileSync(path, JSON.stringify(body));
}

function writeNexusConfig(path: string, repoRoot: string) {
  writeFileSync(
    path,
    JSON.stringify({
      version: 1,
      repoRoot,
      clients: ["claude"],
      enable: { skills: [], mcp: [] },
      overrides: { skills: {}, mcp: {} },
    }),
  );
}

test("config mode (v2) > claude first-class files support create/update/remove lifecycle", async () => {
  const tmp = mkdtempSync("/tmp/nexus-config-claude-lifecycle-");
  try {
    const repoRoot = join(tmp, "repo");
    mkdirSync(repoRoot, { recursive: true });

    const dotfilesCfgPath = join(tmp, "dotfiles.json");
    const nexusCfgPath = join(tmp, "nexus.json");
    writeNexusConfig(nexusCfgPath, repoRoot);
    process.env.NEXUS_DOTFILES_CONFIG_JSON = dotfilesCfgPath;

    // create
    writeDotfiles(dotfilesCfgPath, {
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

    // update + remove one
    writeDotfiles(dotfilesCfgPath, {
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

    // remove all
    writeDotfiles(dotfilesCfgPath, { claude: {} });
    await runNexus({ cwd: repoRoot, configPath: nexusCfgPath });

    expect(existsSync(join(repoRoot, ".claude", "commands", "review.md"))).toBe(false);
    expect(existsSync(join(repoRoot, ".claude", "agents", "planner.md"))).toBe(false);
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
});
