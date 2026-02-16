import { describe, expect, test } from "bun:test";
import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { loadExternalPlugins } from "../src/plugins/loadExternal";
import type { DotfilesRegistry } from "../src/resolver/dotfilesConfig";
import "../src/clientPlugins/builtins";
import "../src/outputPlugins/builtins";
import { applyClientPathNormalization } from "../src/clientPlugins/registry";
import { getOutputPlugin } from "../src/outputPlugins/registry";

function makeRegistry(modulePath: string): DotfilesRegistry {
  return {
    skills: new Map(),
    mcp: new Map(),
    clients: new Map(),
    plugins: new Map([["acme2", { module: modulePath }]]),
    vars: {},
    strictEnv: true,
  };
}

describe("external plugins", () => {
  test("loads plugin module from dotfiles registry by client name", async () => {
    const dir = await mkdtemp(join(tmpdir(), "nexus-ext-plugin-"));
    const pluginMod = join(dir, "acme2.mjs");

    await writeFile(
      pluginMod,
      `import { registerClientFilePlugin } from ${JSON.stringify(join(process.cwd(), "src/clientPlugins/registry.ts"))};\n` +
        `import { registerOutputPlugin } from ${JSON.stringify(join(process.cwd(), "src/outputPlugins/registry.ts"))};\n` +
        `registerClientFilePlugin({ client: "acme2", normalizePath: ({ relPath }) => relPath.replace(/^\\/+/, "").replace("x/", "y/") });\n` +
        `registerOutputPlugin({ id: "codex", desiredPaths: ({ repoRoot }) => [repoRoot + "/.codex/override.toml"], emit: async () => {} });\n`,
      "utf8",
    );

    try {
      await loadExternalPlugins({
        cwd: dir,
        clients: ["acme2"],
        dotfiles: makeRegistry(pluginMod),
      });

      expect(applyClientPathNormalization("acme2", "/x/file")).toBe("y/file");
      expect(getOutputPlugin("codex").desiredPaths({ repoRoot: "/tmp/repo" })).toEqual(["/tmp/repo/.codex/override.toml"]);
    } finally {
      await import(`../src/outputPlugins/builtins?restore=${Date.now()}`);
      await import(`../src/clientPlugins/builtins?restore=${Date.now()}`);
    }
  });
});
