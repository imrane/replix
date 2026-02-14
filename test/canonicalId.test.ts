import { describe, expect, it } from "bun:test";
import { formatId, parseId } from "../src/canonicalId";

describe("canonical id", () => {
  it("formats <pack>/<import>:<item>", () => {
    expect(formatId({ pack: "core", imp: "review", item: "code-review" })).toBe(
      "core/review:code-review",
    );
  });

  it("parses <pack>/<import>:<item>", () => {
    expect(parseId("core/review:code-review")).toEqual({
      pack: "core",
      imp: "review",
      item: "code-review",
    });
  });

  it("rejects missing ':'", () => {
    expect(() => parseId("core/review")).toThrow();
  });

  it("rejects missing '/'", () => {
    expect(() => parseId("core:repo-status")).toThrow();
  });
});
