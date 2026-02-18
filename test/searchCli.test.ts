import { test, expect } from "bun:test";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

test("replix search --provider mock-provider uses plugin module", () => {
  const root = mkdtempSync(join(tmpdir(), "replix-search-cli-"));
  try {
    const repoRoot = join(root, "repo");
    mkdirSync(repoRoot, { recursive: true });

    const out = Bun.spawnSync({
      cmd: [
        "bun",
        join(process.cwd(), "src/index.ts"),
        "search",
        "--provider",
        "mock-provider",
        "--query",
        "leads",
      ],
      cwd: repoRoot,
      env: {
        ...process.env,
        REPLIX_IMPORT_PROVIDER_MODULES: join(process.cwd(), "fixtures", "import-provider.mock.ts"),
      },
      stdout: "pipe",
      stderr: "pipe",
    });

    expect(out.exitCode).toBe(0);
    const stdout = out.stdout.toString();
    expect(stdout).toContain("provider: mock-provider");
    expect(stdout).toContain("mock-1");
    expect(stdout).toContain("sec:verified");
    expect(stdout).toContain("security:https://example.com/mock-1/security");
    expect(existsSync(join(repoRoot, ".replix", "import-index.json"))).toBe(true);

    const out2 = Bun.spawnSync({
      cmd: [
        "bun",
        join(process.cwd(), "src/index.ts"),
        "search",
        "--provider",
        "mock-provider",
        "--query",
        "leads",
      ],
      cwd: repoRoot,
      env: {
        ...process.env,
        REPLIX_IMPORT_PROVIDER_MODULES: join(process.cwd(), "fixtures", "import-provider.mock.ts"),
      },
      stdout: "pipe",
      stderr: "pipe",
    });
    expect(out2.exitCode).toBe(0);
    expect(out2.stdout.toString()).toContain("provider: mock-provider (cached)");
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("replix search can load provider modules from --config", () => {
  const root = mkdtempSync(join(tmpdir(), "replix-search-cli-config-"));
  try {
    const repoRoot = join(root, "repo");
    mkdirSync(repoRoot, { recursive: true });

    const cfgPath = join(repoRoot, "replix.config.json");
    writeFileSync(
      cfgPath,
      JSON.stringify(
        {
          version: 1,
          repoRoot: null,
          clients: [],
          enable: { skills: [], mcp: [] },
          vars: {},
          overrides: { skills: {}, mcp: {} },
          importProviders: {
            modules: [join(process.cwd(), "fixtures", "import-provider.mock.ts")],
          },
        },
        null,
        2,
      ),
    );

    const out = Bun.spawnSync({
      cmd: [
        "bun",
        join(process.cwd(), "src/index.ts"),
        "search",
        "--provider",
        "mock-provider",
        "--query",
        "leads",
        "--config",
        cfgPath,
      ],
      cwd: repoRoot,
      stdout: "pipe",
      stderr: "pipe",
    });

    expect(out.exitCode).toBe(0);
    const stdout = out.stdout.toString();
    expect(stdout).toContain("provider: mock-provider");
    expect(stdout).toContain("mock-1");
    expect(stdout).toContain("sec:verified");
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("replix search unknown provider returns error", () => {
  const root = mkdtempSync(join(tmpdir(), "replix-search-cli-missing-"));
  try {
    const repoRoot = join(root, "repo");
    mkdirSync(repoRoot, { recursive: true });

    const out = Bun.spawnSync({
      cmd: ["bun", join(process.cwd(), "src/index.ts"), "search", "--provider", "missing", "--query", "abc"],
      cwd: repoRoot,
      stdout: "pipe",
      stderr: "pipe",
    });

    expect(out.exitCode).toBe(2);
    expect(out.stderr.toString()).toContain("unknown provider");
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
