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

describe("integration: missing enabled item", () => {
  it("errors when enabled skill does not exist", async () => {
    const packRoot = mkdtempSync(join(tmpdir(), "nexus-pack-"));

    // Create pack with non-existent skill enabled
    const packJson = {
      id: "test",
      version: "1.0.0",
      imports: [],
      enable: {
        skills: ["does-not-exist"],
        mcp: [],
      },
    };
    writeFileSync(join(packRoot, "pack.json"), JSON.stringify(packJson, null, 2));
    mkdirSync(join(packRoot, "skills"), { recursive: true });

    const result = await runCli(packRoot);

    expect(result.exitCode).toBe(1);
    expect(result.stderr).toContain("does-not-exist");
  });

  it("errors when enabled mcp does not exist", async () => {
    const packRoot = mkdtempSync(join(tmpdir(), "nexus-pack-"));

    // Create pack with non-existent mcp enabled
    const packJson = {
      id: "test",
      version: "1.0.0",
      imports: [],
      enable: {
        skills: [],
        mcp: ["does-not-exist"],
      },
    };
    writeFileSync(join(packRoot, "pack.json"), JSON.stringify(packJson, null, 2));
    mkdirSync(join(packRoot, "skills"), { recursive: true });

    const result = await runCli(packRoot);

    expect(result.exitCode).toBe(1);
    expect(result.stderr).toContain("does-not-exist");
  });
});
