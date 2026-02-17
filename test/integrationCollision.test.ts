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

describe("integration: collision detection", () => {
  it("errors when skill and mcp have same id", async () => {
    const packRoot = mkdtempSync(join(tmpdir(), "replix-pack-"));

    // Create a skill with id "collision"
    const skillDir = join(packRoot, "skills", "collision");
    mkdirSync(skillDir, { recursive: true });
    writeFileSync(join(skillDir, "SKILL.md"), "# collision skill");

    // Create an MCP server with id "collision"
    const mcpDir = join(packRoot, "mcp");
    mkdirSync(mcpDir, { recursive: true });
    const mcpServers = {
      collision: {
        command: "test",
      },
    };
    writeFileSync(join(mcpDir, "servers.json"), JSON.stringify(mcpServers, null, 2));

    // Enable both (collision)
    const packJson = {
      id: "test",
      version: "1.0.0",
      imports: [],
      enable: {
        skills: ["collision"],
        mcp: ["collision"],
      },
    };
    writeFileSync(join(packRoot, "pack.json"), JSON.stringify(packJson, null, 2));

    const result = await runCli(packRoot);

    expect(result.exitCode).toBe(1);
    expect(result.stderr).toContain("collision");
  });
});
