import { test, expect } from "bun:test";
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

function makePack(root: string, id: string, version: string, requiredVars: string[] = []) {
  mkdirSync(root, { recursive: true });
  const required = Object.fromEntries(requiredVars.map((v) => [v, { secret: true }]));
  writeFileSync(
    join(root, "pack.json"),
    JSON.stringify(
      {
        id,
        version,
        imports: [],
        varsSchemaVersion: 1,
        vars: {
          required,
          optional: {},
        },
      },
      null,
      2,
    ),
  );
}

test("nexus lock update > writes lockfile from dotfiles packs", () => {
  const root = mkdtempSync(join(tmpdir(), "nexus-lock-cli-"));
  try {
    const repoRoot = join(root, "repo");
    mkdirSync(repoRoot, { recursive: true });

    const packA = join(root, "packs", "security");
    const packB = join(root, "packs", "content");
    makePack(packA, "security", "1.2.0", ["API_TOKEN"]);
    makePack(packB, "content", "0.4.1", []);

    const dotfilesPath = join(root, "dotfiles.json");
    writeFileSync(
      dotfilesPath,
      JSON.stringify(
        {
          packs: [
            { source: `path:${packA}` },
            { source: `path:${packB}` },
          ],
        },
        null,
        2,
      ),
    );

    const out = Bun.spawnSync({
      cmd: ["bun", join(process.cwd(), "src/index.ts"), "lock", "update"],
      cwd: repoRoot,
      env: { ...process.env, NEXUS_DOTFILES_CONFIG_JSON: dotfilesPath },
      stdout: "pipe",
      stderr: "pipe",
    });

    expect(out.exitCode).toBe(0);
    expect(out.stdout.toString()).toContain("nexus lock update");

    const lockPath = join(repoRoot, "nexus.lock.json");
    const lock = JSON.parse(readFileSync(lockPath, "utf8"));
    expect(lock.version).toBe(1);
    expect(lock.packs.length).toBe(2);
    expect(lock.packs[0].requiredVars).toBeDefined();

    rmSync(lockPath, { force: true });
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("nexus lock update > prints diff summary for version and new required vars", () => {
  const root = mkdtempSync(join(tmpdir(), "nexus-lock-diff-"));
  try {
    const repoRoot = join(root, "repo");
    mkdirSync(repoRoot, { recursive: true });

    const packA = join(root, "packs", "security");
    makePack(packA, "security", "1.0.0", ["API_TOKEN"]);

    const dotfilesPath = join(root, "dotfiles.json");
    writeFileSync(dotfilesPath, JSON.stringify({ packs: [{ source: `path:${packA}` }] }, null, 2));

    const first = Bun.spawnSync({
      cmd: ["bun", join(process.cwd(), "src/index.ts"), "lock", "update"],
      cwd: repoRoot,
      env: { ...process.env, NEXUS_DOTFILES_CONFIG_JSON: dotfilesPath },
      stdout: "pipe",
      stderr: "pipe",
    });
    expect(first.exitCode).toBe(0);

    makePack(packA, "security", "1.1.0", ["API_TOKEN", "ACCOUNT_ID"]);

    const second = Bun.spawnSync({
      cmd: ["bun", join(process.cwd(), "src/index.ts"), "lock", "update"],
      cwd: repoRoot,
      env: { ...process.env, NEXUS_DOTFILES_CONFIG_JSON: dotfilesPath },
      stdout: "pipe",
      stderr: "pipe",
    });
    expect(second.exitCode).toBe(0);
    const stdout = second.stdout.toString();
    expect(stdout).toContain("pack version:");
    expect(stdout).toContain("new required var:");
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
