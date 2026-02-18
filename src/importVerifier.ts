import type { ImportDraft } from "./importProviders/types";
import { parseGithubSource, resolveDotfilesSourceToPath } from "./resolver/sourceResolver";

export type VerifyDraftResult = {
  ok: boolean;
  errors: string[];
  notes: string[];
};

function isHttpUrl(value: string): boolean {
  try {
    const u = new URL(value);
    return u.protocol === "http:" || u.protocol === "https:";
  } catch {
    return false;
  }
}

export async function verifyConvertedDraft(params: { draft: ImportDraft }): Promise<VerifyDraftResult> {
  const errors: string[] = [];
  const notes: string[] = [];
  const draft = params.draft;

  if (!draft || typeof draft.value !== "string" || draft.value.trim() === "") {
    errors.push("draft.value must be a non-empty string");
    return { ok: false, errors, notes };
  }

  if (draft.kind === "unknown") {
    errors.push("draft.kind=unknown is not installable");
    return { ok: false, errors, notes };
  }

  if (draft.kind === "repo" || draft.kind === "manifest") {
    if (draft.value.startsWith("path:")) {
      try {
        await resolveDotfilesSourceToPath(draft.value, { allowUnpinned: true });
        notes.push("path source resolved successfully");
      } catch (e) {
        errors.push(`path source resolution failed: ${e instanceof Error ? e.message : String(e)}`);
      }
    } else if (draft.value.startsWith("github:")) {
      const parsed = parseGithubSource(draft.value);
      if (!parsed) errors.push("github source format is invalid");
      else notes.push("github source parsed successfully");
    } else if (!isHttpUrl(draft.value)) {
      errors.push("repo/manifest draft must be github:, path:, or http(s) URL");
    }
  }

  if ((draft.kind === "docs" || draft.kind === "article") && !(isHttpUrl(draft.value) || draft.value.startsWith("path:"))) {
    errors.push("docs/article draft must be http(s) URL or path:");
  }

  return { ok: errors.length === 0, errors, notes };
}
