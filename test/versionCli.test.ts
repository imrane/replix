import { test, expect } from "bun:test";
import { join } from "node:path";

test("replix --version prints package version", () => {
  const out = Bun.spawnSync({
    cmd: ["bun", join(process.cwd(), "src/index.ts"), "--version"],
    cwd: process.cwd(),
    stdout: "pipe",
    stderr: "pipe",
  });

  expect(out.exitCode).toBe(0);
  const version = out.stdout.toString().trim();
  expect(version).toMatch(/^\d+\.\d+\.\d+/);
});
