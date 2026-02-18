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

test("replix add + pack list/uninstall > manages .replix/packs.json", () => {
  const root = mkdtempSync(join(tmpdir(), "replix-pack-cli-"));
  try {
    const repoRoot = join(root, "repo");
    mkdirSync(repoRoot, { recursive: true });
    const source = "github:acme/security-pack?rev=abc123";

    const install = Bun.spawnSync({
      cmd: ["bun", join(process.cwd(), "src/index.ts"), "add", source],
      cwd: repoRoot,
      stdout: "pipe",
      stderr: "pipe",
    });
    expect(install.exitCode).toBe(0);
    expect(install.stdout.toString()).toContain("replix add: added");

    const packsPath = join(repoRoot, ".replix", "packs.json");
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

test("replix lock update > uses .replix/packs.json when env is unset", () => {
  const root = mkdtempSync(join(tmpdir(), "replix-pack-lock-local-"));
  try {
    const repoRoot = join(root, "repo");
    mkdirSync(repoRoot, { recursive: true });

    const packRoot = join(root, "packs", "local");
    makePack(packRoot, "local-pack", "0.1.0");

    const packsPath = join(repoRoot, ".replix", "packs.json");
    mkdirSync(join(repoRoot, ".replix"), { recursive: true });
    writeFileSync(packsPath, JSON.stringify({ packs: [{ source: `path:${packRoot}` }] }, null, 2));

    const out = Bun.spawnSync({
      cmd: ["bun", join(process.cwd(), "src/index.ts"), "lock", "update"],
      cwd: repoRoot,
      env: { ...process.env, REPLIX_DOTFILES_CONFIG_JSON: "" },
      stdout: "pipe",
      stderr: "pipe",
    });

    expect(out.exitCode).toBe(0);
    const lock = JSON.parse(readFileSync(join(repoRoot, "replix.lock.json"), "utf8"));
    expect(lock.packs.length).toBe(1);
    expect(lock.packs[0].source).toBe(`path:${packRoot}`);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("replix add > auto-pins floating github source using lockfile rev", () => {
  const root = mkdtempSync(join(tmpdir(), "replix-pack-autopin-"));
  try {
    const repoRoot = join(root, "repo");
    mkdirSync(join(repoRoot, ".replix"), { recursive: true });

    writeFileSync(
      join(repoRoot, "replix.lock.json"),
      JSON.stringify(
        {
          version: 1,
          packs: [
            {
              source: "github:acme/security-pack#skills/security-pack",
              rev: "deadbeefcafebabe",
              version: "0.1.0",
              requiredVars: [],
            },
          ],
        },
        null,
        2,
      ) + "\n",
    );

    const add = Bun.spawnSync({
      cmd: ["bun", join(process.cwd(), "src/index.ts"), "add", "github:acme/security-pack#skills/security-pack"],
      cwd: repoRoot,
      stdout: "pipe",
      stderr: "pipe",
    });

    expect(add.exitCode).toBe(0);
    expect(add.stdout.toString()).toContain("auto-pinned via lockfile rev deadbeefcafebabe");

    const packs = JSON.parse(readFileSync(join(repoRoot, ".replix", "packs.json"), "utf8"));
    expect(packs.packs[0].source).toBe("github:acme/security-pack?rev=deadbeefcafebabe#skills/security-pack");
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("replix add <github-repo> <pack-alias> appends pack query ergonomically", () => {
  const root = mkdtempSync(join(tmpdir(), "replix-pack-alias-ergonomic-"));
  try {
    const repoRoot = join(root, "repo");
    mkdirSync(repoRoot, { recursive: true });

    const out = Bun.spawnSync({
      cmd: ["bun", join(process.cwd(), "src/index.ts"), "add", "github:imrane/rpacks", "starter"],
      cwd: repoRoot,
      stdout: "pipe",
      stderr: "pipe",
    });

    expect(out.exitCode).toBe(0);
    expect(out.stdout.toString()).toContain("pack alias requested: starter");

    const packs = JSON.parse(readFileSync(join(repoRoot, ".replix", "packs.json"), "utf8"));
    expect(packs.packs[0].source).toBe("github:imrane/rpacks?pack=starter");
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
