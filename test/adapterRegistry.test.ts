import { describe, expect, it } from "bun:test";
import { getSelectorAdapter } from "../src/adapters/registry";

describe("selector adapter registry", () => {
  it("resolves built-in adapters", () => {
    expect(getSelectorAdapter("claude")?.client).toBe("claude");
    expect(getSelectorAdapter("opencode")?.client).toBe("opencode");
    expect(getSelectorAdapter("codex")?.client).toBe("codex");
  });

  it("returns null for unknown clients", () => {
    expect(getSelectorAdapter("does-not-exist")).toBeNull();
  });
});
