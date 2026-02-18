import type { ImportProvider } from "../src/importProviders/types";

const invalidDraftProvider: ImportProvider = {
  name: "invalid-draft-provider",
  async search() {
    return [];
  },
  async get(id: string) {
    return { id, title: "Invalid item", sourceUrl: "https://example.com/invalid", content: "demo" };
  },
  async normalize(item) {
    return { sourceId: item.id, sourceUrl: item.sourceUrl, draft: { kind: "unknown", value: "mystery" } };
  },
};

export const importProviders = [invalidDraftProvider];
