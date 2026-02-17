import { test, expect } from "bun:test";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

test("replix doctor (pack mode) > blocks when required pack var is missing", () => {
  const root = mkdtempSync(join(tmpdir(), "replix-pack-doctor-missing-"));
  try {
    writeFileSync(
      join(root, "pack.json"),
      JSON.stringify(
        {
          id: "security-pack",
          version: "1.0.0",
          imports: [],
          varsSchemaVersion: 1,
          vars: {
            required: {
              API_TOKEN: { secret: true, source: "file|env" },
            },
            optional: {},
          },
        },
        null,
        2,
      ),
    );

    const env = { ...process.env };
    delete (env as Record<string, string | undefined>).API_TOKEN;
    delete (env as Record<string, string | undefined>).API_TOKEN_FILE;

    const out = Bun.spawnSync({
      cmd: ["bun", join(process.cwd(), "src/index.ts"), "doctor"],
      cwd: root,
      env,
      stdout: "pipe",
      stderr: "pipe",
    });

    expect(out.exitCode).toBe(2);
    const stderr = out.stderr.toString();
    expect(stderr).toContain("pack security-pack blocked: missing required variable API_TOKEN");
    expect(stderr).toContain("fix: write secret to .replix/vars/API_TOKEN");
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("replix doctor (pack mode) > ready when required pack var exists in file", () => {
  const root = mkdtempSync(join(tmpdir(), "replix-pack-doctor-ready-"));
  try {
    writeFileSync(
      join(root, "pack.json"),
      JSON.stringify(
        {
          id: "security-pack",
          version: "1.0.0",
          imports: [],
          varsSchemaVersion: 1,
          vars: {
            required: {
              API_TOKEN: { secret: true, source: "file|env" },
            },
            optional: {},
          },
        },
        null,
        2,
      ),
    );

    const varsDir = join(root, ".replix", "vars");
    mkdirSync(varsDir, { recursive: true });
    writeFileSync(join(varsDir, "API_TOKEN"), "from-file\n");

    const out = Bun.spawnSync({
      cmd: ["bun", join(process.cwd(), "src/index.ts"), "doctor"],
      cwd: root,
      env: { ...process.env },
      stdout: "pipe",
      stderr: "pipe",
    });

    expect(out.exitCode).toBe(0);
    const stdout = out.stdout.toString();
    expect(stdout).toContain("pack security-pack: ready");
    expect(stdout).toContain("var=API_TOKEN source=file");
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
