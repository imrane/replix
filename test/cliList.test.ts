import { test, expect } from "bun:test";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

function setupFixture() {
  const dir = mkdtempSync(join(tmpdir(), "replix-cli-list-"));

  const dotfilesPath = join(dir, "dotfiles.json");
  writeFileSync(
    dotfilesPath,
    JSON.stringify(
      {
        skills: {
          alpha: { source: "path:/skills/alpha" },
          beta: { source: "path:/skills/beta" },
        },
        mcp: {
          filesystem: { command: "npx", args: ["-y", "@modelcontextprotocol/server-filesystem"] },
        },
      },
      null,
      2,
    ),
  );

  const configPath = join(dir, "config.json");
  writeFileSync(
    configPath,
    JSON.stringify(
      {
        version: 1,
        repoRoot: dir,
        clients: ["claude"],
        enable: {
          skills: ["alpha"],
          mcp: ["filesystem"],
        },
        overrides: {
          skills: {
            gamma: { path: "/skills/gamma" },
          },
          mcp: {},
        },
      },
      null,
      2,
    ),
  );

  return { dir, dotfilesPath, configPath };
}

test("cli list skills > shows status + source hints", () => {
  const { dir, dotfilesPath, configPath } = setupFixture();

  const out = Bun.spawnSync({
    cmd: ["bun", "src/index.ts", "list", "skills", "--config", configPath],
    cwd: process.cwd(),
    env: {
      ...process.env,
      REPLIX_DOTFILES_CONFIG_JSON: dotfilesPath,
      HOME: dir,
    },
    stdout: "pipe",
    stderr: "pipe",
  });

  const stdout = out.stdout.toString();
  expect(out.exitCode).toBe(0);
  expect(stdout).toContain("Available skills");
  expect(stdout).toContain("alpha\tenabled\tdotfiles:path:/skills/alpha");
  expect(stdout).toContain("beta\tavailable\tdotfiles:path:/skills/beta");
  expect(stdout).toContain("gamma\tavailable\toverride:/skills/gamma");
});

test("cli list mcp > shows status + command hints", () => {
  const { dir, dotfilesPath, configPath } = setupFixture();

  const out = Bun.spawnSync({
    cmd: ["bun", "src/index.ts", "list", "mcp", "--config", configPath],
    cwd: process.cwd(),
    env: {
      ...process.env,
      REPLIX_DOTFILES_CONFIG_JSON: dotfilesPath,
      HOME: dir,
    },
    stdout: "pipe",
    stderr: "pipe",
  });

  const stdout = out.stdout.toString();
  expect(out.exitCode).toBe(0);
  expect(stdout).toContain("Available MCP servers");
  expect(stdout).toContain("filesystem\tenabled\tnpx -y @modelcontextprotocol/server-filesystem");
});

test("cli snippet > renders mkRepo enable block for selected skills and mcp", () => {
  const out = Bun.spawnSync({
    cmd: ["bun", "src/index.ts", "snippet", "--skills", "alpha,beta", "--mcp", "filesystem"],
    cwd: process.cwd(),
    env: {
      ...process.env,
    },
    stdout: "pipe",
    stderr: "pipe",
  });

  const stdout = out.stdout.toString();
  expect(out.exitCode).toBe(0);
  expect(stdout).toContain("replix.lib.mkRepo {");
  expect(stdout).toContain('skills = [ "alpha" "beta" ];');
  expect(stdout).toContain('mcp = [ "filesystem" ];');
});
