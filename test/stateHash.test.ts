import { describe, expect, it } from "bun:test";
import { computeStateHash } from "../src/state";

describe("state hash", () => {
  it("is stable for same input", () => {
    const a = computeStateHash({
      packs: [{ id: "core", rev: "abc" }],
      enable: { skills: ["a/b:c"], mcp: [] },
      clients: ["claude", "codex"],
      layout: "direct",
    });
    const b = computeStateHash({
      packs: [{ id: "core", rev: "abc" }],
      enable: { skills: ["a/b:c"], mcp: [] },
      clients: ["claude", "codex"],
      layout: "direct",
    });

    expect(a).toBe(b);
    expect(a.length).toBeGreaterThan(10);
  });

  it("changes when enable changes", () => {
    const a = computeStateHash({
      packs: [{ id: "core", rev: "abc" }],
      enable: { skills: ["a/b:c"], mcp: [] },
      clients: ["claude"],
      layout: "direct",
    });
    const b = computeStateHash({
      packs: [{ id: "core", rev: "abc" }],
      enable: { skills: ["a/b:d"], mcp: [] },
      clients: ["claude"],
      layout: "direct",
    });

    expect(a).not.toBe(b);
  });
});
