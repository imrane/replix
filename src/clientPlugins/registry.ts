import type { ClientFilePlugin } from "./types";

const plugins = new Map<string, ClientFilePlugin>();

export function registerClientFilePlugin(plugin: ClientFilePlugin): void {
  plugins.set(plugin.client, plugin);
}

export function getClientFilePlugin(client: string): ClientFilePlugin | null {
  return plugins.get(client) ?? null;
}

export function applyClientPathNormalization(client: string, relPath: string): string {
  const plugin = getClientFilePlugin(client);
  if (!plugin?.normalizePath) return relPath.replace(/^\/+/, "");
  return plugin.normalizePath({ client, relPath });
}

export function assertClientPathSupported(client: string, relPath: string): void {
  const plugin = getClientFilePlugin(client);
  plugin?.assertSupportedPath?.({ client, relPath });
}
