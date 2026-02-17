import { test, expect } from "bun:test";
import { existsSync, mkdtempSync, mkdirSync, writeFileSync, rmSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

function makePack(root: string, version: string) {
  mkdirSync(join(root, "skills", "alpha"), { recursive: true });
  writeFileSync(join(root, "skills", "alpha", "SKILL.md"), "# alpha\n");
  writeFileSync(
    join(root, "pack.json"),
    JSON.stringify(
      {
        id: "selfheal-pack",
        version,
        imports: [],
        specVersion: "replix.canonical.v1-draft",
        references: {
          skills: ["skills/alpha/SKILL.md"],
        },
      },
      null,
      2,
    ),
  );
}

test("replix compile self-heal > auto-recovers lock drift", () => {
  const root = mkdtempSync(join(tmpdir(), "replix-self-heal-"));
  try {
    const repoRoot = join(root, "repo");
    mkdirSync(repoRoot, { recursive: true });

    const packRoot = join(root, "packs", "selfheal");
    makePack(packRoot, "1.0.0");

    const dotfilesPath = join(root, "dotfiles.json");
    writeFileSync(dotfilesPath, JSON.stringify({ packs: [{ source: `path:${packRoot}` }] }, null, 2));

    const cfgPath = join(root, "config.json");
    writeFileSync(
      cfgPath,
      JSON.stringify(
        {
          version: 1,
          repoRoot,
          clients: ["claude"],
          enable: { skills: [], mcp: [] },
          vars: {},
          overrides: { skills: {}, mcp: {} },
        },
        null,
        2,
      ),
    );

    // Create initial lock then drift by bumping pack version.
    const lockOut = Bun.spawnSync({
      cmd: ["bun", join(process.cwd(), "src/index.ts"), "lock", "update"],
      cwd: repoRoot,
      env: { ...process.env, REPLIX_DOTFILES_CONFIG_JSON: dotfilesPath },
      stdout: "pipe",
      stderr: "pipe",
    });
    expect(lockOut.exitCode).toBe(0);

    makePack(packRoot, "1.0.1");

    const out = Bun.spawnSync({
      cmd: ["bun", join(process.cwd(), "src/index.ts"), "compile", "self-heal", "--config", cfgPath],
      cwd: repoRoot,
      env: { ...process.env, REPLIX_DOTFILES_CONFIG_JSON: dotfilesPath },
      stdout: "pipe",
      stderr: "pipe",
    });

    expect(out.exitCode).toBe(0);
    const stdout = out.stdout.toString();
    expect(stdout).toContain("replix compile self-heal: recovered");
    expect(stdout).toContain("- report:");

    const reportPath = stdout
      .split(/\r?\n/)
      .find((l) => l.startsWith("- report:"))
      ?.replace("- report:", "")
      .trim();
    expect(typeof reportPath).toBe("string");
    expect(existsSync(reportPath!)).toBe(true);

    const lock = JSON.parse(readFileSync(join(repoRoot, "replix.lock.json"), "utf8"));
    expect(lock.packs[0].version).toBe("1.0.1");
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
