import { test, expect } from "bun:test";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

function makePack(root: string, version: string, skillBody = "# alpha\n") {
  mkdirSync(root, { recursive: true });
  mkdirSync(join(root, "skills", "alpha"), { recursive: true });
  writeFileSync(join(root, "skills", "alpha", "SKILL.md"), skillBody);
  writeFileSync(
    join(root, "pack.json"),
    JSON.stringify(
      {
        id: "security-pack",
        version,
        imports: [],
        varsSchemaVersion: 1,
        vars: { required: {}, optional: {} },
      },
      null,
      2,
    ),
  );
}

test("replix run (config mode) > blocks when lockfile checksum/version drifts", () => {
  const root = mkdtempSync(join(tmpdir(), "replix-lock-gate-"));
  try {
    const repoRoot = join(root, "repo");
    mkdirSync(repoRoot, { recursive: true });

    const packRoot = join(root, "packs", "security");
    makePack(packRoot, "1.0.0");

    const dotfilesPath = join(root, "dotfiles.json");
    writeFileSync(dotfilesPath, JSON.stringify({ packs: [{ source: `path:${packRoot}` }] }, null, 2));

    const cfgPath = join(root, "config.json");
    writeFileSync(
      cfgPath,
      JSON.stringify(
        {
          version: 1,
          repoRoot,
          clients: ["claude"],
          enable: { skills: [], mcp: [] },
          vars: {},
          overrides: { skills: {}, mcp: {} },
        },
        null,
        2,
      ),
    );

    const lockOut = Bun.spawnSync({
      cmd: ["bun", join(process.cwd(), "src/index.ts"), "lock", "update"],
      cwd: repoRoot,
      env: { ...process.env, REPLIX_DOTFILES_CONFIG_JSON: dotfilesPath },
      stdout: "pipe",
      stderr: "pipe",
    });
    expect(lockOut.exitCode).toBe(0);

    // Tamper pack content after lock creation without bumping version.
    makePack(packRoot, "1.0.0", "# alpha\n\nTampered content\n");

    const runOut = Bun.spawnSync({
      cmd: ["bun", join(process.cwd(), "src/index.ts"), "--config", cfgPath],
      cwd: repoRoot,
      env: { ...process.env, REPLIX_DOTFILES_CONFIG_JSON: dotfilesPath },
      stdout: "pipe",
      stderr: "pipe",
    });

    expect(runOut.exitCode).toBe(1);
    const stderr = runOut.stderr.toString();
    expect(stderr).toContain("lockfile compatibility gate failed");
    expect(stderr).toContain("pack checksum:");
    expect(stderr).toContain("fix: run `replix lock update`");
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
