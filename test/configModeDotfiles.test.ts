import { test, expect } from "bun:test";
import { mkdtempSync, writeFileSync, mkdirSync, rmSync } from "node:fs";
import { join } from "node:path";
import { runNexus } from "../src/runNexus";

test("config mode (v2) > resolves skills+mcp from dotfiles registry", async () => {
  const tmp = mkdtempSync("/tmp/nexus-config-dotfiles-");
  try {
    const repoRoot = join(tmp, "repo");
    mkdirSync(repoRoot, { recursive: true });

    // fake dotfiles skill sources
    const skillsRoot = join(tmp, "skills");
    const humanizerRoot = join(skillsRoot, "humanizer");
    mkdirSync(humanizerRoot, { recursive: true });
    writeFileSync(join(humanizerRoot, "SKILL.md"), "---\nname: humanizer\n---\n\n# hi\n");

    const dotfilesCfg = {
      skills: {
        humanizer: { source: `path:${humanizerRoot}` },
      },
      mcp: {
        filesystem: {
          command: "npx",
          args: ["-y", "@modelcontextprotocol/server-filesystem", "/home"],
        },
      },
    };
    const dotfilesCfgPath = join(tmp, "dotfiles.json");
    writeFileSync(dotfilesCfgPath, JSON.stringify(dotfilesCfg));
    process.env.NEXUS_DOTFILES_CONFIG_JSON = dotfilesCfgPath;

    const nexusCfg = {
      version: 1,
      repoRoot,
      clients: ["claude"],
      enable: { skills: ["humanizer"], mcp: ["filesystem"] },
      // v2: no local sources required
      overrides: { skills: {}, mcp: {} },
    };

    const nexusCfgPath = join(tmp, "nexus.json");
    writeFileSync(nexusCfgPath, JSON.stringify(nexusCfg));

    await runNexus({ cwd: repoRoot, configPath: nexusCfgPath });

    const t = await Bun.file(join(repoRoot, ".claude", "skills", "humanizer", "SKILL.md")).text();
    expect(t).toContain("name: humanizer");

    const m = await Bun.file(join(repoRoot, ".mcp.json")).text();
    expect(m).toContain("__generated_by");
    expect(m).toContain("filesystem");
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
});
