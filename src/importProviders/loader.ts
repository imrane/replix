import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import type { DotfilesRegistry } from "../resolver/dotfilesConfig";
import { builtinImportProviders } from "./builtins";
import type { ImportProvider, ImportProviderRegistry } from "./types";

type ProviderModuleShape = {
  importProviders?: ImportProvider[];
  registerImportProviders?: (registry: ImportProviderRegistry) => void | Promise<void>;
};

async function importModule(spec: string, cwd: string): Promise<ProviderModuleShape> {
  const expanded = spec.startsWith("~/") ? `${process.env.HOME ?? ""}/${spec.slice(2)}` : spec;
  const resolved = expanded.startsWith(".") || expanded.startsWith("/") ? resolve(cwd, expanded) : expanded;
  const target = resolved.startsWith("/") ? pathToFileURL(resolved).href : resolved;
  return (await import(target)) as ProviderModuleShape;
}

export async function loadImportProviderModules(args: {
  cwd: string;
  registry: ImportProviderRegistry;
  modules: string[];
}): Promise<void> {
  for (const mod of [...new Set(args.modules)]) {
    const loaded = await importModule(mod, args.cwd);

    if (Array.isArray(loaded.importProviders)) {
      for (const p of loaded.importProviders) args.registry.register(p);
    }

    if (typeof loaded.registerImportProviders === "function") {
      await loaded.registerImportProviders(args.registry);
    }
  }
}

export async function registerBuiltinImportProviders(
  registry: ImportProviderRegistry,
  enabled: string[] = Object.keys(builtinImportProviders),
): Promise<void> {
  for (const name of enabled) {
    const p = builtinImportProviders[name];
    if (p) registry.register(p);
  }
}

function parseList(raw: string | undefined): string[] {
  if (!raw) return [];
  return raw
    .split(",")
    .map((x) => x.trim())
    .filter(Boolean);
}

export function importProviderModulesFromDotfiles(dotfiles?: DotfilesRegistry): string[] {
  if (!dotfiles) return [];
  const out: string[] = [];
  for (const [name, def] of dotfiles.plugins.entries()) {
    if (name === "import-providers" || name.startsWith("import-providers:")) {
      out.push(def.module);
    }
  }
  return [...new Set(out)];
}

export function importProviderModulesFromEnv(): string[] {
  return [...new Set(parseList(process.env.REPLIX_IMPORT_PROVIDER_MODULES))];
}
