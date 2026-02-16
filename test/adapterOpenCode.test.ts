import { describe, expect, it } from "bun:test";
import { opencodeSelectorAdapter } from "../src/adapters/opencode";

describe("opencode selector adapter", () => {
  it("maps canonical selectors to opencode repo paths", () => {
    const out = opencodeSelectorAdapter.toClientPaths({
      commands: ["review.md"],
      hooks: ["pre-commit.sh"],
      agents: ["planner.md"],
      settings: [],
    });

    expect(out).toEqual([
      ".opencode/command/review.md",
      ".opencode/hooks/pre-commit.sh",
      ".opencode/agent/planner.md",
    ]);
  });

  it("ignores settings selectors (currently claude-specific)", () => {
    const out = opencodeSelectorAdapter.toClientPaths({
      commands: [],
      hooks: [],
      agents: [],
      settings: ["settings"],
    });

    expect(out).toEqual([]);
  });
});
