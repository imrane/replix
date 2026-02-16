import { test, expect } from "bun:test";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { codexSelectorAdapter } from "../src/adapters/codex";

test("codex surface matrix fixture > matches codex adapter policy", () => {
  const fixturePath = join(process.cwd(), "fixtures", "codex-surface-matrix.json");
  const fixture = JSON.parse(readFileSync(fixturePath, "utf8"));

  expect(fixture.repoScope.supportedByNexusCore).toEqual([".codex/config.toml"]);
  expect(fixture.repoScope.notInNexusCore).toContain(".agents/skills/**");
  expect(fixture.repoScope.notInNexusCore).toContain(".codex/skills/**");
  expect(fixture.shimGuidance.minimumFiles).toEqual(["SKILL.md"]);
  expect(fixture.shimGuidance.preferredSkillRoots).toContain(".agents/skills/<name>/SKILL.md");

  const mapped = codexSelectorAdapter.toClientPaths({
    commands: ["review.md"],
    hooks: ["pre-commit.sh"],
    agents: ["security.md"],
    settings: ["settings"],
  });

  expect(mapped).toEqual([]);
  expect(fixture.selectorMapping).toEqual({
    commands: [],
    hooks: [],
    agents: [],
    settings: [],
  });

  const shimFixture = join(process.cwd(), "fixtures", "codex-skill-shim", ".agents", "skills", "humanizer", "SKILL.md");
  expect(existsSync(shimFixture)).toBeTrue();
});
