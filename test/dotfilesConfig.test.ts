import { describe, expect, test } from "bun:test";
import { resolveEnabled } from "../src/enableValidation";
import { loadDotfilesRegistryFromEnv } from "../src/resolver/dotfilesConfig";

const FIXTURE = new URL("../fixtures/dotfiles/config.json", import.meta.url).pathname;

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
});
