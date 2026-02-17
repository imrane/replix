import { test, expect } from "bun:test";
import { parseReplixConfig } from "../src/configSchema";

test("config schema > accepts legacy config.sources (normalized to overrides)", () => {
  const cfg = parseReplixConfig({
    version: 1,
    repoRoot: null,
    clients: ["claude"],
    enable: { skills: [], mcp: [] },
    sources: { skills: { humanizer: { path: "/tmp/humanizer" } }, mcp: {} },
  });

  expect(cfg.overrides.skills.humanizer.path).toBe("/tmp/humanizer");
});

test("config schema > accepts layout + cleanup enums", () => {
  const cfg = parseReplixConfig({
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

test("config schema > codex client accepts config + skill shim roots", () => {
  const cfg = parseReplixConfig({
    version: 1,
    repoRoot: null,
    clients: ["codex"],
    enable: {
      skills: [],
      mcp: [],
      clients: {
        codex: {
          files: [".codex/config.toml", ".agents/skills/humanizer/SKILL.md", ".codex/skills/humanizer/SKILL.md"],
        },
      },
    },
    overrides: { skills: {}, mcp: {} },
  });

  expect(cfg.enable.clients?.codex?.files).toEqual([
    ".codex/config.toml",
    ".agents/skills/humanizer/SKILL.md",
    ".codex/skills/humanizer/SKILL.md",
  ]);
});

test("config schema > rejects unsupported codex client file paths", () => {
  expect(() =>
    parseReplixConfig({
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

test("config schema > rejects unsupported codex repo roots outside allowed shim paths", () => {
  expect(() =>
    parseReplixConfig({
      version: 1,
      repoRoot: null,
      clients: ["codex"],
      enable: {
        skills: [],
        mcp: [],
        clients: {
          codex: {
            files: [".agents/prompts/review.md"],
          },
        },
      },
      overrides: { skills: {}, mcp: {} },
    }),
  ).toThrow("unsupported codex repo file path");
});
