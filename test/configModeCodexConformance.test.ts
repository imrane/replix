import { test, expect } from "bun:test";
import { mkdtempSync, writeFileSync, mkdirSync, rmSync, existsSync } from "node:fs";
import { join } from "node:path";
import { runNexus } from "../src/runNexus";

test("config mode (v2) > codex client accepts only .codex/config.toml", async () => {
  const tmp = mkdtempSync("/tmp/nexus-config-codex-conformance-");
  try {
    const repoRoot = join(tmp, "repo");
    mkdirSync(repoRoot, { recursive: true });

    const dotfilesCfgPath = join(tmp, "dotfiles.json");
    writeFileSync(
      dotfilesCfgPath,
      JSON.stringify({
        clients: {
          codex: {
            files: {
              ".codex/config.toml": { text: "[mcp]\nenabled = true\n" },
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
        clients: ["codex"],
        enable: {
          skills: [],
          mcp: [],
          clients: {
            codex: { files: [".codex/config.toml"] },
          },
        },
        overrides: { skills: {}, mcp: {} },
      }),
    );

    await runNexus({ cwd: repoRoot, configPath: nexusCfgPath });
    expect(existsSync(join(repoRoot, ".codex", "config.toml"))).toBeTrue();

    // now set an unsupported codex path and assert hard failure
    writeFileSync(
      dotfilesCfgPath,
      JSON.stringify({
        clients: {
          codex: {
            files: {
              ".codex/commands/review.md": { text: "# review\n" },
            },
          },
        },
      }),
    );

    writeFileSync(
      nexusCfgPath,
      JSON.stringify({
        version: 1,
        repoRoot,
        clients: ["codex"],
        enable: {
          skills: [],
          mcp: [],
          clients: {
            codex: { files: [".codex/commands/review.md"] },
          },
        },
        overrides: { skills: {}, mcp: {} },
      }),
    );

    await expect(runNexus({ cwd: repoRoot, configPath: nexusCfgPath })).rejects.toThrow(
      "unsupported codex repo file path",
    );
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
});
