import { describe, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { resolveEnabled } from "../src/enableValidation";
import { loadDotfilesRegistryFromEnv, normalizePackSource } from "../src/resolver/dotfilesConfig";

const FIXTURE = new URL("../fixtures/dotfiles/config.json", import.meta.url).pathname;
const PACK_FIXTURE = new URL("../fixtures/packs/core", import.meta.url).pathname;
const CANONICAL_V1_FIXTURE = new URL("../fixtures/packs/examples/canonical-v1", import.meta.url).pathname;

describe("dotfiles config registry", () => {
  test("loads registry from REPLIX_DOTFILES_CONFIG_JSON", async () => {
    process.env.REPLIX_DOTFILES_CONFIG_JSON = FIXTURE;
    const reg = await loadDotfilesRegistryFromEnv();

    expect([...reg.skills.keys()]).toEqual(["humanizer", "repo-status"]);
    expect(reg.skills.get("humanizer")?.source).toContain("path:");

    expect([...reg.mcp.keys()]).toEqual(["filesystem"]);
    expect(reg.mcp.get("filesystem")?.command).toBe("npx");

    expect([...reg.plugins.keys()]).toEqual(["acme2"]);
    expect(reg.plugins.get("acme2")?.module).toBe("./replix-plugins/acme2.mjs");
  });

  test("enableValidation fails when enabled skill missing", async () => {
    process.env.REPLIX_DOTFILES_CONFIG_JSON = FIXTURE;
    const reg = await loadDotfilesRegistryFromEnv();

    expect(() =>
      resolveEnabled(
        { skills: ["does-not-exist"], mcp: [] },
        { skills: new Set(reg.skills.keys()), mcp: new Set(reg.mcp.keys()) }
      )
    ).toThrow(/missing enabled skill/);
  });

  test("artifacts namespace overrides legacy claude namespace when both are set", async () => {
    const dir = mkdtempSync(join(tmpdir(), "replix-dotfiles-artifacts-"));
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

    process.env.REPLIX_DOTFILES_CONFIG_JSON = cfgPath;
    const reg = await loadDotfilesRegistryFromEnv();
    expect(reg.clients.get("claude")?.files?.[".claude/commands/review.md"]?.text).toBe("canonical");
  });

  test("loads pack-first registry and allows direct overrides", async () => {
    const dir = mkdtempSync(join(tmpdir(), "replix-dotfiles-pack-"));
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

    process.env.REPLIX_DOTFILES_CONFIG_JSON = cfgPath;
    const reg = await loadDotfilesRegistryFromEnv();

    expect(reg.skills.get("repo-status")?.source).toBe("path:/override/repo-status");
    expect(reg.mcp.has("filesystem")).toBe(true);
    expect(reg.clients.get("claude")?.files?.[".claude/commands/review.md"]?.source).toContain("fixtures/packs/core/commands/review.md");
    expect(reg.clients.get("claude")?.files?.[".claude/hooks/pre-commit.sh"]?.executable).toBe(true);
    expect(reg.clients.get("claude")?.files?.[".claude/agents/security.md"]?.source).toContain("fixtures/packs/core/agents/security.md");
  });

  test("loads canonical-v1 pack references for commands/hooks/agents/skills", async () => {
    const dir = mkdtempSync(join(tmpdir(), "replix-dotfiles-pack-v1-"));
    const cfgPath = join(dir, "registry.json");

    writeFileSync(
      cfgPath,
      JSON.stringify(
        {
          packs: [{ source: `path:${CANONICAL_V1_FIXTURE}` }],
        },
        null,
        2,
      ),
      "utf8",
    );

    process.env.REPLIX_DOTFILES_CONFIG_JSON = cfgPath;
    const reg = await loadDotfilesRegistryFromEnv();

    expect(reg.skills.has("reviewer")).toBe(true);
    expect(reg.skills.has("triage")).toBe(true);
    expect(reg.mcp.has("filesystem")).toBe(true);
    expect(reg.clients.get("claude")?.files?.[".claude/commands/review-pr.md"]?.source).toContain("canonical-v1/commands/review-pr.md");
    expect(reg.clients.get("claude")?.files?.[".claude/hooks/before-tool.json"]?.source).toContain("canonical-v1/hooks/before-tool.json");
    expect(reg.clients.get("claude")?.files?.[".claude/agents/reviewer.md"]?.source).toContain("canonical-v1/agents/reviewer.md");
  });

  test("fails fast when canonical references point to missing files", async () => {
    const dir = mkdtempSync(join(tmpdir(), "replix-dotfiles-pack-badref-"));
    const packDir = join(dir, "pack");
    mkdirSync(join(packDir, "mcp"), { recursive: true });

    writeFileSync(
      join(packDir, "pack.json"),
      JSON.stringify(
        {
          id: "bad-pack",
          version: "1.0.0",
          imports: [],
          specVersion: "replix.canonical.v1-draft",
          references: {
            commands: ["commands/missing.md"],
            mcp: ["mcp/servers.json"],
          },
        },
        null,
        2,
      ),
      "utf8",
    );

    writeFileSync(join(packDir, "mcp", "servers.json"), JSON.stringify({}, null, 2), "utf8");

    const cfgPath = join(dir, "registry.json");
    writeFileSync(cfgPath, JSON.stringify({ packs: [{ source: `path:${packDir}` }] }, null, 2), "utf8");

    process.env.REPLIX_DOTFILES_CONFIG_JSON = cfgPath;
    await expect(loadDotfilesRegistryFromEnv()).rejects.toThrow("pack reference file not found");
  });

  test("normalizePackSource supports folder/folders alias for github includes", () => {
    expect(
      normalizePackSource({ source: "github:imrane/replix", folder: "fixtures/packs/examples/starter" }),
    ).toBe("github:imrane/replix?include=fixtures%2Fpacks%2Fexamples%2Fstarter");

    expect(
      normalizePackSource({
        source: "github:imrane/replix?rev=main",
        folders: ["fixtures/packs/examples/starter", "fixtures/packs/examples/security"],
      }),
    ).toBe(
      "github:imrane/replix?rev=main&include=fixtures%2Fpacks%2Fexamples%2Fstarter%2Cfixtures%2Fpacks%2Fexamples%2Fsecurity",
    );

    expect(normalizePackSource({ source: "github:org/packs", pack: "starter" })).toBe(
      "github:org/packs?packs=starter",
    );
  });
});
