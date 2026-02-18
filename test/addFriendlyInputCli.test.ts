import { test, expect } from "bun:test";
import { mkdtempSync, mkdirSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

test("replix add accepts clawhub item URL", () => {
  const root = mkdtempSync(join(tmpdir(), "replix-add-link-"));
  try {
    const repoRoot = join(root, "repo");
    mkdirSync(repoRoot, { recursive: true });

    const out = Bun.spawnSync({
      cmd: ["bun", join(process.cwd(), "src/index.ts"), "add", "https://clawhub.ai/items/mock-1"],
      cwd: repoRoot,
      env: {
        ...process.env,
        REPLIX_IMPORT_PROVIDER_MODULES: join(process.cwd(), "fixtures", "import-provider.mock.ts"),
      },
      stdout: "pipe",
      stderr: "pipe",
    });

    expect(out.exitCode).toBe(0);
    expect(out.stdout.toString()).toContain("note: resolved from clawhub link");
    expect(out.stdout.toString()).toContain("resolved via provider: clawhub");

    const packs = JSON.parse(readFileSync(join(repoRoot, ".replix", "packs.json"), "utf8"));
    expect(packs.packs[0].source).toBe("https://clawhub.ai/items/mock-1");
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("replix add accepts plain search term", () => {
  const root = mkdtempSync(join(tmpdir(), "replix-add-search-term-"));
  try {
    const repoRoot = join(root, "repo");
    mkdirSync(repoRoot, { recursive: true });

    const out = Bun.spawnSync({
      cmd: ["bun", join(process.cwd(), "src/index.ts"), "add", "test runner"],
      cwd: repoRoot,
      env: {
        ...process.env,
        REPLIX_IMPORT_PROVIDER_MODULES: join(process.cwd(), "fixtures", "import-provider.mock.ts"),
      },
      stdout: "pipe",
      stderr: "pipe",
    });

    expect(out.exitCode).toBe(0);
    expect(out.stdout.toString()).toContain("note: resolved from search term via");
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
