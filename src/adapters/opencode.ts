import type { CanonicalEnableSelectors, ClientArtifactSelectorAdapter } from "./types";

export const opencodeSelectorAdapter: ClientArtifactSelectorAdapter = {
  client: "opencode",
  toClientPaths(selectors: CanonicalEnableSelectors): string[] {
    const out: string[] = [];

    for (const id of selectors.commands) out.push(`.opencode/command/${id}`);
    for (const id of selectors.hooks) out.push(`.opencode/hooks/${id}`);
    for (const id of selectors.agents) out.push(`.opencode/agent/${id}`);

    // settings selectors are currently Claude-specific; ignore for OpenCode.
    return out;
  },
};
