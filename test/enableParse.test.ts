import { describe, expect, it } from "bun:test";
import { parseEnableSpec } from "../src/enable";

describe("enable spec", () => {
  it("parses enable lists", () => {
    const spec = parseEnableSpec({
      skills: ["core/review:code-review"],
      mcp: ["core/mcp:filesystem"],
    });

    expect(spec.skills).toEqual(["core/review:code-review"]);
    expect(spec.mcp).toEqual(["core/mcp:filesystem"]);
  });

  it("defaults missing lists to empty", () => {
    const spec = parseEnableSpec({});
    expect(spec.skills).toEqual([]);
    expect(spec.mcp).toEqual([]);
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
