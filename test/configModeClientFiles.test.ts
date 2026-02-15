import { test, expect } from "bun:test";
import { mkdtempSync, writeFileSync, mkdirSync, rmSync, existsSync } from "node:fs";
import { join } from "node:path";
import { runNexus } from "../src/runNexus";

test("config mode (v2) > emits and cleans up per-client custom files", async () => {
  const tmp = mkdtempSync("/tmp/nexus-config-client-files-");
  try {
    const repoRoot = join(tmp, "repo");
    mkdirSync(repoRoot, { recursive: true });

    const sourceFile = join(tmp, "snippet.txt");
    writeFileSync(sourceFile, "hello from source\n");

    const dotfilesCfgPath = join(tmp, "dotfiles.json");
    writeFileSync(
      dotfilesCfgPath,
      JSON.stringify({
        clients: {
          claude: {
            files: {
              ".claude/commands/review.md": { text: "# review\n" },
              ".claude/hooks/pre-commit.txt": { source: `path:${sourceFile}` },
            },
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
          clients: {
            claude: {
              files: [".claude/commands/review.md"],
            },
          },
        },
        overrides: { skills: {}, mcp: {} },
      }),
    );

    await runNexus({ cwd: repoRoot, configPath: nexusCfgPath });

    const customText = await Bun.file(join(repoRoot, ".claude", "commands", "review.md")).text();
    expect(customText).toContain("# review");
    expect(existsSync(join(repoRoot, ".claude", "hooks", "pre-commit.txt"))).toBe(false);

    // Overwrite selected files and ensure stale file is removed.
    writeFileSync(
      nexusCfgPath,
      JSON.stringify({
        version: 1,
        repoRoot,
        clients: ["claude"],
        enable: {
          skills: [],
          mcp: [],
          clients: {
            claude: {
              files: [".claude/hooks/pre-commit.txt"],
            },
          },
        },
        overrides: { skills: {}, mcp: {} },
      }),
    );

    await runNexus({ cwd: repoRoot, configPath: nexusCfgPath });

    expect(existsSync(join(repoRoot, ".claude", "commands", "review.md"))).toBe(false);
    const sourced = await Bun.file(join(repoRoot, ".claude", "hooks", "pre-commit.txt")).text();
    expect(sourced).toContain("hello from source");
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
});
