import { test, expect } from "bun:test";
import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

test("nexus spec compile CLI > compiles snapshot to schema", () => {
  const root = mkdtempSync(join(tmpdir(), "nexus-spec-cli-"));
  const inPath = join(process.cwd(), "fixtures", "spec", "claude.snapshot.json");
  const outPath = join(root, "claude.schema.json");

  const run = Bun.spawnSync({
    cmd: ["bun", "src/index.ts", "spec", "compile", "--in", inPath, "--out", outPath],
    cwd: process.cwd(),
    env: { ...process.env },
    stdout: "pipe",
    stderr: "pipe",
  });

  expect(run.exitCode).toBe(0);
  expect(run.stdout.toString()).toContain("nexus spec compile");

  const out = readFileSync(outPath, "utf8");
  expect(out).toContain('"client": "claude"');
  expect(out).toContain('"kind": "command"');
});
