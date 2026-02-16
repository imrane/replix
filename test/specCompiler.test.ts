import { describe, expect, it } from "bun:test";
import { compileClientSpec } from "../src/specCompiler";

describe("spec compiler", () => {
  it("applies defaults and validates output schema", () => {
    const schema = compileClientSpec({
      client: "claude",
      source: {},
      artifacts: [{ kind: "command", path: ".claude/commands/review.md" }],
    });

    expect(schema.version).toBe("unversioned");
    expect(schema.artifacts[0]?.cleanup).toBe("owned-only");
  });

  it("fails unsafe paths", () => {
    expect(() =>
      compileClientSpec({
        client: "codex",
        artifacts: [{ kind: "settings", path: ".claude/settings.json" }],
      }),
    ).toThrow(/outside allowed roots/);
  });
});
