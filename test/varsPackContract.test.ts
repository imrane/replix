import { expect, test } from "bun:test";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { resolvePackContractVars } from "../src/vars";

test("pack vars contract > resolves default interpolation chain", async () => {
  const root = mkdtempSync(join(tmpdir(), "replix-vars-contract-"));
  try {
    const out = await resolvePackContractVars({
      repoRoot: root,
      cfgVars: {},
      dotfilesVars: {},
      contract: {
        required: {
          API_HOST: { default: "api.example.com" },
          API_URL: { default: "https://${API_HOST}/v1" },
        },
        optional: {},
      },
    });

    expect(out.missingRequired).toEqual([]);
    expect(out.interpolationErrors).toEqual([]);
    expect(out.values.API_URL).toBe("https://api.example.com/v1");
    expect(out.sourceByVar.API_HOST).toBe("contract-default");
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("pack vars contract > reads required var from _FILE source", async () => {
  const root = mkdtempSync(join(tmpdir(), "replix-vars-contract-file-"));
  try {
    const secretsDir = join(root, ".replix", "vars");
    mkdirSync(secretsDir, { recursive: true });
    const tokenPath = join(secretsDir, "API_TOKEN");
    writeFileSync(tokenPath, "abc123\n");

    const out = await resolvePackContractVars({
      repoRoot: root,
      cfgVars: {},
      dotfilesVars: {},
      processEnv: { ...process.env, API_TOKEN_FILE: tokenPath },
      contract: {
        required: { API_TOKEN: { secret: true } },
        optional: {},
      },
    });

    expect(out.missingRequired).toEqual([]);
    expect(out.values.API_TOKEN).toBe("abc123");
    expect(out.sourceByVar.API_TOKEN).toBe("file");
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("pack vars contract > secretVars lists vars marked secret:true", async () => {
  const root = mkdtempSync(join(tmpdir(), "replix-vars-secret-"));
  try {
    const out = await resolvePackContractVars({
      repoRoot: root,
      cfgVars: { API_KEY: "key123", PUBLIC_HOST: "example.com" },
      dotfilesVars: {},
      contract: {
        required: { API_KEY: { secret: true } },
        optional: { PUBLIC_HOST: {} },
      },
    });

    expect(out.secretVars).toEqual(["API_KEY"]);
    expect(out.secretVars).not.toContain("PUBLIC_HOST");
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("pack vars contract > secretVars is empty when no vars are marked secret", async () => {
  const root = mkdtempSync(join(tmpdir(), "replix-vars-no-secret-"));
  try {
    const out = await resolvePackContractVars({
      repoRoot: root,
      cfgVars: { FOO: "bar" },
      dotfilesVars: {},
      contract: {
        required: { FOO: {} },
        optional: {},
      },
    });

    expect(out.secretVars).toEqual([]);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("pack vars contract > secretVars includes optional secret vars", async () => {
  const root = mkdtempSync(join(tmpdir(), "replix-vars-optional-secret-"));
  try {
    const out = await resolvePackContractVars({
      repoRoot: root,
      cfgVars: {},
      dotfilesVars: {},
      contract: {
        required: {},
        optional: { WEBHOOK_SECRET: { secret: true } },
      },
    });

    expect(out.secretVars).toEqual(["WEBHOOK_SECRET"]);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
