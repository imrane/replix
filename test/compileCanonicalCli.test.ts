import { test, expect } from "bun:test";
import { join } from "node:path";

test("nexus compile canonical > emits plan entries for claude", () => {
  const packRoot = join(process.cwd(), "fixtures", "packs", "examples", "canonical-v1");

  const out = Bun.spawnSync({
    cmd: ["bun", join(process.cwd(), "src/index.ts"), "compile", "canonical", "--client", "claude", "--pack", packRoot],
    cwd: process.cwd(),
    stdout: "pipe",
    stderr: "pipe",
  });

  expect(out.exitCode).toBe(0);
  const parsed = JSON.parse(out.stdout.toString());
  expect(parsed.client).toBe("claude");
  expect(parsed.entries.some((e: any) => e.kind === "command" && e.target?.includes(".claude/commands"))).toBe(true);
  expect(parsed.entries.some((e: any) => e.kind === "agent" && e.target?.includes(".claude/agents"))).toBe(true);
  expect(parsed.entries.some((e: any) => e.kind === "hook" && e.target?.includes(".claude/hooks"))).toBe(true);
});

test("nexus compile canonical > codex warns for unsupported command/agent/hook artifacts", () => {
  const packRoot = join(process.cwd(), "fixtures", "packs", "examples", "canonical-v1");

  const out = Bun.spawnSync({
    cmd: ["bun", join(process.cwd(), "src/index.ts"), "compile", "canonical", "--client", "codex", "--pack", packRoot],
    cwd: process.cwd(),
    stdout: "pipe",
    stderr: "pipe",
  });

  expect(out.exitCode).toBe(0);
  const parsed = JSON.parse(out.stdout.toString());
  expect(parsed.entries.some((e: any) => e.kind === "command" && e.warning)).toBe(true);
  expect(parsed.entries.some((e: any) => e.kind === "agent" && e.warning)).toBe(true);
  expect(parsed.entries.some((e: any) => e.kind === "hook" && e.warning)).toBe(true);
});
