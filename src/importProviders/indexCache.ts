import { mkdir } from "node:fs/promises";
import { existsSync } from "node:fs";
import { join } from "node:path";

type IndexEntry = {
  provider: string;
  query: string;
  data: unknown;
  fetchedAtMs: number;
  expiresAtMs: number;
  staleUntilMs: number;
};

type IndexFile = {
  entries: IndexEntry[];
};

function normalizeQuery(q: string): string {
  return q.trim().toLowerCase();
}

function indexPath(repoRoot: string): string {
  return join(repoRoot, ".replix", "import-index.json");
}

async function readIndex(repoRoot: string): Promise<IndexFile> {
  const p = indexPath(repoRoot);
  if (!existsSync(p)) return { entries: [] };
  try {
    const raw = await Bun.file(p).text();
    const parsed = JSON.parse(raw) as IndexFile;
    if (!Array.isArray(parsed.entries)) return { entries: [] };
    return parsed;
  } catch {
    return { entries: [] };
  }
}

async function writeIndex(repoRoot: string, idx: IndexFile): Promise<void> {
  const dir = join(repoRoot, ".replix");
  await mkdir(dir, { recursive: true });
  const p = indexPath(repoRoot);
  await Bun.write(p, JSON.stringify(idx, null, 2) + "\n");
}

export async function getIndexCache(repoRoot: string, provider: string, query: string, nowMs = Date.now()): Promise<unknown | null> {
  const q = normalizeQuery(query);
  const idx = await readIndex(repoRoot);
  const entry = idx.entries.find((e) => e.provider === provider && e.query === q);
  if (!entry) return null;
  if (nowMs > entry.staleUntilMs) return null;
  return entry.data;
}

export async function putIndexCache(
  repoRoot: string,
  provider: string,
  query: string,
  data: unknown,
  ttlMs: number,
  staleWhileRevalidateMs: number,
  nowMs = Date.now(),
): Promise<void> {
  const q = normalizeQuery(query);
  const idx = await readIndex(repoRoot);
  const next: IndexEntry = {
    provider,
    query: q,
    data,
    fetchedAtMs: nowMs,
    expiresAtMs: nowMs + Math.max(0, ttlMs),
    staleUntilMs: nowMs + Math.max(0, ttlMs) + Math.max(0, staleWhileRevalidateMs),
  };

  idx.entries = idx.entries.filter((e) => !(e.provider === provider && e.query === q));
  idx.entries.push(next);
  // prune expired
  idx.entries = idx.entries.filter((e) => nowMs <= e.staleUntilMs);
  await writeIndex(repoRoot, idx);
}
