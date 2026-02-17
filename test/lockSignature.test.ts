import { test, expect } from "bun:test";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { generateKeyPairSync, sign } from "node:crypto";

function makePack(root: string) {
  mkdirSync(root, { recursive: true });
  mkdirSync(join(root, "skills", "alpha"), { recursive: true });
  writeFileSync(join(root, "skills", "alpha", "SKILL.md"), "# alpha\n");
  writeFileSync(
    join(root, "pack.json"),
    JSON.stringify(
      {
        id: "security-pack",
        version: "1.0.0",
        imports: [],
        varsSchemaVersion: 1,
        vars: { required: {}, optional: {} },
      },
      null,
      2,
    ),
  );
}

test("nexus lock update > verifies pack.sig when signaturePublicKey is provided", () => {
  const root = mkdtempSync(join(tmpdir(), "nexus-lock-sig-"));
  try {
    const repoRoot = join(root, "repo");
    mkdirSync(repoRoot, { recursive: true });

    const packRoot = join(root, "packs", "security");
    makePack(packRoot);

    const keys = generateKeyPairSync("ed25519");
    const pubPem = keys.publicKey.export({ format: "pem", type: "spki" }).toString();

    // First run without signature to obtain checksum.
    const dotfilesPath = join(root, "dotfiles.json");
    writeFileSync(
      dotfilesPath,
      JSON.stringify({ packs: [{ source: `path:${packRoot}`, signaturePublicKey: pubPem }] }, null, 2),
    );

    // Should fail while pack.sig is missing.
    const missingSig = Bun.spawnSync({
      cmd: ["bun", join(process.cwd(), "src/index.ts"), "lock", "update"],
      cwd: repoRoot,
      env: { ...process.env, NEXUS_DOTFILES_CONFIG_JSON: dotfilesPath },
      stdout: "pipe",
      stderr: "pipe",
    });
    expect(missingSig.exitCode).toBe(1);
    expect(missingSig.stderr.toString()).toContain("pack signature required but missing pack.sig");

    // Create an unsigned lock to inspect integrity hash (no signature key).
    const unsignedDotfiles = join(root, "dotfiles-unsigned.json");
    writeFileSync(unsignedDotfiles, JSON.stringify({ packs: [{ source: `path:${packRoot}` }] }, null, 2));
    const unsignedOut = Bun.spawnSync({
      cmd: ["bun", join(process.cwd(), "src/index.ts"), "lock", "update"],
      cwd: repoRoot,
      env: { ...process.env, NEXUS_DOTFILES_CONFIG_JSON: unsignedDotfiles },
      stdout: "pipe",
      stderr: "pipe",
    });
    expect(unsignedOut.exitCode).toBe(0);

    const lockPath = join(repoRoot, "nexus.lock.json");
    const lock = JSON.parse(readFileSync(lockPath, "utf8"));
    const checksum = lock.packs[0].integritySha256 as string;

    const sig = sign(null, Buffer.from(checksum, "utf8"), keys.privateKey).toString("base64");
    writeFileSync(join(packRoot, "pack.sig"), sig + "\n");

    const signedOut = Bun.spawnSync({
      cmd: ["bun", join(process.cwd(), "src/index.ts"), "lock", "update"],
      cwd: repoRoot,
      env: { ...process.env, NEXUS_DOTFILES_CONFIG_JSON: dotfilesPath },
      stdout: "pipe",
      stderr: "pipe",
    });

    expect(signedOut.exitCode).toBe(0);
    const signedLock = JSON.parse(readFileSync(lockPath, "utf8"));
    expect(typeof signedLock.packs[0].signatureKeyId).toBe("string");
    expect(signedLock.packs[0].integritySignature).toBe(sig);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
