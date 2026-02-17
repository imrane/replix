import { test, expect } from "bun:test";
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

test("nexus init > scaffolds .nexus config and vars example", () => {
  const root = mkdtempSync(join(tmpdir(), "nexus-init-cli-"));
  try {
    const out = Bun.spawnSync({
      cmd: ["bun", join(process.cwd(), "src/index.ts"), "init", "--client", "opencode"],
      cwd: root,
      env: { ...process.env },
      stdout: "pipe",
      stderr: "pipe",
    });

    expect(out.exitCode).toBe(0);
    expect(out.stdout.toString()).toContain("nexus init: scaffold ready");

    const cfgPath = join(root, ".nexus", "repo.json");
    const varsExamplePath = join(root, ".nexus", "vars", ".example");

    expect(existsSync(cfgPath)).toBe(true);
    expect(existsSync(varsExamplePath)).toBe(true);

    const cfg = JSON.parse(readFileSync(cfgPath, "utf8"));
    expect(cfg.clients).toEqual(["opencode"]);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("nexus init --with-lock > writes lockfile when dotfiles packs are available", () => {
  const root = mkdtempSync(join(tmpdir(), "nexus-init-lock-"));
  try {
    const pack = join(root, "packs", "starter");
    mkdirSync(pack, { recursive: true });
    writeFileSync(
      join(pack, "pack.json"),
      JSON.stringify({ id: "starter", version: "1.0.0", imports: [] }, null, 2),
    );

    const dotfilesPath = join(root, "dotfiles.json");
    writeFileSync(dotfilesPath, JSON.stringify({ packs: [{ source: `path:${pack}` }] }, null, 2));

    const out = Bun.spawnSync({
      cmd: ["bun", join(process.cwd(), "src/index.ts"), "init", "--with-lock"],
      cwd: root,
      env: { ...process.env, NEXUS_DOTFILES_CONFIG_JSON: dotfilesPath },
      stdout: "pipe",
      stderr: "pipe",
    });

    expect(out.exitCode).toBe(0);
    expect(existsSync(join(root, "nexus.lock.json"))).toBe(true);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
