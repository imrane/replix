import { test, expect } from "bun:test";
import { mkdtempSync, mkdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { getIndexCache, putIndexCache } from "../src/importProviders/indexCache";

test("import index cache > put/get roundtrip", async () => {
  const root = mkdtempSync(join(tmpdir(), "replix-index-cache-"));
  try {
    const repoRoot = join(root, "repo");
    mkdirSync(repoRoot, { recursive: true });

    await putIndexCache(repoRoot, "clawhub", "lead", [{ id: "a" }], 1000, 1000, 100);
    const hit = await getIndexCache(repoRoot, "clawhub", "lead", 500);
    expect(hit).not.toBeNull();
    expect((hit as any[])[0]?.id).toBe("a");
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("import index cache > expires after stale ttl", async () => {
  const root = mkdtempSync(join(tmpdir(), "replix-index-cache-expire-"));
  try {
    const repoRoot = join(root, "repo");
    mkdirSync(repoRoot, { recursive: true });

    await putIndexCache(repoRoot, "playbooks", "lead", [{ id: "b" }], 1000, 1000, 100);
    const hit = await getIndexCache(repoRoot, "playbooks", "lead", 2201);
    expect(hit).toBeNull();
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
