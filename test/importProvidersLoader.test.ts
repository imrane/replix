import { test, expect } from "bun:test";
import { join } from "node:path";
import { createImportProviderRegistry } from "../src/importProviders/registry";
import { loadImportProviderModules, registerBuiltinImportProviders } from "../src/importProviders/loader";

test("import provider loader > loads providers from external module", async () => {
  const registry = createImportProviderRegistry();
  const mod = join(process.cwd(), "fixtures", "import-provider.mock.ts");

  await loadImportProviderModules({ cwd: process.cwd(), registry, modules: [mod] });

  const provider = registry.get("mock-provider");
  expect(provider).not.toBeNull();

  const results = await provider!.search("abc");
  expect(results[0]?.id).toBe("mock-1");
});

test("import provider loader > registers builtins through same plugin system", async () => {
  const registry = createImportProviderRegistry();
  await registerBuiltinImportProviders(registry, ["clawhub", "playbooks"]);

  const a = registry.get("clawhub");
  const b = registry.get("playbooks");
  expect(a).not.toBeNull();
  expect(b).not.toBeNull();

  const ra = await a!.search("lead");
  const rb = await b!.search("lead");
  expect(Array.isArray(ra)).toBe(true);
  expect(Array.isArray(rb)).toBe(true);
});
