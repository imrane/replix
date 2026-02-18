import { test, expect } from "bun:test";
import { createImportProviderRegistry } from "../src/importProviders/registry";
import type { ImportProvider } from "../src/importProviders/types";
import { resolveAddInput } from "../src/addInputResolver";

const mock: ImportProvider = {
  name: "clawhub",
  async search(query) {
    if (query.includes("nothing")) return [];
    return [{ id: "skill-1", title: "Skill 1", sourceUrl: "https://clawhub.ai/items/skill-1" }];
  },
  async get(id) {
    return { id, title: id, sourceUrl: `https://clawhub.ai/items/${id}` };
  },
  async normalize(item) {
    return { sourceId: item.id, sourceUrl: item.sourceUrl, draft: { kind: "repo", value: "github:acme/skill?rev=abc" } };
  },
};

test("add input resolver > parses clawhub item URL", async () => {
  const reg = createImportProviderRegistry([mock]);
  const out = await resolveAddInput("https://clawhub.ai/items/test-runner", reg);
  expect(out.resolved).toBe("clawhub:test-runner");
  expect(out.note).toContain("clawhub link");
});

test("add input resolver > parses playbooks URL", async () => {
  const reg = createImportProviderRegistry([mock]);
  const out = await resolveAddInput("https://playbooks.com/skills/typescript-test-patterns", reg);
  expect(out.resolved).toBe("playbooks:skills/typescript-test-patterns");
});

test("add input resolver > resolves plain search term to first provider result", async () => {
  const reg = createImportProviderRegistry([mock]);
  const out = await resolveAddInput("test runner", reg);
  expect(out.resolved).toBe("clawhub:skill-1");
  expect(out.note).toContain("search term");
});

test("add input resolver > leaves unknown untouched", async () => {
  const reg = createImportProviderRegistry([mock]);
  const out = await resolveAddInput("github:acme/skill?rev=abc", reg);
  expect(out.resolved).toBe("github:acme/skill?rev=abc");
});
