import { test, expect } from "bun:test";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, readFileSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

function makePack(root: string, id: string, version: string) {
  mkdirSync(root, { recursive: true });
  writeFileSync(
    join(root, "pack.json"),
    JSON.stringify({ id, version, imports: [], varsSchemaVersion: 1, vars: { required: {}, optional: {} } }, null, 2),
  );
}

test("nexus pack install/list/uninstall > manages .nexus/packs.json", () => {
  const root = mkdtempSync(join(tmpdir(), "nexus-pack-cli-"));
  try {
    const repoRoot = join(root, "repo");
    mkdirSync(repoRoot, { recursive: true });
    const source = "github:acme/security-pack?rev=abc123";

    const install = Bun.spawnSync({
      cmd: ["bun", join(process.cwd(), "src/index.ts"), "pack", "install", source],
      cwd: repoRoot,
      stdout: "pipe",
      stderr: "pipe",
    });
    expect(install.exitCode).toBe(0);

    const packsPath = join(repoRoot, ".nexus", "packs.json");
    expect(existsSync(packsPath)).toBe(true);
    const cfg = JSON.parse(readFileSync(packsPath, "utf8"));
    expect(cfg.packs[0].source).toBe(source);

    const list = Bun.spawnSync({
      cmd: ["bun", join(process.cwd(), "src/index.ts"), "pack", "list"],
      cwd: repoRoot,
      stdout: "pipe",
      stderr: "pipe",
    });
    expect(list.exitCode).toBe(0);
    expect(list.stdout.toString()).toContain(source);

    const uninstall = Bun.spawnSync({
      cmd: ["bun", join(process.cwd(), "src/index.ts"), "pack", "uninstall", source],
      cwd: repoRoot,
      stdout: "pipe",
      stderr: "pipe",
    });
    expect(uninstall.exitCode).toBe(0);

    const cfgAfter = JSON.parse(readFileSync(packsPath, "utf8"));
    expect(cfgAfter.packs.length).toBe(0);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("nexus lock update > uses .nexus/packs.json when env is unset", () => {
  const root = mkdtempSync(join(tmpdir(), "nexus-pack-lock-local-"));
  try {
    const repoRoot = join(root, "repo");
    mkdirSync(repoRoot, { recursive: true });

    const packRoot = join(root, "packs", "local");
    makePack(packRoot, "local-pack", "0.1.0");

    const packsPath = join(repoRoot, ".nexus", "packs.json");
    mkdirSync(join(repoRoot, ".nexus"), { recursive: true });
    writeFileSync(packsPath, JSON.stringify({ packs: [{ source: `path:${packRoot}` }] }, null, 2));

    const out = Bun.spawnSync({
      cmd: ["bun", join(process.cwd(), "src/index.ts"), "lock", "update"],
      cwd: repoRoot,
      env: { ...process.env, NEXUS_DOTFILES_CONFIG_JSON: "" },
      stdout: "pipe",
      stderr: "pipe",
    });

    expect(out.exitCode).toBe(0);
    const lock = JSON.parse(readFileSync(join(repoRoot, "nexus.lock.json"), "utf8"));
    expect(lock.packs.length).toBe(1);
    expect(lock.packs[0].source).toBe(`path:${packRoot}`);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
