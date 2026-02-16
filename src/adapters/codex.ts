import type { CanonicalEnableSelectors, ClientArtifactSelectorAdapter } from "./types";

// Codex repo-scoped support in Nexus is intentionally minimal: `.codex/config.toml` only.
// Canonical selectors (commands/hooks/agents/settings) do not currently map to Codex repo artifacts.
export const codexSelectorAdapter: ClientArtifactSelectorAdapter = {
  client: "codex",
  toClientPaths(_selectors: CanonicalEnableSelectors): string[] {
    return [];
  },
};
