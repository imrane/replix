import type { ImportProviderRegistry } from "./importProviders/types";

export async function resolveAddInput(
  raw: string,
  registry: ImportProviderRegistry,
): Promise<{ resolved: string; note?: string }> {
  const value = raw.trim();

  if (value.startsWith("github:") || value.startsWith("path:")) {
    return { resolved: value };
  }

  if (/^https?:\/\/clawhub\.ai\/items\//i.test(value)) {
    const slug = value.replace(/^https?:\/\/clawhub\.ai\/items\//i, "").replace(/\?.*$/, "").replace(/#.*$/, "").replace(/\/$/, "");
    if (slug) return { resolved: `clawhub:${slug}`, note: "resolved from clawhub link" };
  }

  if (/^https?:\/\/playbooks\.com\//i.test(value)) {
    const path = value.replace(/^https?:\/\/playbooks\.com\//i, "").replace(/\?.*$/, "").replace(/#.*$/, "").replace(/\/$/, "");
    if (path) return { resolved: `playbooks:${path}`, note: "resolved from playbooks link" };
  }

  const looksLikeSearchTerm = value.includes(" ") && !value.includes(":") && !value.startsWith("http");
  if (looksLikeSearchTerm) {
    for (const p of registry.list()) {
      const hits = await p.search(value);
      if (hits.length > 0 && hits[0]?.id) {
        return { resolved: `${p.name}:${hits[0].id}`, note: `resolved from search term via ${p.name}` };
      }
    }
  }

  return { resolved: value };
}
