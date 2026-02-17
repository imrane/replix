import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

function run(cmd: string[], cwd: string, env?: Record<string, string>) {
  const out = Bun.spawnSync({
    cmd,
    cwd,
    env: { ...process.env, ...(env ?? {}) },
    stdout: "pipe",
    stderr: "pipe",
  });

  const stdout = out.stdout.toString();
  const stderr = out.stderr.toString();
  if (out.exitCode !== 0) {
    throw new Error(
      [
        `command failed: ${cmd.join(" ")}`,
        `cwd: ${cwd}`,
        "--- stdout ---",
        stdout,
        "--- stderr ---",
        stderr,
      ].join("\n"),
    );
  }

  return { stdout, stderr };
}

function runExpectFail(cmd: string[], cwd: string, env?: Record<string, string>) {
  const out = Bun.spawnSync({
    cmd,
    cwd,
    env: { ...process.env, ...(env ?? {}) },
    stdout: "pipe",
    stderr: "pipe",
  });

  return {
    exitCode: out.exitCode,
    stdout: out.stdout.toString(),
    stderr: out.stderr.toString(),
  };
}

function makePack(root: string, version: string, skillBody = "# alpha\n") {
  mkdirSync(join(root, "skills", "alpha"), { recursive: true });
  writeFileSync(join(root, "skills", "alpha", "SKILL.md"), skillBody);
  writeFileSync(
    join(root, "pack.json"),
    JSON.stringify(
      {
        id: "golden-pack",
        version,
        imports: [],
        varsSchemaVersion: 1,
        vars: { required: {}, optional: {} },
      },
      null,
      2,
    ) + "\n",
  );
}

async function main() {
  const root = mkdtempSync(join(tmpdir(), "replix-release-gate-"));
  try {
    const repoRoot = join(root, "repo");
    const packRoot = join(root, "packs", "golden");
    mkdirSync(repoRoot, { recursive: true });
    makePack(packRoot, "1.0.0");

    const cli = join(process.cwd(), "src/index.ts");

    // install + lock + doctor (baseline)
    run(["bun", cli, "init", "--client", "claude"], repoRoot);
    run(["bun", cli, "pack", "install", `path:${packRoot}`], repoRoot);
    run(["bun", cli, "lock", "update"], repoRoot);
    run(["bun", cli, "--config", ".replix/repo.json"], repoRoot);
    run(["bun", cli, "doctor", "--config", ".replix/repo.json"], repoRoot);

    // compatibility gate should fail if pack content tampered without lock refresh
    makePack(packRoot, "1.0.0", "# alpha\n\nTampered\n");
    const drift = runExpectFail(["bun", cli, "--config", ".replix/repo.json"], repoRoot);
    if (drift.exitCode === 0) {
      throw new Error("expected lock compatibility gate to fail after tamper, but command succeeded");
    }
    if (!drift.stderr.includes("lockfile compatibility gate failed")) {
      throw new Error(`expected lock compatibility gate message, got:\n${drift.stderr}`);
    }

    // upgrade lock to trust current artifacts
    run(["bun", cli, "pack", "upgrade"], repoRoot);
    run(["bun", cli, "--config", ".replix/repo.json"], repoRoot);
    run(["bun", cli, "doctor", "--config", ".replix/repo.json"], repoRoot);

    // uninstall lifecycle + doctor still functional
    run(["bun", cli, "pack", "uninstall", `path:${packRoot}`], repoRoot);
    run(["bun", cli, "lock", "update"], repoRoot);
    run(["bun", cli, "--config", ".replix/repo.json"], repoRoot);
    run(["bun", cli, "doctor", "--config", ".replix/repo.json"], repoRoot);

    console.log("✅ release gate passed: doctor + compatibility + pack install/uninstall/upgrade lifecycle");
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}

await main();
