import type { ClientArtifactSelectorAdapter } from "./types";
import { claudeSelectorAdapter } from "./claude";
import { opencodeSelectorAdapter } from "./opencode";
import { codexSelectorAdapter } from "./codex";

const registry = new Map<string, ClientArtifactSelectorAdapter>([
  [claudeSelectorAdapter.client, claudeSelectorAdapter],
  [opencodeSelectorAdapter.client, opencodeSelectorAdapter],
  [codexSelectorAdapter.client, codexSelectorAdapter],
]);

export function getSelectorAdapter(client: string): ClientArtifactSelectorAdapter | null {
  return registry.get(client) ?? null;
}
