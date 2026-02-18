import { test, expect } from "bun:test";
import { mkdtempSync, mkdirSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

test("replix add provider:id resolves via import provider plugin", () => {
  const root = mkdtempSync(join(tmpdir(), "replix-add-provider-"));
  try {
    const repoRoot = join(root, "repo");
    mkdirSync(repoRoot, { recursive: true });

    const out = Bun.spawnSync({
      cmd: ["bun", join(process.cwd(), "src/index.ts"), "add", "mock-provider:mock-1"],
      cwd: repoRoot,
      env: {
        ...process.env,
        REPLIX_IMPORT_PROVIDER_MODULES: join(process.cwd(), "fixtures", "import-provider.mock.ts"),
      },
      stdout: "pipe",
      stderr: "pipe",
    });

    expect(out.exitCode).toBe(0);
    expect(out.stdout.toString()).toContain("resolved via provider: mock-provider");

    const packsPath = join(repoRoot, ".replix", "packs.json");
    const packs = JSON.parse(readFileSync(packsPath, "utf8"));
    expect(packs.packs[0].source).toBe("github:acme/mock?rev=abc");
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("replix add provider:id errors for unknown provider", () => {
  const root = mkdtempSync(join(tmpdir(), "replix-add-provider-missing-"));
  try {
    const repoRoot = join(root, "repo");
    mkdirSync(repoRoot, { recursive: true });

    const out = Bun.spawnSync({
      cmd: ["bun", join(process.cwd(), "src/index.ts"), "add", "missing:abc"],
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
