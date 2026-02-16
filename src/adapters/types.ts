export type CanonicalEnableSelectors = {
  commands: string[];
  hooks: string[];
  agents: string[];
  settings: string[];
};

export type ClientArtifactSelectorAdapter = {
  client: string;
  toClientPaths(selectors: CanonicalEnableSelectors): string[];
};
