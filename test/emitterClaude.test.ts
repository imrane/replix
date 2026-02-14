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
    const repoRoot = mkdtempSync(join(tmpdir(), "nexus-repo-"));
    const srcRoot = mkdtempSync(join(tmpdir(), "nexus-skill-"));
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

    const managed = join(repoRoot, ".claude", "skills", ".nexus-managed");
    expect(existsSync(managed)).toBeTrue();
    expect(read(managed)).toContain("nexus");

    const outSkill = join(repoRoot, ".claude", "skills", "code-review", "SKILL.md");
    expect(existsSync(outSkill)).toBeTrue();
    expect(read(outSkill)).toContain("Code review");
  });
});
