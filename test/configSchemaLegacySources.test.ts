import { test, expect } from "bun:test";
import { parseNexusConfig } from "../src/configSchema";

test("config schema > accepts legacy config.sources (normalized to overrides)", () => {
  const cfg = parseNexusConfig({
    version: 1,
    repoRoot: null,
    clients: ["claude"],
    enable: { skills: [], mcp: [] },
    sources: { skills: { humanizer: { path: "/tmp/humanizer" } }, mcp: {} },
  });

  expect(cfg.overrides.skills.humanizer.path).toBe("/tmp/humanizer");
});

test("config schema > accepts layout + cleanup enums", () => {
  const cfg = parseNexusConfig({
    version: 1,
    repoRoot: null,
    clients: ["claude"],
    enable: {
      skills: [],
      mcp: [],
      clients: {
        claude: {
          files: [".claude/commands/review.md"],
        },
      },
    },
    overrides: { skills: {}, mcp: {} },
    layout: "generated",
    cleanup: "full",
  });

  expect(cfg.layout).toBe("generated");
  expect(cfg.cleanup).toBe("full");
  expect(cfg.enable.clients?.claude?.files).toEqual([".claude/commands/review.md"]);
});
