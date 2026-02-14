import { test, expect } from "bun:test";
import { mkdtempSync, writeFileSync, mkdirSync, rmSync } from "node:fs";
import { join } from "node:path";

function run(cmd: string[], cwd: string) {
  const p = Bun.spawnSync({
    cmd,
    cwd,
    stdout: "pipe",
    stderr: "pipe",
    env: { ...process.env },
  });
  return {
    code: p.exitCode,
    out: new TextDecoder().decode(p.stdout),
    err: new TextDecoder().decode(p.stderr),
  };
}

test("config mode > emits claude skill without pack.json", () => {
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

    const r = run(["bun", "src/index.ts", "--config", cfgPath], "/home/imrane/code/try/2026-02-14-nexus");
    expect(r.code).toBe(0);

    const emitted = Bun.file(join(repoRoot, ".claude", "skills", "humanizer", "SKILL.md")).text();
    return emitted.then((t) => {
      expect(t).toContain("name: humanizer");
    });
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
});
