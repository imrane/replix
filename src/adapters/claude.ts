import type { CanonicalEnableSelectors, ClientArtifactSelectorAdapter } from "./types";

export const claudeSelectorAdapter: ClientArtifactSelectorAdapter = {
  client: "claude",
  toClientPaths(selectors: CanonicalEnableSelectors): string[] {
    const out: string[] = [];

    for (const id of selectors.commands) out.push(`.claude/commands/${id}`);
    for (const id of selectors.hooks) out.push(`.claude/hooks/${id}`);
    for (const id of selectors.agents) out.push(`.claude/agents/${id}`);

    for (const id of selectors.settings) {
      if (id === "settings") out.push(".claude/settings.json");
      else if (id === "settingsLocal") out.push(".claude/settings.local.json");
      else throw new Error(`unsupported claude setting selector: ${id}`);
    }

    return out;
  },
};
