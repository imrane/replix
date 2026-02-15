import { describe, expect, it } from "bun:test";
import { mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { runNexus } from "../src/runNexus";

const FIX = join(import.meta.dir, "..", "fixtures");

function readTree(root: string, rel = ""): Record<string, string> {
  const out: Record<string, string> = {};
  const dir = join(root, rel);
  for (const ent of readdirSync(dir, { withFileTypes: true })) {
    const childRel = rel ? `${rel}/${ent.name}` : ent.name;
    const childAbs = join(root, childRel);
    if (ent.isDirectory()) {
      Object.assign(out, readTree(root, childRel));
    } else if (ent.isFile()) {
      out[childRel] = readFileSync(childAbs, "utf8");
    }
  }
  return out;
}

describe("golden: v2 config-mode", () => {
  it("direct layout matches golden outputs", async () => {
    const repoRoot = mkdtempSync(join(tmpdir(), "nexus-golden-v2-direct-"));
    try {
      const dotfilesCfgPath = join(repoRoot, "dotfiles.json");
      writeFileSync(
        dotfilesCfgPath,
        JSON.stringify({
          skills: {
            "repo-status": {
              source: `path:${join(FIX, "packs", "core", "skills", "repo-status")}`,
            },
          },
          mcp: {
            filesystem: {
              command: "npx",
              args: ["-y", "@modelcontextprotocol/server-filesystem", "/home"],
            },
          },
        }),
      );

      process.env.NEXUS_DOTFILES_CONFIG_JSON = dotfilesCfgPath;

      const cfgPath = join(repoRoot, "config.json");
      writeFileSync(
        cfgPath,
        JSON.stringify({
          version: 1,
          repoRoot,
          clients: ["claude", "mcp"],
          enable: { skills: ["repo-status"], mcp: ["filesystem"] },
          overrides: { skills: {}, mcp: {} },
          layout: "direct",
        }),
      );

      await runNexus({ cwd: repoRoot, configPath: cfgPath });

      const expected = readTree(join(FIX, "golden", "v2", "direct"));
      const actual = readTree(repoRoot);

      const picked: Record<string, string> = {};
      for (const k of Object.keys(expected)) picked[k] = actual[k] ?? "";

      expect(picked).toEqual(expected);
    } finally {
      rmSync(repoRoot, { recursive: true, force: true });
    }
  });

  it("generated layout matches golden outputs", async () => {
    const repoRoot = mkdtempSync(join(tmpdir(), "nexus-golden-v2-generated-"));
    try {
      const dotfilesCfgPath = join(repoRoot, "dotfiles.json");
      writeFileSync(
        dotfilesCfgPath,
        JSON.stringify({
          skills: {
            "repo-status": {
              source: `path:${join(FIX, "packs", "core", "skills", "repo-status")}`,
            },
          },
          mcp: {
            filesystem: {
              command: "npx",
              args: ["-y", "@modelcontextprotocol/server-filesystem", "/home"],
            },
          },
        }),
      );

      process.env.NEXUS_DOTFILES_CONFIG_JSON = dotfilesCfgPath;

      const cfgPath = join(repoRoot, "config.json");
      writeFileSync(
        cfgPath,
        JSON.stringify({
          version: 1,
          repoRoot,
          clients: ["claude", "mcp"],
          enable: { skills: ["repo-status"], mcp: ["filesystem"] },
          overrides: { skills: {}, mcp: {} },
          layout: "generated",
        }),
      );

      await runNexus({ cwd: repoRoot, configPath: cfgPath });

      const expected = readTree(join(FIX, "golden", "v2", "generated"));
      const actual = readTree(repoRoot);

      const picked: Record<string, string> = {};
      for (const k of Object.keys(expected)) picked[k] = actual[k] ?? "";

      expect(picked).toEqual(expected);
    } finally {
      rmSync(repoRoot, { recursive: true, force: true });
    }
  });
});
