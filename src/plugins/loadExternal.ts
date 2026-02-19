import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import type { DotfilesRegistry } from "../resolver/dotfilesConfig";

async function importModule(spec: string, cwd: string): Promise<void> {
  const normalized = spec.startsWith("path:") ? spec.slice("path:".length) : spec;
  const expanded = normalized.startsWith("~/") ? `${process.env.HOME ?? ""}/${normalized.slice(2)}` : normalized;
  const resolved = expanded.startsWith(".") || expanded.startsWith("/") ? resolve(cwd, expanded) : expanded;
  const target = resolved.startsWith("/") ? pathToFileURL(resolved).href : resolved;
  await import(target);
}

export async function loadExternalPlugins(args: {
  cwd: string;
  clients?: string[];
  dotfiles?: DotfilesRegistry;
}): Promise<void> {
  const { cwd, clients = [], dotfiles } = args;

  // Dotfiles-first plugin registry keyed by client name.
  const modules = clients
    .map((client) => dotfiles?.plugins.get(client)?.module)
    .filter((x): x is string => typeof x === "string" && x.length > 0);

  for (const mod of modules) {
    await importModule(mod, cwd);
  }
}
