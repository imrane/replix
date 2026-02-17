import { test, expect } from "bun:test";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

test("nexus support bundle > captures config/lock/log snapshots", () => {
  const root = mkdtempSync(join(tmpdir(), "nexus-support-bundle-"));
  try {
    const repoRoot = join(root, "repo");
    mkdirSync(join(repoRoot, ".nexus"), { recursive: true });

    writeFileSync(
      join(repoRoot, ".nexus", "repo.json"),
      JSON.stringify({ version: 1, repoRoot, clients: ["claude"], enable: { skills: [], mcp: [] }, overrides: { skills: {}, mcp: {} } }, null, 2),
    );
    writeFileSync(join(repoRoot, "nexus.lock.json"), JSON.stringify({ version: 1, packs: [] }, null, 2));

    const install = Bun.spawnSync({
      cmd: ["bun", join(process.cwd(), "src/index.ts"), "pack", "install", "path:/tmp/demo-pack"],
      cwd: repoRoot,
      stdout: "pipe",
      stderr: "pipe",
    });
    expect(install.exitCode).toBe(0);

    const bundleOut = Bun.spawnSync({
      cmd: ["bun", join(process.cwd(), "src/index.ts"), "support", "bundle"],
      cwd: repoRoot,
      stdout: "pipe",
      stderr: "pipe",
    });

    expect(bundleOut.exitCode).toBe(0);
    const line = bundleOut.stdout.toString().trim();
    expect(line).toContain("nexus support bundle:");

    const bundlePath = line.split(": ").pop()!;
    const bundle = JSON.parse(readFileSync(bundlePath, "utf8"));

    expect(bundle.schemaVersion).toBe(1);
    expect(bundle.files.repoConfig.exists).toBe(true);
    expect(bundle.files.lockfile.exists).toBe(true);
    expect(Array.isArray(bundle.logs.recentEvents)).toBe(true);
    expect(bundle.logs.recentEvents.join("\n")).toContain("pack.install");
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
