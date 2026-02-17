import { test, expect } from "bun:test";
import { join } from "node:path";

test("replix spec validate-client-shapes > passes for current snapshots", () => {
  const out = Bun.spawnSync({
    cmd: ["bun", join(process.cwd(), "src/index.ts"), "spec", "validate-client-shapes", "--max-age-days", "3650"],
    cwd: process.cwd(),
    stdout: "pipe",
    stderr: "pipe",
  });

  expect(out.exitCode).toBe(0);
  const text = out.stdout.toString();
  expect(text).toContain("src/clientPlugins/claude/client-shape.snapshot.json");
  expect(text).toContain("src/clientPlugins/opencode/client-shape.snapshot.json");
  expect(text).toContain("src/clientPlugins/codex/client-shape.snapshot.json");
});
