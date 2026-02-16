import { describe, expect, it } from "bun:test";
import { claudeSelectorAdapter } from "../src/adapters/claude";

describe("claude selector adapter", () => {
  it("maps canonical selectors to claude repo paths", () => {
    const out = claudeSelectorAdapter.toClientPaths({
      commands: ["review.md"],
      hooks: ["pre-commit.sh"],
      agents: ["planner.md"],
      settings: ["settings", "settingsLocal"],
    });

    expect(out).toEqual([
      ".claude/commands/review.md",
      ".claude/hooks/pre-commit.sh",
      ".claude/agents/planner.md",
      ".claude/settings.json",
      ".claude/settings.local.json",
    ]);
  });

  it("rejects unknown setting selector", () => {
    expect(() =>
      claudeSelectorAdapter.toClientPaths({
        commands: [],
        hooks: [],
        agents: [],
        settings: ["workspace"],
      }),
    ).toThrow(/unsupported claude setting selector/i);
  });
});
