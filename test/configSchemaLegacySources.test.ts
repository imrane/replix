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

test("config schema > codex client only accepts .codex/config.toml", () => {
  const cfg = parseNexusConfig({
    version: 1,
    repoRoot: null,
    clients: ["codex"],
    enable: {
      skills: [],
      mcp: [],
      clients: {
        codex: {
          files: [".codex/config.toml"],
        },
      },
    },
    overrides: { skills: {}, mcp: {} },
  });

  expect(cfg.enable.clients?.codex?.files).toEqual([".codex/config.toml"]);
});

test("config schema > rejects unsupported codex client file paths", () => {
  expect(() =>
    parseNexusConfig({
      version: 1,
      repoRoot: null,
      clients: ["codex"],
      enable: {
        skills: [],
        mcp: [],
        clients: {
          codex: {
            files: [".codex/commands/review.md"],
          },
        },
      },
      overrides: { skills: {}, mcp: {} },
    }),
  ).toThrow("unsupported codex repo file path");
});
