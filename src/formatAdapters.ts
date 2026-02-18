import type { ImportDraft } from "./importProviders/types";

export type KnownInputFormat = "claude-markdown" | "codex-toml" | "opencode-json" | "unknown";

export type FormatAdapterInput = {
  sourceId: string;
  content: string;
};

export type DeterministicDraftResult = {
  format: Exclude<KnownInputFormat, "unknown">;
  draft: ImportDraft;
  confidence: "high";
  rationale: string;
};

function looksLikeJson(text: string): boolean {
  const t = text.trim();
  return (t.startsWith("{") && t.endsWith("}")) || (t.startsWith("[") && t.endsWith("]"));
}

export function detectKnownInputFormat(input: FormatAdapterInput): KnownInputFormat {
  const id = input.sourceId.toLowerCase();
  const body = input.content;

  if (id.endsWith(".md") || id.includes(".claude/commands/") || id.includes(".claude/agents/") || id.includes(".claude/hooks/")) {
    if (/^---\n[\s\S]*?\n---\n/m.test(body) || /^#\s+/m.test(body)) return "claude-markdown";
  }

  if (id.endsWith(".toml") || id.includes(".codex/config.toml")) {
    if (/^\s*\[[^\]]+\]/m.test(body) || /^\s*[a-zA-Z0-9_.-]+\s*=\s*/m.test(body)) return "codex-toml";
  }

  if (id.endsWith(".json") || id.includes(".opencode/") || looksLikeJson(body)) {
    try {
      const parsed = JSON.parse(body);
      if (parsed && typeof parsed === "object") return "opencode-json";
    } catch {
      // non-json content
    }
  }

  return "unknown";
}

export function deterministicDraftFromKnownFormat(input: FormatAdapterInput): DeterministicDraftResult | null {
  const format = detectKnownInputFormat(input);
  if (format === "unknown") return null;

  if (format === "claude-markdown") {
    return {
      format,
      draft: { kind: "docs", value: input.content },
      confidence: "high",
      rationale: "markdown/frontmatter structure matches claude artifact conventions",
    };
  }

  if (format === "codex-toml") {
    return {
      format,
      draft: { kind: "manifest", value: input.content },
      confidence: "high",
      rationale: "TOML sections/assignments match codex config surface",
    };
  }

  return {
    format,
    draft: { kind: "manifest", value: input.content },
    confidence: "high",
    rationale: "JSON structure matches opencode config/server surface",
  };
}
