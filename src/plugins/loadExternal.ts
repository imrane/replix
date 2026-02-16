import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import type { DotfilesRegistry } from "../resolver/dotfilesConfig";

function parseList(raw: string | undefined): string[] {
  if (!raw) return [];
  return raw
    .split(",")
    .map((x) => x.trim())
    .filter(Boolean);
}

async function importModule(spec: string, cwd: string): Promise<void> {
  const normalized = spec.startsWith("path:") ? spec.slice("path:".length) : spec;
  const expanded = normalized.startsWith("~/") ? `${process.env.HOME ?? ""}/${normalized.slice(2)}` : normalized;
  const resolved = expanded.startsWith(".") || expanded.startsWith("/") ? resolve(cwd, expanded) : expanded;
  const target = resolved.startsWith("/") ? pathToFileURL(resolved).href : resolved;
  await import(target);
}

const LEGACY_ENV_DISABLED = process.env.NEXUS_DISABLE_LEGACY_ENV === "1";

export async function loadExternalPlugins(args: {
  cwd: string;
  clients?: string[];
  dotfiles?: DotfilesRegistry;
}): Promise<void> {
  const { cwd, clients = [], dotfiles } = args;

  // Preferred model: plugin registry in dotfiles keyed by client name.
  const byClient = clients
    .map((client) => dotfiles?.plugins.get(client)?.module)
    .filter((x): x is string => typeof x === "string" && x.length > 0);

  // Legacy env module lists (deprecated, will be removed)
  const legacyClientModules = LEGACY_ENV_DISABLED ? [] : parseList(process.env.NEXUS_CLIENT_PLUGIN_MODULES);
  const legacyOutputModules = LEGACY_ENV_DISABLED ? [] : parseList(process.env.NEXUS_OUTPUT_PLUGIN_MODULES);
  const legacyUnifiedModules = LEGACY_ENV_DISABLED ? [] : parseList(process.env.NEXUS_PLUGIN_MODULES);

  const hasLegacy =
    legacyClientModules.length > 0 || legacyOutputModules.length > 0 || legacyUnifiedModules.length > 0;

  if (hasLegacy) {
    console.warn(
      "⚠️ [DEPRECATED] NEXUS_PLUGIN_MODULES/NEXUS_CLIENT_PLUGIN_MODULES/NEXUS_OUTPUT_PLUGIN_MODULES are legacy.",
    );
    console.warn("👉 Migrate to dotfiles plugin registry: programs.nexus.plugins.<client>.module");
    console.warn("💡 Set NEXUS_DISABLE_LEGACY_ENV=1 to disable legacy env var loading.");
  }

  const all = [...new Set([...byClient, ...legacyUnifiedModules, ...legacyClientModules, ...legacyOutputModules])];

  for (const mod of all) {
    await importModule(mod, cwd);
  }
}
