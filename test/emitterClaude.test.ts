import { describe, expect, it } from "bun:test";
import {
  mkdtempSync,
  readFileSync,
  existsSync,
  mkdirSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { emitClaude } from "../src/emitters/claude";

function read(p: string) {
  return readFileSync(p, "utf8");
}

describe("claude emitter", () => {
  it("writes skill directory and ownership marker", async () => {
    const repoRoot = mkdtempSync(join(tmpdir(), "replix-repo-"));
    const srcRoot = mkdtempSync(join(tmpdir(), "replix-skill-"));
    mkdirSync(join(srcRoot, "skill"), { recursive: true });
    writeFileSync(join(srcRoot, "skill", "SKILL.md"), "# Code review\n");

    await emitClaude({
      repoRoot,
      skills: [
        {
          id: "core/review:code-review",
          itemId: "code-review",
          srcDir: join(srcRoot, "skill"),
        },
      ],
    });

    const managed = join(repoRoot, ".claude", "skills", ".replix-managed");
    expect(existsSync(managed)).toBeTrue();
    expect(read(managed)).toContain("replix");

    const outSkill = join(repoRoot, ".claude", "skills", "code-review", "SKILL.md");
    expect(existsSync(outSkill)).toBeTrue();
    expect(read(outSkill)).toContain("Code review");
  });

  it("skips VCS metadata directories inside skill sources", async () => {
    const repoRoot = mkdtempSync(join(tmpdir(), "replix-repo-"));
    const srcRoot = mkdtempSync(join(tmpdir(), "replix-skill-"));
    const skillDir = join(srcRoot, "skill");
    mkdirSync(skillDir, { recursive: true });
    writeFileSync(join(skillDir, "SKILL.md"), "# Code review\n");
    mkdirSync(join(skillDir, ".git", "objects"), { recursive: true });
    writeFileSync(join(skillDir, ".git", "objects", "secret"), "x");

    await emitClaude({
      repoRoot,
      skills: [
        {
          id: "core/review:code-review",
          itemId: "code-review",
          srcDir: skillDir,
        },
      ],
    });

    const copiedGit = join(repoRoot, ".claude", "skills", "code-review", ".git", "objects", "secret");
    expect(existsSync(copiedGit)).toBeFalse();
  });
});
