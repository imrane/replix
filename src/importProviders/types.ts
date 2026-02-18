export type ImportSearchResult = {
  id: string;
  title: string;
  sourceUrl: string;
  summary?: string;
  tags?: string[];
  securityReportUrl?: string;
  securityStatus?: "verified" | "warning" | "unknown";
};

export type ImportProviderItem = {
  id: string;
  title: string;
  sourceUrl: string;
  content?: string;
  metadata?: Record<string, unknown>;
};

export type ImportDraft =
  | { kind: "repo"; value: string }
  | { kind: "manifest"; value: string }
  | { kind: "docs"; value: string }
  | { kind: "article"; value: string }
  | { kind: "unknown"; value: string };

export type NormalizedImport = {
  sourceId: string;
  sourceUrl: string;
  draft: ImportDraft;
  confidence?: "high" | "medium" | "low";
};

export type ImportProvider = {
  name: string;
  search(query: string): Promise<ImportSearchResult[]>;
  get(id: string): Promise<ImportProviderItem>;
  normalize(item: ImportProviderItem): Promise<NormalizedImport>;
};

export type ImportProviderRegistry = {
  register(provider: ImportProvider): void;
  get(name: string): ImportProvider | null;
  list(): ImportProvider[];
};
