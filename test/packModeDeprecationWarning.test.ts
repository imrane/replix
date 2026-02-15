import { describe, expect, it } from "bun:test";
import { mkdtempSync, writeFileSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { $ } from "bun";

async function runCli(cwd: string): Promise<{ stdout: string; stderr: string; exitCode: number }> {
  const indexPath = join(import.meta.dir, "..", "src", "index.ts");
  try {
    const proc = await $`bun ${indexPath}`.cwd(cwd).quiet();
    return {
      stdout: proc.stdout?.toString() ?? "",
      stderr: proc.stderr?.toString() ?? "",
      exitCode: proc.exitCode ?? 0,
    };
  } catch (e: any) {
    return {
      stdout: e.stdout?.toString() ?? "",
      stderr: e.stderr?.toString() ?? "",
      exitCode: e.exitCode ?? 1,
    };
  }
}

describe("pack mode deprecation warning", () => {
  it("warns when running legacy pack.json mode", async () => {
    const packRoot = mkdtempSync(join(tmpdir(), "nexus-pack-deprecation-"));

    writeFileSync(
      join(packRoot, "pack.json"),
      JSON.stringify(
        {
          id: "test-pack",
          version: "1.0.0",
          imports: [],
          enable: { skills: [], mcp: [] },
        },
        null,
        2,
      ),
    );

    mkdirSync(join(packRoot, "skills"), { recursive: true });

    const result = await runCli(packRoot);

    expect(result.exitCode).toBe(0);
    expect(result.stderr).toContain("[DEPRECATED] pack.json mode is legacy");
    expect(result.stderr).toContain("v2.0.0");
    expect(result.stderr).toContain("dotfiles + mkRepo config mode");
  });
});
