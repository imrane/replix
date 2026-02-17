import { test, expect } from "bun:test";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

test("nexus compile self-heal > uses ai fix command for schema-gap recovery", () => {
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

    const fixScript = join(repoRoot, "fix.sh");
    writeFileSync(
      fixScript,
      "#!/usr/bin/env bash\nset -euo pipefail\nnode -e 'const fs=require(\"fs\"); const p=process.argv[1]; const j=JSON.parse(fs.readFileSync(p,\"utf8\")); j.enable.skills=[]; fs.writeFileSync(p, JSON.stringify(j,null,2));' \"$1\"\n",
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
        "--ai-fix-cmd",
        `bash ${fixScript} ${cfgPath}`,
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
