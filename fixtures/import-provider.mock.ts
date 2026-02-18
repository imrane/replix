import type { ImportProvider } from "../src/importProviders/types";

const mockProvider: ImportProvider = {
  name: "mock-provider",
  async search(query: string) {
    return [
      {
        id: "mock-1",
        title: `Mock result for ${query}`,
        sourceUrl: "https://example.com/mock-1",
        securityStatus: "verified",
        securityReportUrl: "https://example.com/mock-1/security",
      },
    ];
  },
  async get(id: string) {
    return { id, title: "Mock item", sourceUrl: "https://example.com/mock-1", content: "demo" };
  },
  async normalize(item) {
    return { sourceId: item.id, sourceUrl: item.sourceUrl, draft: { kind: "repo", value: "github:acme/mock?rev=abc" } };
  },
};

export const importProviders = [mockProvider];
