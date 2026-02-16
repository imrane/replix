import { describe, expect, it } from "bun:test";
import { parseEnableSpec } from "../src/enable";

describe("enable spec", () => {
  it("parses enable lists", () => {
    const spec = parseEnableSpec({
      skills: ["core/review:code-review"],
      mcp: ["core/mcp:filesystem"],
      commands: ["core/commands:review"],
      hooks: ["core/hooks:pre-commit"],
      agents: ["core/agents:planner"],
      settings: ["core/settings:project"],
    });

    expect(spec.skills).toEqual(["core/review:code-review"]);
    expect(spec.mcp).toEqual(["core/mcp:filesystem"]);
    expect(spec.commands).toEqual(["core/commands:review"]);
    expect(spec.hooks).toEqual(["core/hooks:pre-commit"]);
    expect(spec.agents).toEqual(["core/agents:planner"]);
    expect(spec.settings).toEqual(["core/settings:project"]);
  });

  it("defaults missing lists to empty", () => {
    const spec = parseEnableSpec({});
    expect(spec.skills).toEqual([]);
    expect(spec.mcp).toEqual([]);
    expect(spec.commands).toEqual([]);
    expect(spec.hooks).toEqual([]);
    expect(spec.agents).toEqual([]);
    expect(spec.settings).toEqual([]);
  });

  it("rejects non-array", () => {
    // @ts-expect-error
    expect(() => parseEnableSpec({ skills: "nope" })).toThrow();
  });

  it("rejects non-string entries", () => {
    // @ts-expect-error
    expect(() => parseEnableSpec({ skills: [1] })).toThrow();
  });
});
