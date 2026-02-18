import { test, expect } from "bun:test";
import { createImportProviderRegistry } from "../src/importProviders/registry";
import type { ImportProvider } from "../src/importProviders/types";

test("import providers > register and resolve provider", async () => {
  const mock: ImportProvider = {
    name: "mock",
    async search(query) {
      return [{ id: "m1", title: `result:${query}`, sourceUrl: "https://example.com/m1" }];
    },
    async get(id) {
      return { id, title: "mock item", sourceUrl: "https://example.com/m1", content: "x" };
    },
    async normalize(item) {
      return { sourceId: item.id, sourceUrl: item.sourceUrl, draft: { kind: "repo", value: "github:acme/pack?rev=abc" } };
    },
  };

  const registry = createImportProviderRegistry();
  registry.register(mock);

  const p = registry.get("mock");
  expect(p?.name).toBe("mock");

  const results = await p!.search("lead");
  expect(results[0]?.id).toBe("m1");

  const item = await p!.get("m1");
  const normalized = await p!.normalize(item);
  expect(normalized.draft.kind).toBe("repo");
});

test("import providers > unknown provider returns null", () => {
  const registry = createImportProviderRegistry();
  expect(registry.get("missing")).toBeNull();
});
