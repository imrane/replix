import { describe, expect, test } from "bun:test";
import { mkdtempSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { resolveEnabled } from "../src/enableValidation";
import { loadDotfilesRegistryFromEnv } from "../src/resolver/dotfilesConfig";

const FIXTURE = new URL("../fixtures/dotfiles/config.json", import.meta.url).pathname;
const PACK_FIXTURE = new URL("../fixtures/packs/core", import.meta.url).pathname;

describe("dotfiles config registry", () => {
  test("loads registry from NEXUS_DOTFILES_CONFIG_JSON", async () => {
    process.env.NEXUS_DOTFILES_CONFIG_JSON = FIXTURE;
    const reg = await loadDotfilesRegistryFromEnv();

    expect([...reg.skills.keys()]).toEqual(["humanizer", "repo-status"]);
    expect(reg.skills.get("humanizer")?.source).toContain("path:");

    expect([...reg.mcp.keys()]).toEqual(["filesystem"]);
    expect(reg.mcp.get("filesystem")?.command).toBe("npx");

    expect([...reg.plugins.keys()]).toEqual(["acme2"]);
    expect(reg.plugins.get("acme2")?.module).toBe("./nexus-plugins/acme2.mjs");
  });

  test("enableValidation fails when enabled skill missing", async () => {
    process.env.NEXUS_DOTFILES_CONFIG_JSON = FIXTURE;
    const reg = await loadDotfilesRegistryFromEnv();

    expect(() =>
      resolveEnabled(
        { skills: ["does-not-exist"], mcp: [] },
        { skills: new Set(reg.skills.keys()), mcp: new Set(reg.mcp.keys()) }
      )
    ).toThrow(/missing enabled skill/);
  });

  test("artifacts namespace overrides legacy claude namespace when both are set", async () => {
    const dir = mkdtempSync(join(tmpdir(), "nexus-dotfiles-artifacts-"));
    const cfgPath = join(dir, "registry.json");

    writeFileSync(
      cfgPath,
      JSON.stringify(
        {
          claude: {
            commands: {
              "review.md": { text: "legacy" },
            },
          },
          artifacts: {
            commands: {
              "review.md": { text: "canonical" },
            },
          },
        },
        null,
        2,
      ),
      "utf8",
    );

    process.env.NEXUS_DOTFILES_CONFIG_JSON = cfgPath;
    const reg = await loadDotfilesRegistryFromEnv();
    expect(reg.clients.get("claude")?.files?.[".claude/commands/review.md"]?.text).toBe("canonical");
  });

  test("loads pack-first registry and allows direct overrides", async () => {
    const dir = mkdtempSync(join(tmpdir(), "nexus-dotfiles-pack-"));
    const cfgPath = join(dir, "registry.json");

    writeFileSync(
      cfgPath,
      JSON.stringify(
        {
          packs: [{ source: `path:${PACK_FIXTURE}` }],
          skills: {
            "repo-status": { source: "path:/override/repo-status" },
          },
        },
        null,
        2,
      ),
      "utf8",
    );

    process.env.NEXUS_DOTFILES_CONFIG_JSON = cfgPath;
    const reg = await loadDotfilesRegistryFromEnv();

    expect(reg.skills.get("repo-status")?.source).toBe("path:/override/repo-status");
    expect(reg.mcp.has("filesystem")).toBe(true);
    expect(reg.clients.get("claude")?.files?.[".claude/commands/review.md"]?.source).toContain("fixtures/packs/core/commands/review.md");
    expect(reg.clients.get("claude")?.files?.[".claude/hooks/pre-commit.sh"]?.executable).toBe(true);
    expect(reg.clients.get("claude")?.files?.[".claude/agents/security.md"]?.source).toContain("fixtures/packs/core/agents/security.md");
  });
});
