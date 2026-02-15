import { test, expect } from "bun:test";
import { mkdtempSync, writeFileSync, mkdirSync, rmSync } from "node:fs";
import { join } from "node:path";
import { runNexus } from "../src/runNexus";

test("config mode (v2) > layout=generated emits under .nexus/generated", async () => {
  process.env.NEXUS_DOTFILES_CONFIG_JSON = "";
  const tmp = mkdtempSync("/tmp/nexus-config-layout-");
  try {
    const repoRoot = join(tmp, "repo");
    const skillRoot = join(tmp, "humanizer");
    mkdirSync(repoRoot, { recursive: true });
    mkdirSync(skillRoot, { recursive: true });

    writeFileSync(join(skillRoot, "SKILL.md"), "---\nname: humanizer\n---\n\n# hi\n");

    const cfg = {
      version: 1,
      repoRoot,
      clients: ["claude"],
      enable: { skills: ["humanizer"], mcp: [] },
      layout: "generated",
      overrides: { skills: { humanizer: { path: skillRoot } }, mcp: {} },
    };

    const cfgPath = join(tmp, "config.json");
    writeFileSync(cfgPath, JSON.stringify(cfg));

    await runNexus({ cwd: repoRoot, configPath: cfgPath });

    const generatedSkill = join(repoRoot, ".nexus", "generated", ".claude", "skills", "humanizer", "SKILL.md");
    expect(await Bun.file(generatedSkill).exists()).toBe(true);
    expect(await Bun.file(join(repoRoot, ".claude", "skills", "humanizer", "SKILL.md")).exists()).toBe(false);
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
});

test("config mode (v2) > cleanup=full removes stale generated outputs", async () => {
  process.env.NEXUS_DOTFILES_CONFIG_JSON = "";
  const tmp = mkdtempSync("/tmp/nexus-config-cleanup-full-");
  try {
    const repoRoot = join(tmp, "repo");
    const skillRoot = join(tmp, "humanizer");
    mkdirSync(repoRoot, { recursive: true });
    mkdirSync(skillRoot, { recursive: true });

    writeFileSync(join(skillRoot, "SKILL.md"), "---\nname: humanizer\n---\n\n# hi\n");

    const stalePath = join(repoRoot, ".nexus", "generated", ".claude", "skills", "stale", "SKILL.md");
    mkdirSync(join(repoRoot, ".nexus", "generated", ".claude", "skills", "stale"), { recursive: true });
    writeFileSync(stalePath, "# stale");

    const cfg = {
      version: 1,
      repoRoot,
      clients: ["claude"],
      enable: { skills: ["humanizer"], mcp: [] },
      layout: "generated",
      cleanup: "full",
      overrides: { skills: { humanizer: { path: skillRoot } }, mcp: {} },
    };

    const cfgPath = join(tmp, "config.json");
    writeFileSync(cfgPath, JSON.stringify(cfg));

    await runNexus({ cwd: repoRoot, configPath: cfgPath });

    expect(await Bun.file(stalePath).exists()).toBe(false);
    expect(
      await Bun.file(join(repoRoot, ".nexus", "generated", ".claude", "skills", "humanizer", "SKILL.md")).exists(),
    ).toBe(true);
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
});
