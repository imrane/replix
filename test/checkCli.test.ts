import { test, expect } from "bun:test";
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

function setupProject() {
  const root = mkdtempSync(join(tmpdir(), "nexus-check-cli-"));
  const skillDir = join(root, "skills", "humanizer");
  mkdirSync(skillDir, { recursive: true });
  writeFileSync(join(skillDir, "SKILL.md"), "---\nname: humanizer\n---\n\n# humanizer\n");

  const dotfilesPath = join(root, "dotfiles.json");
  writeFileSync(
    dotfilesPath,
    JSON.stringify(
      {
        skills: { humanizer: { source: `path:${skillDir}` } },
        mcp: { filesystem: { command: "npx", args: ["-y", "@modelcontextprotocol/server-filesystem"] } },
      },
      null,
      2,
    ),
  );

  const configPath = join(root, "config.json");
  writeFileSync(
    configPath,
    JSON.stringify(
      {
        version: 1,
        repoRoot: root,
        clients: ["claude"],
        enable: {
          skills: ["humanizer"],
          mcp: ["filesystem"],
        },
        overrides: { skills: {}, mcp: {} },
      },
      null,
      2,
    ),
  );

  return { root, dotfilesPath, configPath };
}

test("nexus check > returns success when outputs are in sync", () => {
  const { root, dotfilesPath, configPath } = setupProject();

  const emit = Bun.spawnSync({
    cmd: ["bun", "src/index.ts", "--config", configPath],
    cwd: process.cwd(),
    env: { ...process.env, NEXUS_DOTFILES_CONFIG_JSON: dotfilesPath },
    stdout: "pipe",
    stderr: "pipe",
  });
  expect(emit.exitCode).toBe(0);

  const check = Bun.spawnSync({
    cmd: ["bun", "src/index.ts", "check", "--config", configPath],
    cwd: process.cwd(),
    env: { ...process.env, NEXUS_DOTFILES_CONFIG_JSON: dotfilesPath },
    stdout: "pipe",
    stderr: "pipe",
  });

  expect(check.exitCode).toBe(0);
  expect(check.stdout.toString()).toContain("outputs are in sync");

  // keep ts strict happy by touching root var
  expect(readFileSync(join(root, ".mcp.json"), "utf8")).toContain("server-filesystem");
});

test("nexus check > returns non-zero and lists drifted files", () => {
  const { root, dotfilesPath, configPath } = setupProject();

  const emit = Bun.spawnSync({
    cmd: ["bun", "src/index.ts", "--config", configPath],
    cwd: process.cwd(),
    env: { ...process.env, NEXUS_DOTFILES_CONFIG_JSON: dotfilesPath },
    stdout: "pipe",
    stderr: "pipe",
  });
  expect(emit.exitCode).toBe(0);

  writeFileSync(join(root, ".mcp.json"), JSON.stringify({ tampered: true }, null, 2));

  const check = Bun.spawnSync({
    cmd: ["bun", "src/index.ts", "check", "--config", configPath],
    cwd: process.cwd(),
    env: { ...process.env, NEXUS_DOTFILES_CONFIG_JSON: dotfilesPath },
    stdout: "pipe",
    stderr: "pipe",
  });

  expect(check.exitCode).toBe(2);
  const err = check.stderr.toString();
  expect(err).toContain("outputs drifted");
  expect(err).toContain(".mcp.json");
});
