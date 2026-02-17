#!/usr/bin/env bun

import { runNexus } from "./runNexus";
import { loadDotfilesRegistryFromEnv } from "./resolver/dotfilesConfig";
import { parseNexusConfig, type NexusConfigV1 } from "./configSchema";
import { parseEnableSpec } from "./enable";
import { checkNexusConfig } from "./check";
import { mkdir } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { compileClientSpec, type ClientSpecSnapshot } from "./specCompiler";
import { runDoctor } from "./doctor";
import { updateLockfile } from "./lockfile";
import { runInit } from "./init";
import { installPack, listInstalledPacks, uninstallPack } from "./packLifecycle";
import { appendLogEvent } from "./opsLog";
import { createSupportBundle } from "./supportBundle";
import { buildRegistrySite } from "./registrySite";
import { runSelfHealCompile } from "./selfHeal";

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

async function loadConfig(configPath: string | null): Promise<NexusConfigV1 | null> {
  if (!configPath) return null;
  const raw = await Bun.file(configPath).text();
  return parseNexusConfig(JSON.parse(raw));
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
  lines.push("nexus.lib.mkRepo {");
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
  console.log(`✅ nexus spec compile: ${outAbs}`);
}

async function main() {
  const cwd = process.cwd();
  const configPath = readArgValue("--config");
  const positionals = process.argv.slice(2).filter((arg) => !arg.startsWith("--"));
  const [cmd, sub, third] = positionals;

  try {
    if (cmd === "pack" && sub === "list") {
      const packs = await listInstalledPacks({ cwd });
      if (packs.length === 0) {
        console.log("(no packs installed; use `nexus pack install <source>`)");
        return;
      }
      for (const p of packs) {
        console.log(`- ${p.source}${p.allowUnpinned ? " (allowUnpinned)" : ""}`);
      }
      return;
    }

    if (cmd === "pack" && sub === "install") {
      const source = third ?? readArgValue("--source");
      if (!source) {
        console.error("❌ nexus pack install requires <source> or --source <source>");
        process.exit(1);
      }
      const out = await installPack({ cwd, source, allowUnpinned: isFlagPresent("--allow-unpinned") });
      await appendLogEvent({ cwd, op: "pack.install", status: "ok", details: { source, added: out.added } });
      console.log(`✅ nexus pack install: ${out.added ? "added" : "already present"}`);
      console.log(`- source: ${source}`);
      console.log(`- config: ${out.path}`);
      return;
    }

    if (cmd === "pack" && sub === "uninstall") {
      const source = third ?? readArgValue("--source");
      if (!source) {
        console.error("❌ nexus pack uninstall requires <source> or --source <source>");
        process.exit(1);
      }
      const out = await uninstallPack({ cwd, source });
      await appendLogEvent({ cwd, op: "pack.uninstall", status: "ok", details: { source, removed: out.removed } });
      console.log(`✅ nexus pack uninstall: ${out.removed ? "removed" : "not installed"}`);
      console.log(`- source: ${source}`);
      console.log(`- config: ${out.path}`);
      return;
    }

    if (cmd === "pack" && sub === "upgrade") {
      const out = await updateLockfile({ cwd });
      await appendLogEvent({ cwd, op: "pack.upgrade", status: "ok", details: { path: out.path, diffCount: out.diff.length } });
      console.log(`✅ nexus pack upgrade: refreshed lockfile`);
      console.log(`- lockfile: ${out.path}`);
      for (const line of out.diff) console.log(`- ${line}`);
      return;
    }

    if (cmd === "list" && (sub === "skills" || sub === "mcp")) {
      await listAvailable(sub, configPath);
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
        console.error("❌ nexus check requires --config <path>");
        process.exit(1);
      }
      const result = await checkNexusConfig(configPath, cwd);
      if (result.ok) {
        console.log("✅ nexus check: outputs are in sync");
        return;
      }
      console.error("❌ nexus check: outputs drifted from config");
      for (const line of result.changes) console.error(`- ${line}`);
      process.exit(2);
    }

    if (cmd === "compile" && sub === "self-heal") {
      if (!configPath) {
        console.error("❌ nexus compile self-heal requires --config <path>");
        process.exit(1);
      }
      const maxAttempts = readArgInt("--max-attempts") ?? 3;
      const out = await runSelfHealCompile({ cwd, configPath, maxAttempts });
      if (out.ok) {
        console.log(`✅ nexus compile self-heal: recovered in ${out.attempts} attempt(s)`);
        console.log(`- report: ${out.reportPath}`);
        for (const n of out.notes) console.log(`- ${n}`);
        return;
      }
      console.error(`❌ nexus compile self-heal: failed after ${out.attempts} attempt(s)`);
      if (out.issueClass) console.error(`- issue class: ${out.issueClass}`);
      console.error(`- report: ${out.reportPath}`);
      for (const n of out.notes) console.error(`- ${n}`);
      process.exit(2);
    }

    if (cmd === "spec" && sub === "compile") {
      const inPath = readArgValue("--in");
      const outPath = readArgValue("--out");
      if (!inPath || !outPath) {
        console.error("❌ nexus spec compile requires --in <snapshot.json> --out <schema.json>");
        process.exit(1);
      }
      await compileSpec(inPath, outPath);
      return;
    }

    if (cmd === "doctor") {
      const result = await runDoctor({ cwd, configPath });
      if (result.ok) {
        console.log("✅ nexus doctor: no blocking problems found");
        for (const note of result.notes) console.log(`- ${note}`);
        return;
      }
      console.error("❌ nexus doctor: problems found");
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
      console.log(`✅ nexus lock update: ${out.path}`);
      for (const line of out.diff) console.log(`- ${line}`);
      return;
    }

    if (cmd === "support" && sub === "bundle") {
      const out = await createSupportBundle({ cwd });
      await appendLogEvent({ cwd, op: "support.bundle", status: "ok", details: { path: out.path } });
      console.log(`✅ nexus support bundle: ${out.path}`);
      return;
    }

    if (cmd === "registry" && sub === "build") {
      const outDir = readArgValue("--out") ?? undefined;
      const out = await buildRegistrySite({ cwd, outDir });
      await appendLogEvent({ cwd, op: "registry.build", status: "ok", details: { outDir: out.outDir, count: out.count } });
      console.log(`✅ nexus registry build: ${out.outDir}`);
      console.log(`- packs: ${out.count}`);
      return;
    }

    if (cmd === "init") {
      const out = await runInit({ cwd });
      console.log("✅ nexus init: scaffold ready");
      for (const p of out.created) console.log(`- created: ${p}`);
      for (const n of out.notes) console.log(`- note: ${n}`);
      return;
    }

    if (cmd === "list" || cmd === "snippet" || cmd === "check" || cmd === "doctor" || cmd === "init" || cmd === "pack" || cmd === "support" || cmd === "registry" || cmd === "compile" || (cmd === "lock" && sub === "update") || (cmd === "spec" && sub === "compile") || isFlagPresent("--help") || isFlagPresent("-h")) {
      console.log("Usage:");
      console.log("  nexus [--config <path>]                    # emit Nexus artifacts");
      console.log("  nexus list skills [--config <path>]        # list skills available in this repo context");
      console.log("  nexus list mcp [--config <path>]           # list MCP servers available in this repo context");
      console.log("  nexus snippet --skills a,b --mcp x,y       # print mkRepo enable snippet");
      console.log("  nexus check --config <path>                # verify generated outputs are in sync");
      console.log("  nexus doctor [--config <path>]             # diagnose blocking config/pack problems");
      console.log("  nexus lock update                          # write/update nexus.lock.json from dotfiles packs");
      console.log("  nexus pack list                            # list installed local packs (.nexus/packs.json)");
      console.log("  nexus pack install <source>                # install pack source for this repo");
      console.log("  nexus pack uninstall <source>              # uninstall pack source for this repo");
      console.log("  nexus pack upgrade                         # refresh lockfile against installed packs");
      console.log("  nexus init [--client <name>] [--with-lock] [--force] # scaffold .nexus config + vars");
      console.log("  nexus support bundle                        # write support bundle with config/lock/log snapshots");
      console.log("  nexus registry build [--out <dir>]          # build static pack registry site (index.html + index.json)");
      console.log("  nexus compile self-heal --config <path> [--max-attempts N] # bounded self-healing compile loop");
      console.log("  nexus spec compile --in <json> --out <json># compile snapshot into validated client schema");
      return;
    }

    await runNexus({ cwd, configPath });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    await appendLogEvent({ cwd, op: `${cmd ?? "nexus"}.${sub ?? "run"}`, status: "error", message: msg });
    if (msg.includes("No pack.json found")) {
      console.error("❌ " + msg);
    } else {
      console.error("❌ Nexus error:", err);
    }
    process.exit(1);
  }
}

main();
