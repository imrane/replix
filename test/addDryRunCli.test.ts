import { test, expect } from "bun:test";
import { mkdtempSync, mkdirSync, existsSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

test("replix add --dry-run previews without writing packs file", () => {
  const root = mkdtempSync(join(tmpdir(), "replix-add-dry-run-"));
  try {
    const repoRoot = join(root, "repo");
    mkdirSync(repoRoot, { recursive: true });

    const out = Bun.spawnSync({
      cmd: ["bun", join(process.cwd(), "src/index.ts"), "add", "github:acme/security-pack?rev=abc123", "--dry-run"],
      cwd: repoRoot,
      stdout: "pipe",
      stderr: "pipe",
    });

    expect(out.exitCode).toBe(0);
    expect(out.stdout.toString()).toContain("DRY RUN");
    expect(existsSync(join(repoRoot, ".replix", "packs.json"))).toBe(false);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("replix add --dry-run shows already-installed status", () => {
  const root = mkdtempSync(join(tmpdir(), "replix-add-dry-run-existing-"));
  try {
    const repoRoot = join(root, "repo");
    mkdirSync(join(repoRoot, ".replix"), { recursive: true });
    const source = "github:acme/security-pack?rev=abc123";
    writeFileSync(join(repoRoot, ".replix", "packs.json"), JSON.stringify({ packs: [{ source }] }, null, 2) + "\n");

    const out = Bun.spawnSync({
      cmd: ["bun", join(process.cwd(), "src/index.ts"), "add", source, "--dry-run"],
      cwd: repoRoot,
      stdout: "pipe",
      stderr: "pipe",
    });

    expect(out.exitCode).toBe(0);
    expect(out.stdout.toString()).toContain("already present");
    const cfg = JSON.parse(readFileSync(join(repoRoot, ".replix", "packs.json"), "utf8"));
    expect(cfg.packs.length).toBe(1);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
