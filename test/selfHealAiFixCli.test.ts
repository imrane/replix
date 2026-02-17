import { test, expect } from "bun:test";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

test("nexus compile self-heal > uses ai fix ts script for schema-gap recovery", () => {
  const root = mkdtempSync(join(tmpdir(), "nexus-self-heal-aifix-"));
  try {
    const repoRoot = join(root, "repo");
    mkdirSync(repoRoot, { recursive: true });

    const cfgPath = join(repoRoot, "config.json");
    writeFileSync(
      cfgPath,
      JSON.stringify(
        {
          version: 1,
          repoRoot,
          clients: ["claude"],
          enable: { skills: ["missing-skill"], mcp: [] },
          vars: {},
          overrides: { skills: {}, mcp: {} },
        },
        null,
        2,
      ),
    );

    const fixScript = join(repoRoot, "fix.ts");
    writeFileSync(
      fixScript,
      [
        "import { readFileSync, writeFileSync } from 'node:fs';",
        "const payload = JSON.parse(process.env.NEXUS_SELF_HEAL_PAYLOAD ?? '{}');",
        "const p = payload.configPath as string;",
        "const j = JSON.parse(readFileSync(p, 'utf8'));",
        "j.enable.skills = [];",
        "writeFileSync(p, JSON.stringify(j, null, 2));",
      ].join("\n"),
      "utf8",
    );

    const out = Bun.spawnSync({
      cmd: [
        "bun",
        join(process.cwd(), "src/index.ts"),
        "compile",
        "self-heal",
        "--config",
        cfgPath,
        "--max-attempts",
        "2",
        "--ai-fix-ts",
        fixScript,
      ],
      cwd: repoRoot,
      stdout: "pipe",
      stderr: "pipe",
    });

    expect(out.exitCode).toBe(0);
    expect(out.stdout.toString()).toContain("nexus compile self-heal: recovered");

    const cfg = JSON.parse(readFileSync(cfgPath, "utf8"));
    expect(cfg.enable.skills).toEqual([]);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
