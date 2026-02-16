import { describe, expect, it } from "bun:test";
import { codexSelectorAdapter } from "../src/adapters/codex";

describe("codex selector adapter", () => {
  it("returns no repo file paths for canonical selectors (config-only codex surface)", () => {
    const out = codexSelectorAdapter.toClientPaths({
      commands: ["review.md"],
      hooks: ["pre-commit.sh"],
      agents: ["planner.md"],
      settings: ["settings"],
    });

    expect(out).toEqual([]);
  });
});
