import { test, expect } from "bun:test";
import { getCached, setCached, type ImportProviderCacheState } from "../src/importProviders/cache";

test("import provider cache > set/get before expiry", () => {
  const state: ImportProviderCacheState = {};
  setCached(state, "k1", [{ id: "a" }], 1000, 100, 100);
  const out = getCached(state, "k1", 500);
  expect(out).not.toBeNull();
  expect((out as any[])[0]?.id).toBe("a");
});

test("import provider cache > returns stale after ttl but before stale ttl", () => {
  const state: ImportProviderCacheState = {};
  setCached(state, "k1", [{ id: "a" }], 1000, 100, 100);
  const out = getCached(state, "k1", 1150);
  expect(out).not.toBeNull();
});

test("import provider cache > expires after stale ttl", () => {
  const state: ImportProviderCacheState = {};
  setCached(state, "k1", [{ id: "a" }], 1000, 100, 100);
  const out = getCached(state, "k1", 1201);
  expect(out).toBeNull();
});
