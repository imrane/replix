import type { EnableSpec } from "../enable";
import { getSelectorAdapter } from "../adapters/registry";

export function resolveCanonicalSelectorPaths(client: string, enable: EnableSpec): string[] {
  const adapter = getSelectorAdapter(client);
  if (!adapter) return [];

  return adapter.toClientPaths({
    commands: enable.commands,
    hooks: enable.hooks,
    agents: enable.agents,
    settings: enable.settings,
  });
}

export function resolveEnabledClientPaths(params: {
  client: string;
  enable: EnableSpec;
  explicitPaths?: string[];
  definedPaths: string[];
}): string[] {
  const { client, enable, explicitPaths, definedPaths } = params;
  const canonicalPaths = resolveCanonicalSelectorPaths(client, enable).filter((p) => definedPaths.includes(p));
  const hasCanonicalSelectors =
    enable.commands.length > 0 ||
    enable.hooks.length > 0 ||
    enable.agents.length > 0 ||
    enable.settings.length > 0;

  const pathSelected = explicitPaths ?? (hasCanonicalSelectors ? [] : definedPaths);
  return [...pathSelected, ...canonicalPaths];
}
