import { describe, expect, it } from "bun:test";
import { ensureNoCollisions } from "../src/collision";

describe("collision detection", () => {
  it("throws on duplicate ids", () => {
    expect(() => ensureNoCollisions(["a", "b", "a"])).toThrow(/collision/i);
  });

  it("passes when unique", () => {
    expect(() => ensureNoCollisions(["a", "b", "c"])).not.toThrow();
  });
});
