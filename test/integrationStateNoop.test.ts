import { describe, expect, it } from "bun:test";
import { mkdtempSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
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

describe("integration: state hash no-op", () => {
  it("second activation should skip writes when state unchanged", async () => {
    const packRoot = mkdtempSync(join(tmpdir(), "replix-pack-"));

    // Create a minimal pack
    const skillDir = join(packRoot, "skills", "test-skill");
    mkdirSync(skillDir, { recursive: true });
    writeFileSync(join(skillDir, "SKILL.md"), "# Test Skill");

    const packJson = {
      id: "test",
      version: "1.0.0",
      imports: [],
      enable: {
        skills: ["test-skill"],
        mcp: [],
      },
    };
    writeFileSync(join(packRoot, "pack.json"), JSON.stringify(packJson, null, 2));

    // First run: should emit
    const run1 = await runCli(packRoot);
    expect(run1.exitCode).toBe(0);
    expect(run1.stdout).toContain("emitting outputs");

    // Verify outputs were created
    expect(existsSync(join(packRoot, ".claude", "skills", "test-skill", "SKILL.md"))).toBeTrue();
    expect(existsSync(join(packRoot, ".claude", ".replix-state"))).toBeTrue();

    // Second run: should skip (no changes)
    const run2 = await runCli(packRoot);
    expect(run2.exitCode).toBe(0);
    expect(run2.stdout).toContain("no changes");
    expect(run2.stdout).toContain("skipping emit");
  });

  it("re-emits when state changes", async () => {
    const packRoot = mkdtempSync(join(tmpdir(), "replix-pack-"));

    // Create a pack with one skill
    const skill1Dir = join(packRoot, "skills", "skill1");
    mkdirSync(skill1Dir, { recursive: true });
    writeFileSync(join(skill1Dir, "SKILL.md"), "# Skill 1");

    const skill2Dir = join(packRoot, "skills", "skill2");
    mkdirSync(skill2Dir, { recursive: true });
    writeFileSync(join(skill2Dir, "SKILL.md"), "# Skill 2");

    let packJson = {
      id: "test",
      version: "1.0.0",
      imports: [],
      enable: {
        skills: ["skill1"],
        mcp: [],
      },
    };
    writeFileSync(join(packRoot, "pack.json"), JSON.stringify(packJson, null, 2));

    // First run
    const run1 = await runCli(packRoot);
    expect(run1.exitCode).toBe(0);
    expect(run1.stdout).toContain("emitting outputs");

    // Change enabled skills
    packJson.enable.skills = ["skill2"];
    writeFileSync(join(packRoot, "pack.json"), JSON.stringify(packJson, null, 2));

    // Second run: should re-emit (state changed)
    const run2 = await runCli(packRoot);
    expect(run2.exitCode).toBe(0);
    expect(run2.stdout).toContain("emitting outputs");
    expect(run2.stdout).not.toContain("skipping emit");

    // Verify new skill was emitted
    expect(existsSync(join(packRoot, ".claude", "skills", "skill2", "SKILL.md"))).toBeTrue();
  });
});
