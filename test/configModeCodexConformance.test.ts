import { test, expect } from "bun:test";
import { mkdtempSync, writeFileSync, mkdirSync, rmSync, existsSync } from "node:fs";
import { join } from "node:path";
import { runNexus } from "../src/runNexus";

test("config mode (v2) > codex client accepts skill shim paths and blocks config.toml injection", async () => {
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
              ".agents/skills/humanizer/SKILL.md": { text: "# humanizer\n" },
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
            codex: { files: [".agents/skills/humanizer/SKILL.md"] },
          },
        },
        overrides: { skills: {}, mcp: {} },
      }),
    );

    await runNexus({ cwd: repoRoot, configPath: nexusCfgPath });
    expect(existsSync(join(repoRoot, ".codex", "config.toml"))).toBeTrue();
    expect(existsSync(join(repoRoot, ".agents", "skills", "humanizer", "SKILL.md"))).toBeTrue();

    // now try injecting codex config directly and assert hard failure (single canonical MCP source)
    writeFileSync(
      dotfilesCfgPath,
      JSON.stringify({
        clients: {
          codex: {
            files: {
              ".codex/config.toml": { text: "# custom\n" },
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
            codex: { files: [".codex/config.toml"] },
          },
        },
        overrides: { skills: {}, mcp: {} },
      }),
    );

    await expect(runNexus({ cwd: repoRoot, configPath: nexusCfgPath })).rejects.toThrow(
      "generated from canonical mcp/skills",
    );
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
});
