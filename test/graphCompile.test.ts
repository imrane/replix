import { describe, expect, it } from "bun:test";
import { compileGraph } from "../src/graph";

describe("graph compile", () => {
  it("compiles enabled canonical artifacts into graph", () => {
    const g = compileGraph({
      available: {
        skills: new Map([
          ["core/review:code-review", { kind: "skill", itemId: "code-review" }],
        ]),
        mcp: new Map([["core/mcp:filesystem", { kind: "mcp", name: "filesystem" }]]),
        commands: new Map([["core/commands:review", { kind: "command", itemId: "review" }]]),
        hooks: new Map([["core/hooks:pre-commit", { kind: "hook", itemId: "pre-commit" }]]),
        agents: new Map([["core/agents:planner", { kind: "agent", itemId: "planner" }]]),
        settings: new Map([["core/settings:project", { kind: "setting", itemId: "project" }]]),
      },
      enable: {
        skills: ["core/review:code-review"],
        mcp: ["core/mcp:filesystem"],
        commands: ["core/commands:review"],
        hooks: ["core/hooks:pre-commit"],
        agents: ["core/agents:planner"],
        settings: ["core/settings:project"],
      },
    });

    expect(g.skills.map((s) => s.id)).toEqual(["core/review:code-review"]);
    expect(g.mcp.map((m) => m.id)).toEqual(["core/mcp:filesystem"]);
    expect(g.commands.map((c) => c.id)).toEqual(["core/commands:review"]);
    expect(g.hooks.map((h) => h.id)).toEqual(["core/hooks:pre-commit"]);
    expect(g.agents.map((a) => a.id)).toEqual(["core/agents:planner"]);
    expect(g.settings.map((s) => s.id)).toEqual(["core/settings:project"]);
  });

  it("throws if enabled collisions across skill+mcp ids", () => {
    expect(() =>
      compileGraph({
        available: {
          skills: new Map([["a/b:c", { kind: "skill", itemId: "c" }]]),
          mcp: new Map([["a/b:c", { kind: "mcp", name: "c" }]]),
        },
        enable: {
          skills: ["a/b:c"],
          mcp: ["a/b:c"],
          commands: [],
          hooks: [],
          agents: [],
          settings: [],
        },
      }),
    ).toThrow(/collision/i);
  });
});
