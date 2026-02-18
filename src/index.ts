#!/usr/bin/env bun

import { runReplix } from "./runReplix";
import { loadDotfilesRegistryFromEnv } from "./resolver/dotfilesConfig";
import { parseReplixConfig, type ReplixConfigV1 } from "./configSchema";
import { parseEnableSpec } from "./enable";
import { checkReplixConfig } from "./check";
import { mkdir } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { compileClientSpec, type ClientSpecSnapshot } from "./specCompiler";
import { runDoctor } from "./doctor";
import { autoPinSourceFromLock, updateLockfile } from "./lockfile";
import { runInit } from "./init";
import { installPack, listInstalledPacks, uninstallPack } from "./packLifecycle";
import { appendLogEvent } from "./opsLog";
import { createSupportBundle } from "./supportBundle";
import { buildRegistrySite } from "./registrySite";
import { runSelfHealCompile } from "./selfHeal";
import { compileCanonicalPackToClient, summarizeCanonicalPlan } from "./compile/canonicalArtifacts";
import { validateShapeSnapshot } from "./clientPlugins/shapeProvenance";
import { validateCanonicalPackV1 } from "./clientPlugins/canonical/validatePack";
import { resolveDotfilesSourceToPath } from "./resolver/sourceResolver";
import { classifyImportInput } from "./importClassifier";
import { createImportProviderRegistry } from "./importProviders/registry";
import {
  importProviderModulesFromDotfiles,
  importProviderModulesFromEnv,
  loadImportProviderModules,
  registerBuiltinImportProviders,
} from "./importProviders/loader";
import { getIndexCache, putIndexCache } from "./importProviders/indexCache";
import { resolveAddInput } from "./addInputResolver";
import { runBrowseTui, type BrowseItem } from "./browseTui";
import { evaluateTrustPolicy } from "./trustPolicy";
import { verifyConvertedDraft } from "./importVerifier";

function readArgValue(flag: string): string | null {
  const idx = process.argv.indexOf(flag);
  if (idx === -1) return null;
  const v = process.argv[idx + 1];
  return typeof v === "string" ? v : null;
}

function isFlagPresent(flag: string): boolean {
  return process.argv.includes(flag);
}

function readArgList(flag: string): string[] {
  const v = readArgValue(flag);
  if (!v) return [];
  return v
    .split(",")
    .map((x) => x.trim())
    .filter(Boolean);
}

function readArgInt(flag: string): number | null {
  const v = readArgValue(flag);
  if (!v) return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

async function loadConfig(configPath: string | null): Promise<ReplixConfigV1 | null> {
  if (!configPath) return null;
  const raw = await Bun.file(configPath).text();
  return parseReplixConfig(JSON.parse(raw));
}

function printListHeader(kind: "skills" | "mcp"): void {
  const title = kind === "skills" ? "Available skills" : "Available MCP servers";
  console.log(`\n${title}\n`);
}

async function listAvailable(kind: "skills" | "mcp", configPath: string | null): Promise<void> {
  const dotfiles = await loadDotfilesRegistryFromEnv();
  const cfg = await loadConfig(configPath);
  const enable = parseEnableSpec(cfg?.enable ?? {});

  if (kind === "skills") {
    const ids = new Set<string>([
      ...dotfiles.skills.keys(),
      ...Object.keys(cfg?.overrides.skills ?? {}),
    ]);
    const sorted = [...ids].sort((a, b) => a.localeCompare(b));

    printListHeader("skills");
    if (sorted.length === 0) {
      console.log("(none found in dotfiles or config overrides)");
      return;
    }

    for (const id of sorted) {
      const overridePath = cfg?.overrides.skills?.[id]?.path;
      const dotfilesSource = dotfiles.skills.get(id)?.source;
      const sourceHint = overridePath ? `override:${overridePath}` : dotfilesSource ? `dotfiles:${dotfilesSource}` : "unknown";
      const status = enable.skills.includes(id) ? "enabled" : "available";
      console.log(`- ${id}\t${status}\t${sourceHint}`);
    }
    return;
  }

  const names = [...dotfiles.mcp.keys()].sort((a, b) => a.localeCompare(b));
  printListHeader("mcp");
  if (names.length === 0) {
    console.log("(none found in dotfiles)");
    return;
  }

  for (const name of names) {
    const server = dotfiles.mcp.get(name);
    const sourceHint = server ? `${server.command}${server.args?.length ? ` ${server.args.join(" ")}` : ""}` : "unknown";
    const status = enable.mcp.includes(name) ? "enabled" : "available";
    console.log(`- ${name}\t${status}\t${sourceHint}`);
  }
}

function renderSnippet(skills: string[], mcp: string[]): string {
  const lines: string[] = [];
  lines.push("replix.lib.mkRepo {");
  lines.push('  system = "x86_64-linux";');
  lines.push('  clients = [ "claude" ];');
  lines.push("  enable = {");
  lines.push(`    skills = [ ${skills.map((s) => `"${s}"`).join(" ")} ];`);
  lines.push(`    mcp = [ ${mcp.map((s) => `"${s}"`).join(" ")} ];`);
  lines.push("  };\n};");
  return lines.join("\n");
}

async function compileSpec(inPath: string, outPath: string): Promise<void> {
  const raw = await Bun.file(inPath).text();
  const snapshot = JSON.parse(raw) as ClientSpecSnapshot;
  const schema = compileClientSpec(snapshot);

  const outAbs = resolve(outPath);
  await mkdir(dirname(outAbs), { recursive: true });
  await Bun.write(outAbs, JSON.stringify(schema, null, 2) + "\n");
  console.log(`✅ replix spec compile: ${outAbs}`);
}

async function main() {
  const cwd = process.cwd();
  const configPath = readArgValue("--config");
  const positionals = process.argv.slice(2).filter((arg) => !arg.startsWith("--"));
  const [cmd, sub, third] = positionals;

  if (isFlagPresent("--version") || isFlagPresent("-v")) {
    try {
      const pkg = JSON.parse(await Bun.file(join(import.meta.dir, "..", "package.json")).text()) as { version?: string };
      console.log(pkg.version ?? "0.0.0-dev");
    } catch {
      console.log("0.0.0-dev");
    }
    return;
  }

  try {
    if (cmd === "pack" && sub === "list") {
      const packs = await listInstalledPacks({ cwd });
      if (packs.length === 0) {
        console.log("(no packs installed; use `replix pack install <source>`)");
        return;
      }
      for (const p of packs) {
        console.log(`- ${p.source}${p.allowUnpinned ? " (allowUnpinned)" : ""}`);
      }
      return;
    }

    if ((cmd === "pack" && sub === "install") || cmd === "add") {
      const rawSource = cmd === "add" ? sub ?? third ?? readArgValue("--source") : third ?? readArgValue("--source");
      if (!rawSource) {
        console.error(cmd === "add" ? "❌ replix add requires <source> or --source <source>" : "❌ replix pack install requires <source> or --source <source>");
        process.exit(1);
      }

      let source = rawSource;
      let providerResolved: string | null = null;
      let inputNote: string | null = null;
      let convertedDraft: import("./importProviders/types").ImportDraft | null = null;

      if (cmd === "add") {
        const isDirectSource = rawSource.startsWith("github:") || rawSource.startsWith("path:");
        const needsProviderResolution =
          !isDirectSource &&
          (/^https?:\/\//i.test(rawSource) || rawSource.includes(" ") || /^([a-z0-9][a-z0-9-]*):(.+)$/.test(rawSource));

        const registry = createImportProviderRegistry();

        if (needsProviderResolution) {
          const dotfiles = await loadDotfilesRegistryFromEnv({ cwd });
          const cfg = await loadConfig(configPath);
          await registerBuiltinImportProviders(registry);

          const modules = [
            ...new Set([
              ...importProviderModulesFromDotfiles(dotfiles),
              ...(cfg?.importProviders?.modules ?? []),
              ...importProviderModulesFromEnv(),
            ]),
          ];
          if (modules.length > 0) {
            await loadImportProviderModules({ cwd, registry, modules });
          }

          const resolvedInput = await resolveAddInput(rawSource, registry);
          source = resolvedInput.resolved;
          inputNote = resolvedInput.note ?? null;
        }

        const m = /^([a-z0-9][a-z0-9-]*):(.+)$/.exec(source);
        if (m && !source.startsWith("github:") && !source.startsWith("path:")) {
          const providerName = m[1]!;
          const itemId = m[2]!;
          const provider = registry.get(providerName);
          if (!provider) {
            console.error(`❌ replix add: unknown provider '${providerName}'`);
            process.exit(2);
          }

          const item = await provider.get(itemId);
          const normalized = await provider.normalize(item);
          convertedDraft = normalized.draft;
          if (normalized.draft.kind !== "repo" && normalized.draft.kind !== "manifest") {
            source = normalized.draft.value;
            providerResolved = providerName;
            inputNote = `${inputNote ? `${inputNote}; ` : ""}provider returned ${normalized.draft.kind}, using draft value directly`;
          } else {
            source = normalized.draft.value;
            providerResolved = providerName;
          }
        }
      }

      const pinResult = await autoPinSourceFromLock({ cwd, source });
      if (pinResult.pinned) {
        source = pinResult.source;
        inputNote = `${inputNote ? `${inputNote}; ` : ""}auto-pinned via lockfile rev ${pinResult.rev}`;
      }

      const detected = classifyImportInput(source);
      const dryRun = isFlagPresent("--dry-run");
      const allowRisky = isFlagPresent("--allow-risky");

      const trust = evaluateTrustPolicy({
        provider: providerResolved ?? (detected.kind === "repo" ? "github" : "unknown"),
        sourceUrl: source,
        securityStatus: "unknown",
      });

      const verify = convertedDraft ? await verifyConvertedDraft({ draft: convertedDraft }) : null;

      if (dryRun) {
        const installed = await listInstalledPacks({ cwd });
        const exists = installed.some((p) => p.source === source);
        const configPath = join(cwd, ".replix", "packs.json");
        console.log(`🧪 DRY RUN ${cmd === "add" ? "replix add" : "replix pack install"}: ${exists ? "already present" : "would add"}`);
        if (inputNote) console.log(`- note: ${inputNote}`);
        if (providerResolved) console.log(`- resolved via provider: ${providerResolved}`);
        console.log(`- source: ${source}`);
        console.log(`- detected: ${detected.kind} (${detected.confidence})`);
        console.log(`- trust: ${trust.channel} risk:${trust.riskLevel} score:${trust.score}`);
        if (verify) {
          console.log(`- verify: ${verify.ok ? "pass" : "fail"}`);
          for (const n of verify.notes) console.log(`  note: ${n}`);
          for (const e of verify.errors) console.log(`  error: ${e}`);
        }
        console.log(`- config: ${configPath}`);
        return;
      }

      if (verify && !verify.ok) {
        console.error("❌ install blocked by verifier gate (converted draft failed checks).");
        for (const e of verify.errors) console.error(`- ${e}`);
        process.exit(2);
      }

      if (trust.riskLevel === "high" && !allowRisky) {
        console.error("❌ install blocked by trust policy (high risk). Re-run with --allow-risky to override.");
        console.error(`- trust: ${trust.channel} risk:${trust.riskLevel} score:${trust.score}`);
        process.exit(2);
      }

      const out = await installPack({ cwd, source, allowUnpinned: isFlagPresent("--allow-unpinned") });
      await appendLogEvent({ cwd, op: cmd === "add" ? "add" : "pack.install", status: "ok", details: { source, rawSource, added: out.added, providerResolved, inputNote, detected } });
      console.log(`✅ ${cmd === "add" ? "replix add" : "replix pack install"}: ${out.added ? "added" : "already present"}`);
      if (inputNote) console.log(`- note: ${inputNote}`);
      if (providerResolved) console.log(`- resolved via provider: ${providerResolved}`);
      console.log(`- source: ${source}`);
      console.log(`- detected: ${detected.kind} (${detected.confidence})`);
      console.log(`- trust: ${trust.channel} risk:${trust.riskLevel} score:${trust.score}`);
      console.log(`- config: ${out.path}`);
      return;
    }

    if (cmd === "pack" && sub === "uninstall") {
      const source = third ?? readArgValue("--source");
      if (!source) {
        console.error("❌ replix pack uninstall requires <source> or --source <source>");
        process.exit(1);
      }
      const out = await uninstallPack({ cwd, source });
      await appendLogEvent({ cwd, op: "pack.uninstall", status: "ok", details: { source, removed: out.removed } });
      console.log(`✅ replix pack uninstall: ${out.removed ? "removed" : "not installed"}`);
      console.log(`- source: ${source}`);
      console.log(`- config: ${out.path}`);
      return;
    }

    if (cmd === "pack" && sub === "upgrade") {
      const out = await updateLockfile({ cwd });
      await appendLogEvent({ cwd, op: "pack.upgrade", status: "ok", details: { path: out.path, diffCount: out.diff.length } });
      console.log(`✅ replix pack upgrade: refreshed lockfile`);
      console.log(`- lockfile: ${out.path}`);
      for (const line of out.diff) console.log(`- ${line}`);
      return;
    }

    if (cmd === "pack" && sub === "list-aliases") {
      const source = third ?? readArgValue("--source");
      if (!source) {
        console.error("❌ replix pack list-aliases requires <source> or --source <source>");
        process.exit(1);
      }

      const root = await resolveDotfilesSourceToPath(source, { allowUnpinned: true });
      const indexPath = join(root, "replix.index.json");
      const exists = await Bun.file(indexPath).exists();
      if (!exists) {
        console.error(`❌ replix pack list-aliases: replix.index.json not found in ${root}`);
        process.exit(2);
      }

      let parsed: any;
      try {
        parsed = JSON.parse(await Bun.file(indexPath).text());
      } catch {
        console.error("❌ replix pack list-aliases: invalid replix.index.json");
        process.exit(2);
      }

      const packMap = parsed?.packs;
      if (!packMap || typeof packMap !== "object") {
        console.error("❌ replix pack list-aliases: expected { \"packs\": { \"name\": \"path\" } }");
        process.exit(2);
      }

      const aliases = Object.keys(packMap).sort((a, b) => a.localeCompare(b));
      if (aliases.length === 0) {
        console.log("(no aliases in replix.index.json)");
        return;
      }

      for (const alias of aliases) {
        console.log(`- ${alias}\t${packMap[alias]}`);
      }
      return;
    }

    if (cmd === "list" && (sub === "skills" || sub === "mcp")) {
      await listAvailable(sub, configPath);
      return;
    }

    if (cmd === "search" || cmd === "browse") {
      const query = readArgValue("--query") ?? sub ?? third ?? "";
      if (!query) {
        console.error(`❌ replix ${cmd} requires --query <text> or positional query`);
        process.exit(1);
      }

      const providerName = readArgValue("--provider");
      const dotfiles = await loadDotfilesRegistryFromEnv({ cwd });
      const cfg = await loadConfig(configPath);
      const registry = createImportProviderRegistry();
      await registerBuiltinImportProviders(registry);

      const modules = [
        ...new Set([
          ...importProviderModulesFromDotfiles(dotfiles),
          ...(cfg?.importProviders?.modules ?? []),
          ...importProviderModulesFromEnv(),
        ]),
      ];
      if (modules.length > 0) {
        await loadImportProviderModules({ cwd, registry, modules });
      }

      if (providerName) {
        const provider = registry.get(providerName);
        if (!provider) {
          console.error(`❌ replix ${cmd}: unknown provider '${providerName}'`);
          process.exit(2);
        }

        const ttlMs = 5 * 60 * 1000;
        const staleMs = 55 * 60 * 1000;
        const cached = (await getIndexCache(cwd, provider.name, query)) as any[] | null;
        const results = cached ?? (await provider.search(query));
        if (!cached) {
          await putIndexCache(cwd, provider.name, query, results, ttlMs, staleMs);
        }

        if (cmd === "browse") {
          const items: BrowseItem[] = results.map((r: any) => ({ ...r, provider: provider.name }));
          await runBrowseTui({
            items,
            onInstall: async (selected) => {
              for (const s of selected) {
                const out = await installPack({ cwd, source: s.sourceUrl, allowUnpinned: true });
                console.log(`✅ installed ${s.provider}:${s.id} -> ${s.sourceUrl} (${out.added ? "added" : "already present"})`);
              }
            },
          });
          return;
        }

        console.log(`provider: ${provider.name}${cached ? " (cached)" : ""}`);
        if (results.length === 0) {
          console.log("(no results)");
        } else {
          for (const r of results) {
            const security = r.securityStatus ?? "unknown";
            const secUrl = r.securityReportUrl ? `\tsecurity:${r.securityReportUrl}` : "";
            const trust = evaluateTrustPolicy({ provider: provider.name, sourceUrl: r.sourceUrl, securityStatus: security as any });
            console.log(`- ${r.id}\t${r.title}\t${r.sourceUrl}\tsec:${security}\ttrust:${trust.channel}/${trust.riskLevel}${secUrl}`);
          }
        }
        return;
      }

      const providers = registry.list();
      if (providers.length === 0) {
        console.log("(no import providers registered)");
        return;
      }

      const allItems: BrowseItem[] = [];
      for (const p of providers) {
        const ttlMs = 5 * 60 * 1000;
        const staleMs = 55 * 60 * 1000;
        const cached = (await getIndexCache(cwd, p.name, query)) as any[] | null;
        const results = cached ?? (await p.search(query));
        if (!cached) {
          await putIndexCache(cwd, p.name, query, results, ttlMs, staleMs);
        }

        if (cmd === "browse") {
          allItems.push(...results.map((r: any) => ({ ...r, provider: p.name })));
          continue;
        }

        console.log(`provider: ${p.name}${cached ? " (cached)" : ""}`);
        if (results.length === 0) {
          console.log("- (no results)");
          continue;
        }
        for (const r of results.slice(0, 5)) {
          const security = r.securityStatus ?? "unknown";
          const secUrl = r.securityReportUrl ? `\tsecurity:${r.securityReportUrl}` : "";
          const trust = evaluateTrustPolicy({ provider: p.name, sourceUrl: r.sourceUrl, securityStatus: security as any });
          console.log(`- ${r.id}\t${r.title}\t${r.sourceUrl}\tsec:${security}\ttrust:${trust.channel}/${trust.riskLevel}${secUrl}`);
        }
      }

      if (cmd === "browse") {
        await runBrowseTui({
          items: allItems,
          onInstall: async (selected) => {
            for (const s of selected) {
              const out = await installPack({ cwd, source: s.sourceUrl, allowUnpinned: true });
              console.log(`✅ installed ${s.provider}:${s.id} -> ${s.sourceUrl} (${out.added ? "added" : "already present"})`);
            }
          },
        });
      }
      return;
    }

    if (cmd === "snippet") {
      const skills = readArgList("--skills");
      const mcp = readArgList("--mcp");
      console.log(renderSnippet(skills, mcp));
      return;
    }

    if (cmd === "check") {
      if (!configPath) {
        console.error("❌ replix check requires --config <path>");
        process.exit(1);
      }
      const result = await checkReplixConfig(configPath, cwd);
      if (result.ok) {
        console.log("✅ replix check: outputs are in sync");
        return;
      }
      console.error("❌ replix check: outputs drifted from config");
      for (const line of result.changes) console.error(`- ${line}`);
      process.exit(2);
    }

    if (cmd === "compile" && sub === "self-heal") {
      if (!configPath) {
        console.error("❌ replix compile self-heal requires --config <path>");
        process.exit(1);
      }
      const maxAttempts = readArgInt("--max-attempts") ?? 3;
      const client = readArgValue("--client") ?? undefined;
      const clientLogPath = readArgValue("--client-log") ?? null;
      const aiFixCommand = readArgValue("--ai-fix-cmd") ?? null;
      const aiFixTsScript = readArgValue("--ai-fix-ts") ?? null;
      const out = await runSelfHealCompile({ cwd, configPath, maxAttempts, client, clientLogPath, aiFixCommand, aiFixTsScript });
      if (out.ok) {
        console.log(`✅ replix compile self-heal: recovered in ${out.attempts} attempt(s)`);
        console.log(`- report: ${out.reportPath}`);
        for (const n of out.notes) console.log(`- ${n}`);
        return;
      }
      console.error(`❌ replix compile self-heal: failed after ${out.attempts} attempt(s)`);
      if (out.issueClass) console.error(`- issue class: ${out.issueClass}`);
      console.error(`- report: ${out.reportPath}`);
      for (const n of out.notes) console.error(`- ${n}`);
      process.exit(2);
    }

    if (cmd === "compile" && sub === "canonical") {
      const client = readArgValue("--client") as "claude" | "opencode" | "codex" | null;
      const packRoot = readArgValue("--pack") ?? cwd;
      const failOnWarn = isFlagPresent("--fail-on-warn");
      if (!client || !["claude", "opencode", "codex"].includes(client)) {
        console.error("❌ replix compile canonical requires --client <claude|opencode|codex>");
        process.exit(1);
      }
      const entries = await compileCanonicalPackToClient({ packRoot, client });
      const summary = summarizeCanonicalPlan(entries);
      console.log(JSON.stringify({ client, packRoot, summary, entries }, null, 2));
      if (failOnWarn && summary.warnings > 0) process.exit(2);
      return;
    }

    if (cmd === "spec" && sub === "validate-canonical-pack") {
      const packRoot = readArgValue("--pack") ?? cwd;
      const result = await validateCanonicalPackV1(packRoot);
      if (result.ok) {
        console.log(`✅ canonical pack valid: ${packRoot}`);
        return;
      }
      console.error(`❌ canonical pack invalid: ${packRoot}`);
      for (const e of result.errors) console.error(`- ${e}`);
      process.exit(2);
    }

    if (cmd === "spec" && sub === "validate-client-shapes") {
      const maxAgeDays = readArgInt("--max-age-days") ?? 30;
      const paths = [
        "src/clientPlugins/claude/client-shape.snapshot.json",
        "src/clientPlugins/opencode/client-shape.snapshot.json",
        "src/clientPlugins/codex/client-shape.snapshot.json",
      ];

      let bad = 0;
      for (const p of paths) {
        const errs = await validateShapeSnapshot(join(cwd, p), maxAgeDays);
        if (errs.length === 0) {
          console.log(`✅ ${p}`);
        } else {
          bad++;
          console.error(`❌ ${p}`);
          for (const e of errs) console.error(`- ${e}`);
        }
      }

      if (bad > 0) process.exit(2);
      return;
    }

    if (cmd === "spec" && sub === "compile") {
      const inPath = readArgValue("--in");
      const outPath = readArgValue("--out");
      if (!inPath || !outPath) {
        console.error("❌ replix spec compile requires --in <snapshot.json> --out <schema.json>");
        process.exit(1);
      }
      await compileSpec(inPath, outPath);
      return;
    }

    if (cmd === "doctor") {
      const result = await runDoctor({ cwd, configPath });
      if (result.ok) {
        console.log("✅ replix doctor: no blocking problems found");
        for (const note of result.notes) console.log(`- ${note}`);
        return;
      }
      console.error("❌ replix doctor: problems found");
      for (const problem of result.problems) console.error(`- ${problem}`);
      if (result.notes.length > 0) {
        console.error("Notes:");
        for (const note of result.notes) console.error(`- ${note}`);
      }
      process.exit(2);
    }

    if (cmd === "lock" && sub === "update") {
      const out = await updateLockfile({ cwd });
      await appendLogEvent({ cwd, op: "lock.update", status: "ok", details: { path: out.path, diffCount: out.diff.length } });
      console.log(`✅ replix lock update: ${out.path}`);
      for (const line of out.diff) console.log(`- ${line}`);
      return;
    }

    if (cmd === "support" && sub === "bundle") {
      const out = await createSupportBundle({ cwd });
      await appendLogEvent({ cwd, op: "support.bundle", status: "ok", details: { path: out.path } });
      console.log(`✅ replix support bundle: ${out.path}`);
      return;
    }

    if (cmd === "registry" && sub === "build") {
      const outDir = readArgValue("--out") ?? undefined;
      const out = await buildRegistrySite({ cwd, outDir });
      await appendLogEvent({ cwd, op: "registry.build", status: "ok", details: { outDir: out.outDir, count: out.count } });
      console.log(`✅ replix registry build: ${out.outDir}`);
      console.log(`- packs: ${out.count}`);
      return;
    }

    if (cmd === "init") {
      const out = await runInit({ cwd });
      console.log("✅ replix init: scaffold ready");
      for (const p of out.created) console.log(`- created: ${p}`);
      for (const n of out.notes) console.log(`- note: ${n}`);
      return;
    }

    if (cmd === "list" || cmd === "snippet" || cmd === "search" || cmd === "check" || cmd === "doctor" || cmd === "init" || cmd === "pack" || cmd === "add" || cmd === "support" || cmd === "registry" || cmd === "compile" || (cmd === "lock" && sub === "update") || (cmd === "spec" && sub === "compile") || isFlagPresent("--help") || isFlagPresent("-h")) {
      console.log("Usage:");
      console.log("  replix [--config <path>]                    # emit Replix artifacts");
      console.log("  replix list skills [--config <path>]        # list skills available in this repo context");
      console.log("  replix list mcp [--config <path>]           # list MCP servers available in this repo context");
      console.log("  replix snippet --skills a,b --mcp x,y       # print mkRepo enable snippet");
      console.log("  replix search --query <text> [--provider name] # search import providers (pluginable)");
      console.log("  replix browse --query <text> [--provider name] # interactive TUI browse/install");
      console.log("  replix check --config <path>                # verify generated outputs are in sync");
      console.log("  replix doctor [--config <path>]             # diagnose blocking config/pack problems");
      console.log("  replix lock update                          # write/update replix.lock.json from dotfiles packs");
      console.log("  replix add <source>                         # shortcut: install pack source for this repo");
      console.log("  replix pack list                            # list installed local packs (.replix/packs.json)");
      console.log("  replix pack install <source>                # install pack source for this repo");
      console.log("  replix pack uninstall <source>              # uninstall pack source for this repo");
      console.log("  replix pack upgrade                         # refresh lockfile against installed packs");
      console.log("  replix pack list-aliases <source>          # list pack aliases from replix.index.json in source repo");
      console.log("  replix init [--client <name>] [--with-lock] [--force] # scaffold .replix config + vars");
      console.log("  replix support bundle                        # write support bundle with config/lock/log snapshots");
      console.log("  replix registry build [--out <dir>]          # build static pack registry site (index.html + index.json)");
      console.log("  replix compile canonical --client <claude|opencode|codex> [--pack <path>] [--fail-on-warn] # compile canonical pack refs into client artifact plan");
      console.log("  replix compile self-heal --config <path> [--max-attempts N] [--client claude|opencode|codex] [--client-log <path>] [--ai-fix-ts <script.ts>] [--ai-fix-cmd '<cmd>'] # bounded self-healing compile loop");
      console.log("  replix spec compile --in <json> --out <json># compile snapshot into validated client schema");
      console.log("  replix spec validate-canonical-pack [--pack <path>] # validate canonical v1 pack structure/references");
      console.log("  replix spec validate-client-shapes [--max-age-days N] # validate client snapshot provenance/freshness");
      return;
    }

    await runReplix({ cwd, configPath });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    await appendLogEvent({ cwd, op: `${cmd ?? "replix"}.${sub ?? "run"}`, status: "error", message: msg });
    if (msg.includes("No pack.json found")) {
      console.error("❌ " + msg);
    } else {
      console.error("❌ Replix error:", err);
    }
    process.exit(1);
  }
}

main();
