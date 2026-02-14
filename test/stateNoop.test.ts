import { describe, expect, it } from "bun:test";
import { mkdtempSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { shouldSkipEmit, writeStateHash } from "../src/stateFile";

describe("state no-op", () => {
  it("skips when stored hash matches", async () => {
    const repoRoot = mkdtempSync(join(tmpdir(), "nexus-repo-"));

    await writeStateHash(repoRoot, "abc");
    expect(await shouldSkipEmit(repoRoot, "abc")).toBeTrue();
  });

  it("does not skip when stored hash differs or missing", async () => {
    const repoRoot = mkdtempSync(join(tmpdir(), "nexus-repo-"));

    expect(existsSync(join(repoRoot, ".claude", ".nexus-state"))).toBeFalse();
    expect(await shouldSkipEmit(repoRoot, "abc")).toBeFalse();

    await writeStateHash(repoRoot, "abc");
    expect(await shouldSkipEmit(repoRoot, "def")).toBeFalse();
  });
});
