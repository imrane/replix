import { test, expect } from "bun:test";
import { mkdtempSync, writeFileSync, mkdirSync, rmSync, existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { runNexus } from "../src/runNexus";

test("config mode (v2) > opencode emits native skills + opencode MCP config from canonical enable lists", async () => {
  const tmp = mkdtempSync("/tmp/nexus-config-opencode-native-");
  try {
    const repoRoot = join(tmp, "repo");
    const skillRoot = join(tmp, "skills", "humanizer");
    mkdirSync(repoRoot, { recursive: true });
    mkdirSync(skillRoot, { recursive: true });
    writeFileSync(join(skillRoot, "SKILL.md"), "---\nname: humanizer\ndescription: test\n---\n");

    const dotfilesCfg = {
      skills: {
        humanizer: { source: `path:${skillRoot}` },
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
      clients: ["opencode"],
      enable: {
        skills: ["humanizer"],
        mcp: ["filesystem"],
      },
      overrides: { skills: {}, mcp: {} },
    };

    const nexusCfgPath = join(tmp, "nexus.json");
    writeFileSync(nexusCfgPath, JSON.stringify(nexusCfg));

    await runNexus({ cwd: repoRoot, configPath: nexusCfgPath });

    expect(existsSync(join(repoRoot, ".opencode", "skills", "humanizer", "SKILL.md"))).toBeTrue();

    const opencodeCfg = JSON.parse(readFileSync(join(repoRoot, "opencode.json"), "utf8"));
    expect(opencodeCfg.mcp.filesystem.command).toEqual(["npx", "-y", "@modelcontextprotocol/server-filesystem", "/home"]);
    expect(opencodeCfg.mcp.filesystem.type).toBe("local");
    expect(opencodeCfg.mcp.filesystem.enabled).toBeTrue();
  } finally {
    rmSync(tmp, { recursive: true, force: true });
    delete process.env.NEXUS_DOTFILES_CONFIG_JSON;
  }
});
