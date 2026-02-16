import type { OutputPlugin } from "./types";

const plugins = new Map<OutputPlugin["id"], OutputPlugin>();

export function registerOutputPlugin(plugin: OutputPlugin): void {
  plugins.set(plugin.id, plugin);
}

export function getOutputPlugin(id: OutputPlugin["id"]): OutputPlugin {
  const plugin = plugins.get(id);
  if (!plugin) throw new Error(`missing output plugin: ${id}`);
  return plugin;
}
