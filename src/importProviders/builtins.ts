import { getCached, setCached, type ImportProviderCacheState } from "./cache";
import type { ImportProvider, ImportProviderItem, ImportSearchResult, NormalizedImport } from "./types";
import { runAiFallbackNormalizer } from "./aiFallback";

const cache: ImportProviderCacheState = {};
const TTL_MS = 5 * 60 * 1000;
const STALE_MS = 55 * 60 * 1000;

function detectDraftFromUrl(url: string): NormalizedImport["draft"] {
  if (url.startsWith("github:") || url.startsWith("path:") || url.includes("github.com")) {
    return { kind: "repo", value: url };
  }
  if (url.includes("clawhub.ai/items/") || url.includes("playbooks.com/")) {
    return { kind: "manifest", value: url };
  }
  if (url.endsWith("pack.json") || url.includes("replix.index.json")) {
    return { kind: "manifest", value: url };
  }
  if (url.includes("/docs")) return { kind: "docs", value: url };
  if (url.includes("/blog") || url.includes("/article") || url.includes("/posts")) return { kind: "article", value: url };
  return { kind: "unknown", value: url };
}

async function fetchJson(url: string): Promise<any | null> {
  try {
    const r = await fetch(url);
    if (!r.ok) return null;
    return await r.json();
  } catch {
    return null;
  }
}

async function fetchText(url: string): Promise<string | null> {
  try {
    const r = await fetch(url);
    if (!r.ok) return null;
    return await r.text();
  } catch {
    return null;
  }
}

const clawhubProvider: ImportProvider = {
  name: "clawhub",
  async search(query: string): Promise<ImportSearchResult[]> {
    const key = `clawhub:search:${query.toLowerCase()}`;
    const hit = getCached(cache, key) as ImportSearchResult[] | null;
    if (hit) return hit;

    const encoded = encodeURIComponent(query);
    const data = await fetchJson(`https://clawhub.ai/api/search?q=${encoded}`);
    const rows = Array.isArray(data?.results) ? data.results : [];
    const out = rows.map((r: any) => {
      const slug = String(r.slug ?? r.id ?? "");
      return {
        id: slug,
        title: String(r.displayName ?? r.name ?? r.slug ?? "unknown"),
        sourceUrl: `https://clawhub.ai/items/${encodeURIComponent(slug)}`,
        summary: typeof r.summary === "string" ? r.summary : undefined,
        securityStatus:
          r.securityStatus === "verified" || r.securityStatus === "warning" || r.securityStatus === "unknown"
            ? r.securityStatus
            : "unknown",
        securityReportUrl:
          typeof r.securityReportUrl === "string"
            ? r.securityReportUrl
            : typeof r.securityUrl === "string"
              ? r.securityUrl
              : `https://clawhub.ai/items/${encodeURIComponent(slug)}/security`,
      };
    });

    setCached(cache, key, out, TTL_MS, STALE_MS);
    return out;
  },
  async get(id: string): Promise<ImportProviderItem> {
    return {
      id,
      title: id,
      sourceUrl: `https://clawhub.ai/items/${encodeURIComponent(id)}`,
      metadata: { provider: "clawhub" },
    };
  },
  async normalize(item: ImportProviderItem): Promise<NormalizedImport> {
    const draft = detectDraftFromUrl(item.sourceUrl);
    if (draft.kind === "unknown") {
      const ai = runAiFallbackNormalizer({ item });
      if (ai) {
        return { sourceId: item.id, sourceUrl: item.sourceUrl, draft: ai.draft, confidence: ai.confidence };
      }
    }
    return { sourceId: item.id, sourceUrl: item.sourceUrl, draft, confidence: draft.kind === "unknown" ? "low" : "medium" };
  },
};

async function crawlPlaybooksSitemap(limit = 100): Promise<string[]> {
  const key = `playbooks:sitemap:${limit}`;
  const hit = getCached(cache, key) as string[] | null;
  if (hit) return hit;

  const indexXml = await fetchText("https://playbooks.com/sitemap.xml");
  if (!indexXml) return [];

  const sitemapUrls = [...indexXml.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1]!).slice(0, 20);
  const out: string[] = [];

  for (const sm of sitemapUrls) {
    const xml = await fetchText(sm);
    if (!xml) continue;
    const locs = [...xml.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1]!);
    for (const u of locs) {
      out.push(u);
      if (out.length >= limit) {
        setCached(cache, key, out, TTL_MS, STALE_MS);
        return out;
      }
    }
  }

  setCached(cache, key, out, TTL_MS, STALE_MS);
  return out;
}

const playbooksProvider: ImportProvider = {
  name: "playbooks",
  async search(query: string): Promise<ImportSearchResult[]> {
    const q = query.toLowerCase();
    const urls = await crawlPlaybooksSitemap(300);
    return urls
      .filter((u) => u.toLowerCase().includes(q))
      .slice(0, 20)
      .map((u) => {
        const id = u.replace(/^https?:\/\/playbooks\.com\//, "");
        return {
          id,
          title: id,
          sourceUrl: u,
          securityStatus: "unknown" as const,
          securityReportUrl: `${u.replace(/\/$/, "")}/security`,
        };
      });
  },
  async get(id: string): Promise<ImportProviderItem> {
    const sourceUrl = id.startsWith("http") ? id : `https://playbooks.com/${id.replace(/^\/+/, "")}`;
    return {
      id,
      title: id,
      sourceUrl,
      metadata: { provider: "playbooks" },
    };
  },
  async normalize(item: ImportProviderItem): Promise<NormalizedImport> {
    const draft = detectDraftFromUrl(item.sourceUrl);
    if (draft.kind === "unknown") {
      const ai = runAiFallbackNormalizer({ item });
      if (ai) {
        return { sourceId: item.id, sourceUrl: item.sourceUrl, draft: ai.draft, confidence: ai.confidence };
      }
    }
    return { sourceId: item.id, sourceUrl: item.sourceUrl, draft, confidence: draft.kind === "unknown" ? "low" : "medium" };
  },
};

export const builtinImportProviders: Record<string, ImportProvider> = {
  clawhub: clawhubProvider,
  playbooks: playbooksProvider,
};
