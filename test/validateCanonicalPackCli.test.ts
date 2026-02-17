import { test, expect } from "bun:test";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

test("nexus spec validate-canonical-pack > passes for canonical-v1 fixture", () => {
  const packRoot = join(process.cwd(), "fixtures", "packs", "examples", "canonical-v1");
  const out = Bun.spawnSync({
    cmd: ["bun", join(process.cwd(), "src/index.ts"), "spec", "validate-canonical-pack", "--pack", packRoot],
    cwd: process.cwd(),
    stdout: "pipe",
    stderr: "pipe",
  });
  expect(out.exitCode).toBe(0);
  expect(out.stdout.toString()).toContain("canonical pack valid");
});

test("nexus spec validate-canonical-pack > fails for invalid refs", () => {
  const root = mkdtempSync(join(tmpdir(), "nexus-bad-canon-pack-"));
  try {
    mkdirSync(root, { recursive: true });
    writeFileSync(
      join(root, "pack.json"),
      JSON.stringify(
        {
          id: "bad",
          version: "1.0.0",
          imports: [],
          specVersion: "nexus.canonical.v1-draft",
          references: {
            commands: ["commands/review.txt"],
          },
        },
        null,
        2,
      ),
    );

    const out = Bun.spawnSync({
      cmd: ["bun", join(process.cwd(), "src/index.ts"), "spec", "validate-canonical-pack", "--pack", root],
      cwd: process.cwd(),
      stdout: "pipe",
      stderr: "pipe",
    });

    expect(out.exitCode).toBe(2);
    expect(out.stderr.toString()).toContain("commands invalid ref");
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
