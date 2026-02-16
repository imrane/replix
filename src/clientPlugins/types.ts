export type ClientFilePluginContext = {
  client: string;
  relPath: string;
};

export type ClientFilePlugin = {
  client: string;
  normalizePath?: (ctx: ClientFilePluginContext) => string;
  assertSupportedPath?: (ctx: ClientFilePluginContext) => void;
};
