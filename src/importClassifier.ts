import { existsSync } from "node:fs";
import { join } from "node:path";

export type ImportSourceKind = "manifest" | "docs" | "article" | "repo" | "unknown";

export type ImportSourceClassification = {
  kind: ImportSourceKind;
  confidence: "high" | "medium" | "low";
  reason: string;
};

function classifyLocalPath(input: string): ImportSourceClassification | null {
  if (!existsSync(input)) return null;

  const isManifest = existsSync(join(input, "pack.json")) || existsSync(join(input, "replix.index.json"));
  if (isManifest) {
    return { kind: "manifest", confidence: "high", reason: "local path contains pack.json or replix.index.json" };
  }

  const isRepo = existsSync(join(input, ".git"));
  if (isRepo) {
    return { kind: "repo", confidence: "high", reason: "local path contains .git" };
  }

  return { kind: "unknown", confidence: "low", reason: "local path exists but has no known manifest/repo markers" };
}

function classifyUrl(input: string): ImportSourceClassification | null {
  let u: URL;
  try {
    u = new URL(input);
  } catch {
    return null;
  }

  const host = u.hostname.toLowerCase();
  const path = u.pathname.toLowerCase();

  if (path.endsWith("/pack.json") || path.endsWith("/replix.index.json") || path.endsWith(".yaml") || path.endsWith(".yml")) {
    return { kind: "manifest", confidence: "medium", reason: "URL path looks like a manifest file" };
  }

  if (path.includes("/docs") || host.includes("docs.")) {
    return { kind: "docs", confidence: "high", reason: "URL looks like documentation" };
  }

  if (host.includes("blog") || path.includes("/blog/") || path.includes("/article") || path.includes("/posts/")) {
    return { kind: "article", confidence: "medium", reason: "URL looks like article/blog content" };
  }

  if (host.includes("github.com") || host.includes("gitlab.com") || path.endsWith(".git")) {
    return { kind: "repo", confidence: "medium", reason: "URL looks like a source repository" };
  }

  return { kind: "unknown", confidence: "low", reason: "URL does not match known source patterns" };
}

export function classifyImportInput(input: string): ImportSourceClassification {
  const value = input.trim();

  if (value.startsWith("github:") || value.startsWith("path:")) {
    return { kind: "repo", confidence: "high", reason: "explicit source scheme indicates repository source" };
  }

  const local = classifyLocalPath(value);
  if (local) return local;

  const url = classifyUrl(value);
  if (url) return url;

  return { kind: "unknown", confidence: "low", reason: "unstructured input requires AI/draft normalization" };
}
