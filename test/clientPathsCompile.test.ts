import { describe, expect, it } from "bun:test";
import { parseEnableSpec } from "../src/enable";
import { resolveCanonicalSelectorPaths, resolveEnabledClientPaths } from "../src/compile/clientPaths";

describe("client path compile", () => {
  it("resolves canonical selector paths via adapter", () => {
    const enable = parseEnableSpec({
      commands: ["review.md"],
      hooks: ["pre-commit.sh"],
      agents: ["planner.md"],
      settings: ["settings"],
    });

    const out = resolveCanonicalSelectorPaths("claude", enable);
    expect(out).toEqual([
      ".claude/commands/review.md",
      ".claude/hooks/pre-commit.sh",
      ".claude/agents/planner.md",
      ".claude/settings.json",
    ]);
  });

  it("uses canonical-only selection when selectors are set and no explicit file list", () => {
    const enable = parseEnableSpec({ commands: ["review.md"] });
    const out = resolveEnabledClientPaths({
      client: "claude",
      enable,
      explicitPaths: undefined,
      definedPaths: [".claude/commands/other.md"],
    });

    expect(out).toEqual([".claude/commands/review.md"]);
  });

  it("merges explicit path selection with canonical selector paths", () => {
    const enable = parseEnableSpec({ commands: ["review.md"] });
    const out = resolveEnabledClientPaths({
      client: "claude",
      enable,
      explicitPaths: [".claude/hooks/pre-commit.sh"],
      definedPaths: [],
    });

    expect(out).toEqual([".claude/hooks/pre-commit.sh", ".claude/commands/review.md"]);
  });
});
