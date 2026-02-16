import { describe, expect, it } from "bun:test";
import { resolveEnabled } from "../src/enableValidation";

describe("enable validation", () => {
  it("errors when enabled skill is missing", () => {
    expect(() =>
      resolveEnabled(
        {
          skills: ["core/review:code-review"],
          mcp: [],
          commands: [],
          hooks: [],
          agents: [],
          settings: [],
        },
        {
          skills: new Set(),
          mcp: new Set(),
          commands: new Set(),
          hooks: new Set(),
          agents: new Set(),
          settings: new Set(),
        },
      ),
    ).toThrow(/missing enabled skill/i);
  });

  it("errors when enabled mcp is missing", () => {
    expect(() =>
      resolveEnabled(
        {
          skills: [],
          mcp: ["core/mcp:filesystem"],
          commands: [],
          hooks: [],
          agents: [],
          settings: [],
        },
        {
          skills: new Set(),
          mcp: new Set(),
          commands: new Set(),
          hooks: new Set(),
          agents: new Set(),
          settings: new Set(),
        },
      ),
    ).toThrow(/missing enabled mcp/i);
  });

  it("returns enabled ids when present", () => {
    const out = resolveEnabled(
      {
        skills: ["a/b:c"],
        mcp: ["x/y:z"],
        commands: [],
        hooks: [],
        agents: [],
        settings: [],
      },
      {
        skills: new Set(["a/b:c"]),
        mcp: new Set(["x/y:z"]),
        commands: new Set(),
        hooks: new Set(),
        agents: new Set(),
        settings: new Set(),
      },
    );

    expect(out.skills).toEqual(["a/b:c"]);
    expect(out.mcp).toEqual(["x/y:z"]);
    expect(out.commands).toEqual([]);
    expect(out.hooks).toEqual([]);
    expect(out.agents).toEqual([]);
    expect(out.settings).toEqual([]);
  });
});
