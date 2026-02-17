import { test, expect } from "bun:test";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, existsSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

function makePack(root: string, id: string, version: string) {
  mkdirSync(root, { recursive: true });
  writeFileSync(
    join(root, "pack.json"),
    JSON.stringify({ id, version, imports: [], varsSchemaVersion: 1, vars: { required: {}, optional: {} } }, null, 2),
  );
}

test("nexus registry build > writes static index from installed packs", () => {
  const root = mkdtempSync(join(tmpdir(), "nexus-registry-"));
  try {
    const repoRoot = join(root, "repo");
    mkdirSync(join(repoRoot, ".nexus"), { recursive: true });

    const p1 = join(root, "packs", "security");
    const p2 = join(root, "packs", "content");
    makePack(p1, "security-pack", "1.0.0");
    makePack(p2, "content-pack", "0.4.2");

    writeFileSync(
      join(repoRoot, ".nexus", "packs.json"),
      JSON.stringify({ packs: [{ source: `path:${p1}` }, { source: `path:${p2}` }] }, null, 2),
    );

    const out = Bun.spawnSync({
      cmd: ["bun", join(process.cwd(), "src/index.ts"), "registry", "build"],
      cwd: repoRoot,
      stdout: "pipe",
      stderr: "pipe",
    });

    expect(out.exitCode).toBe(0);
    const dir = join(repoRoot, ".nexus", "registry");
    expect(existsSync(join(dir, "index.html"))).toBe(true);
    expect(existsSync(join(dir, "index.json"))).toBe(true);

    const json = JSON.parse(readFileSync(join(dir, "index.json"), "utf8"));
    expect(json.packs.length).toBe(2);
    expect(json.packs[0].install).toContain("nexus pack install");
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
