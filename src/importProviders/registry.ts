import type { ImportProvider, ImportProviderRegistry } from "./types";

export function createImportProviderRegistry(seed: ImportProvider[] = []): ImportProviderRegistry {
  const map = new Map<string, ImportProvider>();

  for (const p of seed) map.set(p.name, p);

  return {
    register(provider: ImportProvider) {
      map.set(provider.name, provider);
    },
    get(name: string) {
      return map.get(name) ?? null;
    },
    list() {
      return [...map.values()].sort((a, b) => a.name.localeCompare(b.name));
    },
  };
}
