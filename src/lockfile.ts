import { existsSync } from "node:fs";
import { createHash, createPublicKey, verify as verifySig } from "node:crypto";
import { readdir, readFile, writeFile } from "node:fs/promises";
import { join, dirname, relative } from "node:path";
import { loadDotfilesConfigFromPath, resolveDotfilesConfigPath, type DotfilesPackDef } from "./resolver/dotfilesConfig";
import { resolveDotfilesSourceToPath, parseGithubSource } from "./resolver/sourceResolver";
import { loadLocalPack } from "./resolver/localPack";
import { execFileSync } from "node:child_process";

export type LockfilePack = {
  source: string;
  rev: string;
  version: string;
  requiredVars: string[];
  integritySha256?: string;
  signatureKeyId?: string;
  integritySignature?: string;
};

export type NexusLockfile = {
  version: 1;
  packs: LockfilePack[];
};

function inferRevFromSource(source: string): string {
  if (source.startsWith("path:")) return "local";
  if (source.startsWith("github:")) {
    const g = parseGithubSource(source);
    if (!g) return "unknown";
    if (!g.ref) return "floating";
    return g.ref;
  }
  return "unknown";
}

function findGitRoot(start: string): string | null {
  let current = start;
  const root = "/";
  while (true) {
    if (existsSync(join(current, ".git"))) return current;
    if (current === root) return null;
    current = dirname(current);
  }
}

function resolveGitHead(path: string): string | null {
  const gitRoot = findGitRoot(path);
  if (!gitRoot) return null;
  try {
    const out = execFileSync("git", ["rev-parse", "HEAD"], {
      cwd: gitRoot,
      stdio: ["ignore", "pipe", "ignore"],
      env: process.env,
    })
      .toString()
      .trim();
    return out || null;
  } catch {
    return null;
  }
}

async function listFilesRec(root: string): Promise<string[]> {
  const out: string[] = [];
  async function walk(dir: string) {
    let entries: Awaited<ReturnType<typeof readdir>>;
    try {
      entries = await readdir(dir, { withFileTypes: true });
    } catch (e: any) {
      if (e?.code === "ENOENT") return;
      throw e;
    }

    for (const entry of entries) {
      const abs = join(dir, entry.name);
      if (entry.isDirectory()) {
        await walk(abs);
      } else if (entry.isFile()) {
        out.push(abs);
      }
    }
  }

  await walk(root);
  out.sort();
  return out;
}

async function computePackIntegritySha256(root: string): Promise<string> {
  const files: string[] = [];

  const topFiles = [join(root, "pack.json"), join(root, "mcp", "servers.json")];
  for (const f of topFiles) {
    if (existsSync(f)) files.push(f);
  }

  const recursiveRoots = [join(root, "skills"), join(root, "opencode")];
  for (const rr of recursiveRoots) {
    const listed = await listFilesRec(rr);
    files.push(...listed);
  }

  files.sort();

  const hash = createHash("sha256");
  for (const abs of files) {
    const rel = relative(root, abs).replaceAll("\\", "/");
    const buf = await readFile(abs);
    hash.update(`${rel}\n`);
    hash.update(buf);
    hash.update("\n");
  }

  return hash.digest("hex");
}

function normalizePem(input: string): string {
  const t = input.trim();
  if (t.includes("BEGIN PUBLIC KEY")) return t;
  return `-----BEGIN PUBLIC KEY-----\n${t}\n-----END PUBLIC KEY-----`;
}

function keyIdFromPublicKeyPem(publicKeyPem: string): string {
  const keyObj = createPublicKey(normalizePem(publicKeyPem));
  const der = keyObj.export({ format: "der", type: "spki" }) as Buffer;
  return createHash("sha256").update(der).digest("hex").slice(0, 16);
}

async function readPackSignatureBase64(packRoot: string): Promise<string | null> {
  const sigPath = join(packRoot, "pack.sig");
  if (!existsSync(sigPath)) return null;
  const raw = await readFile(sigPath, "utf8");
  const trimmed = raw.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function verifyPackSignature(params: {
  integritySha256: string;
  signatureBase64: string;
  publicKeyPem: string;
}): boolean {
  try {
    const keyObj = createPublicKey(normalizePem(params.publicKeyPem));
    const sigBuf = Buffer.from(params.signatureBase64, "base64");
    return verifySig(null, Buffer.from(params.integritySha256, "utf8"), keyObj, sigBuf);
  } catch {
    return false;
  }
}

async function lockEntryFromPack(pack: DotfilesPackDef): Promise<LockfilePack> {
  const root = await resolveDotfilesSourceToPath(pack.source, { allowUnpinned: pack.allowUnpinned });
  const local = await loadLocalPack(root);
  const requiredVars = Object.keys(local.meta.vars?.required ?? {}).sort();

  const resolvedHead = resolveGitHead(root);
  const sourceRev = inferRevFromSource(pack.source);

  const integritySha256 = await computePackIntegritySha256(root);

  let signatureKeyId: string | undefined;
  let integritySignature: string | undefined;

  if (pack.signaturePublicKey) {
    const signatureBase64 = await readPackSignatureBase64(root);
    if (!signatureBase64) {
      throw new Error(`pack signature required but missing pack.sig: ${pack.source}`);
    }

    const valid = verifyPackSignature({
      integritySha256,
      signatureBase64,
      publicKeyPem: pack.signaturePublicKey,
    });

    if (!valid) {
      throw new Error(`pack signature verification failed: ${pack.source}`);
    }

    signatureKeyId = keyIdFromPublicKeyPem(pack.signaturePublicKey);
    integritySignature = signatureBase64;
  }

  return {
    source: pack.source,
    rev: resolvedHead ?? sourceRev,
    version: local.meta.version,
    requiredVars,
    integritySha256,
    signatureKeyId,
    integritySignature,
  };
}

export async function buildLockSnapshot(dotfilesConfigPath: string): Promise<NexusLockfile> {
  const dotfiles = await loadDotfilesConfigFromPath(dotfilesConfigPath);
  const packDefs = dotfiles.packs ?? [];

  const packs: LockfilePack[] = [];
  for (const p of packDefs) packs.push(await lockEntryFromPack(p));
  packs.sort((a, b) => a.source.localeCompare(b.source));

  return { version: 1, packs };
}

export async function readLockfile(path: string): Promise<NexusLockfile | null> {
  if (!existsSync(path)) return null;
  try {
    const raw = await readFile(path, "utf8");
    const parsed = JSON.parse(raw) as NexusLockfile;
    if (parsed?.version !== 1 || !Array.isArray(parsed.packs)) return null;
    return parsed;
  } catch {
    return null;
  }
}

export function buildDiffSummary(prev: NexusLockfile | null, next: NexusLockfile): string[] {
  if (!prev) return ["new lockfile created"];

  const out: string[] = [];
  const prevBySource = new Map(prev.packs.map((p) => [p.source, p]));

  for (const p of next.packs) {
    const old = prevBySource.get(p.source);
    if (!old) {
      out.push(`pack added: ${p.source} @ ${p.version}`);
      continue;
    }
    if (old.version !== p.version) {
      out.push(`pack version: ${p.source} ${old.version} -> ${p.version}`);
    }
    if (old.rev !== p.rev) {
      out.push(`pack rev: ${p.source} ${old.rev} -> ${p.rev}`);
    }
    if ((old.integritySha256 ?? "") !== (p.integritySha256 ?? "")) {
      out.push(`pack checksum: ${p.source} ${(old.integritySha256 ?? "missing").slice(0, 12)} -> ${(p.integritySha256 ?? "missing").slice(0, 12)}`);
    }
    if ((old.signatureKeyId ?? "") !== (p.signatureKeyId ?? "")) {
      out.push(`pack signer: ${p.source} ${old.signatureKeyId ?? "none"} -> ${p.signatureKeyId ?? "none"}`);
    }
    if ((old.integritySignature ?? "") !== (p.integritySignature ?? "")) {
      out.push(`pack signature: ${p.source} ${(old.integritySignature ?? "none").slice(0, 16)} -> ${(p.integritySignature ?? "none").slice(0, 16)}`);
    }

    const oldReq = new Set(old.requiredVars);
    const newReq = new Set(p.requiredVars);
    for (const v of [...newReq].sort()) {
      if (!oldReq.has(v)) out.push(`new required var: ${p.source} ${v}`);
    }
  }

  return out;
}

export async function assertLockfileCompatibilityIfPresent(params: {
  cwd: string;
  dotfilesConfigPath?: string;
}): Promise<void> {
  const dotfilesConfigPath = resolveDotfilesConfigPath({ cwd: params.cwd, explicitPath: params.dotfilesConfigPath ?? null });
  if (!dotfilesConfigPath) return;

  const lockPath = join(params.cwd, "nexus.lock.json");
  const existing = await readLockfile(lockPath);
  if (!existing) return;

  const current = await buildLockSnapshot(dotfilesConfigPath);
  const drift = buildDiffSummary(existing, current);
  if (drift.length === 0) return;

  throw new Error(
    [
      "lockfile compatibility gate failed: pack metadata/checksum drift detected.",
      ...drift.map((d) => `  ${d}`),
      "fix: run `nexus lock update` to trust the current pack artifacts (or revert tampered changes).",
    ].join("\n"),
  );
}

export async function updateLockfile(params: {
  cwd: string;
  dotfilesConfigPath?: string;
}): Promise<{ path: string; lock: NexusLockfile; diff: string[] }> {
  const dotfilesConfigPath = resolveDotfilesConfigPath({ cwd: params.cwd, explicitPath: params.dotfilesConfigPath ?? null });
  if (!dotfilesConfigPath) {
    throw new Error("lock update requires dotfiles packs config (.nexus/packs.json or NEXUS_DOTFILES_CONFIG_JSON)");
  }

  const lock = await buildLockSnapshot(dotfilesConfigPath);
  const lockPath = join(params.cwd, "nexus.lock.json");

  const prev = await readLockfile(lockPath);
  const diff = buildDiffSummary(prev, lock);

  await writeFile(lockPath, JSON.stringify(lock, null, 2) + "\n", "utf8");

  return { path: lockPath, lock, diff };
}
