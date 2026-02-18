export type ImportProviderCacheEntry = {
  data: unknown;
  fetchedAtMs: number;
  expiresAtMs: number;
  staleUntilMs: number;
};

export type ImportProviderCacheState = Record<string, ImportProviderCacheEntry>;

export function setCached(
  cache: ImportProviderCacheState,
  key: string,
  data: unknown,
  ttlMs: number,
  staleWhileRevalidateMs: number,
  nowMs = Date.now(),
): void {
  cache[key] = {
    data,
    fetchedAtMs: nowMs,
    expiresAtMs: nowMs + Math.max(0, ttlMs),
    staleUntilMs: nowMs + Math.max(0, ttlMs) + Math.max(0, staleWhileRevalidateMs),
  };
}

export function getCached(cache: ImportProviderCacheState, key: string, nowMs = Date.now()): unknown | null {
  const hit = cache[key];
  if (!hit) return null;
  if (nowMs > hit.staleUntilMs) {
    delete cache[key];
    return null;
  }
  return hit.data;
}
