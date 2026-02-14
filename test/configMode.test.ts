import { test, expect } from "bun:test";
import { mkdtempSync, writeFileSync, mkdirSync, rmSync } from "node:fs";
import { join } from "node:path";
import { runNexus } from "../src/runNexus";

test("config mode > emits claude skill without pack.json", async () => {
  const tmp = mkdtempSync("/tmp/nexus-config-mode-");
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
      sources: { skills: { humanizer: { path: skillRoot } }, mcp: {} },
    };

    const cfgPath = join(tmp, "config.json");
    writeFileSync(cfgPath, JSON.stringify(cfg));

    await runNexus({ cwd: repoRoot, configPath: cfgPath });

    const t = await Bun.file(join(repoRoot, ".claude", "skills", "humanizer", "SKILL.md")).text();
    expect(t).toContain("name: humanizer");
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
});
