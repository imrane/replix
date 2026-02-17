import { test, expect } from "bun:test";
import { mkdtempSync, mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

function setupProject() {
  const root = mkdtempSync(join(tmpdir(), "replix-doctor-cli-"));
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

test("replix doctor > returns success when config is healthy", () => {
  const { dotfilesPath, configPath } = setupProject();

  const emit = Bun.spawnSync({
    cmd: ["bun", "src/index.ts", "--config", configPath],
    cwd: process.cwd(),
    env: { ...process.env, REPLIX_DOTFILES_CONFIG_JSON: dotfilesPath },
    stdout: "pipe",
    stderr: "pipe",
  });
  expect(emit.exitCode).toBe(0);

  const out = Bun.spawnSync({
    cmd: ["bun", "src/index.ts", "doctor", "--config", configPath],
    cwd: process.cwd(),
    env: { ...process.env, REPLIX_DOTFILES_CONFIG_JSON: dotfilesPath },
    stdout: "pipe",
    stderr: "pipe",
  });

  expect(out.exitCode).toBe(0);
  expect(out.stdout.toString()).toContain("no blocking problems found");
});

test("replix doctor > returns non-zero when enabled skill is missing", () => {
  const { dotfilesPath, configPath } = setupProject();

  writeFileSync(
    configPath,
    JSON.stringify(
      {
        version: 1,
        repoRoot: join(tmpdir(), "replix-doctor-missing-skill"),
        clients: ["claude"],
        enable: {
          skills: ["does-not-exist"],
          mcp: ["filesystem"],
        },
        overrides: { skills: {}, mcp: {} },
      },
      null,
      2,
    ),
  );

  const out = Bun.spawnSync({
    cmd: ["bun", "src/index.ts", "doctor", "--config", configPath],
    cwd: process.cwd(),
    env: { ...process.env, REPLIX_DOTFILES_CONFIG_JSON: dotfilesPath },
    stdout: "pipe",
    stderr: "pipe",
  });

  expect(out.exitCode).toBe(2);
  expect(out.stderr.toString()).toContain("problems found");
});

test("replix doctor > prints variable matrix and flags missing vars", () => {
  const { root, configPath } = setupProject();

  const dotfilesPath = join(root, "dotfiles-vars.json");
  writeFileSync(
    dotfilesPath,
    JSON.stringify(
      {
        skills: { humanizer: { source: `path:${join(root, "skills", "humanizer")}` } },
        mcp: {
          filesystem: {
            command: "npx",
            args: ["-y", "@modelcontextprotocol/server-filesystem", "${ENV:MISSING_TOKEN}"],
          },
        },
      },
      null,
      2,
    ),
  );

  const out = Bun.spawnSync({
    cmd: ["bun", "src/index.ts", "doctor", "--config", configPath],
    cwd: process.cwd(),
    env: { ...process.env, REPLIX_DOTFILES_CONFIG_JSON: dotfilesPath },
    stdout: "pipe",
    stderr: "pipe",
  });

  expect(out.exitCode).toBe(2);
  const stderr = out.stderr.toString();
  expect(stderr).toContain("missing required variable: MISSING_TOKEN");
  expect(stderr).toContain("variable matrix:");
  expect(stderr).toContain("var=MISSING_TOKEN");
});

test("replix doctor > reports file source when var is resolved from .replix/vars", () => {
  const { root, configPath } = setupProject();
  const varsDir = join(root, ".replix", "vars");
  mkdirSync(varsDir, { recursive: true });
  writeFileSync(join(varsDir, "FILE_TOKEN"), "from-file\n");

  const dotfilesPath = join(root, "dotfiles-vars-file.json");
  writeFileSync(
    dotfilesPath,
    JSON.stringify(
      {
        skills: { humanizer: { source: `path:${join(root, "skills", "humanizer")}` } },
        mcp: {
          filesystem: {
            command: "echo",
            args: ["${FILE_TOKEN}"],
          },
        },
      },
      null,
      2,
    ),
  );

  const emit = Bun.spawnSync({
    cmd: ["bun", "src/index.ts", "--config", configPath],
    cwd: process.cwd(),
    env: { ...process.env, REPLIX_DOTFILES_CONFIG_JSON: dotfilesPath },
    stdout: "pipe",
    stderr: "pipe",
  });
  expect(emit.exitCode).toBe(0);

  const out = Bun.spawnSync({
    cmd: ["bun", "src/index.ts", "doctor", "--config", configPath],
    cwd: process.cwd(),
    env: { ...process.env, REPLIX_DOTFILES_CONFIG_JSON: dotfilesPath },
    stdout: "pipe",
    stderr: "pipe",
  });

  expect(out.exitCode).toBe(0);
  expect(out.stdout.toString()).toContain("source=file");
  expect(out.stdout.toString()).toContain("var=FILE_TOKEN");
});

test("replix doctor > detects lockfile drift and suggests lock update", () => {
  const { root, configPath } = setupProject();

  const dotfilesPath = join(root, "dotfiles-lock-drift.json");
  writeFileSync(
    dotfilesPath,
    JSON.stringify(
      {
        packs: [
          {
            source: `path:${root}`,
          },
        ],
        skills: { humanizer: { source: `path:${join(root, "skills", "humanizer")}` } },
        mcp: {
          filesystem: {
            command: "echo",
            args: ["ok"],
          },
        },
      },
      null,
      2,
    ),
  );

  writeFileSync(
    join(root, "pack.json"),
    JSON.stringify(
      {
        id: "local-pack",
        version: "1.0.0",
        imports: [],
        varsSchemaVersion: 1,
        vars: { required: { API_TOKEN: { secret: true } }, optional: {} },
      },
      null,
      2,
    ),
  );

  const lockPath = join(root, "replix.lock.json");
  writeFileSync(
    lockPath,
    JSON.stringify({ version: 1, packs: [{ source: `path:${root}`, rev: "local", version: "0.9.0", requiredVars: [] }] }, null, 2),
  );

  const out = Bun.spawnSync({
    cmd: ["bun", "src/index.ts", "doctor", "--config", configPath],
    cwd: process.cwd(),
    env: { ...process.env, REPLIX_DOTFILES_CONFIG_JSON: dotfilesPath },
    stdout: "pipe",
    stderr: "pipe",
  });

  expect(out.exitCode).toBe(2);
  const stderr = out.stderr.toString();
  expect(stderr).toContain("lockfile compatibility gate failed");
  expect(stderr).toContain("fix: run `replix lock update`");
});
