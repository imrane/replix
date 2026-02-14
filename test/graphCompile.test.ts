import { describe, expect, it } from "bun:test";
import { compileGraph } from "../src/graph";

describe("graph compile", () => {
  it("compiles enabled skills+mcp into canonical graph", () => {
    const g = compileGraph({
      available: {
        skills: new Map([
          ["core/review:code-review", { kind: "skill", itemId: "code-review" }],
        ]),
        mcp: new Map([["core/mcp:filesystem", { kind: "mcp", name: "filesystem" }]]),
      },
      enable: {
        skills: ["core/review:code-review"],
        mcp: ["core/mcp:filesystem"],
      },
    });

    expect(g.skills.map((s) => s.id)).toEqual(["core/review:code-review"]);
    expect(g.mcp.map((m) => m.id)).toEqual(["core/mcp:filesystem"]);
  });

  it("throws if enabled collisions across skill+mcp ids", () => {
    expect(() =>
      compileGraph({
        available: {
          skills: new Map([["a/b:c", { kind: "skill", itemId: "c" }]]),
          mcp: new Map([["a/b:c", { kind: "mcp", name: "c" }]]),
        },
        enable: { skills: ["a/b:c"], mcp: ["a/b:c"] },
      }),
    ).toThrow(/collision/i);
  });
});
