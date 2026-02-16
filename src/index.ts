#!/usr/bin/env bun

import { runNexus } from "./runNexus";
import { loadDotfilesRegistryFromEnv } from "./resolver/dotfilesConfig";
import { parseNexusConfig, type NexusConfigV1 } from "./configSchema";
import { parseEnableSpec } from "./enable";
import { checkNexusConfig } from "./check";

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

async function main() {
  const cwd = process.cwd();
  const configPath = readArgValue("--config");
  const [cmd, sub] = process.argv.slice(2).filter((arg) => !arg.startsWith("--"));

  try {
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

    if (cmd === "list" || cmd === "snippet" || cmd === "check" || isFlagPresent("--help") || isFlagPresent("-h")) {
      console.log("Usage:");
      console.log("  nexus [--config <path>]                    # emit Nexus artifacts");
      console.log("  nexus list skills [--config <path>]        # list skills available in this repo context");
      console.log("  nexus list mcp [--config <path>]           # list MCP servers available in this repo context");
      console.log("  nexus snippet --skills a,b --mcp x,y       # print mkRepo enable snippet");
      console.log("  nexus check --config <path>                # verify generated outputs are in sync");
      return;
    }

    await runNexus({ cwd, configPath });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (msg.includes("No pack.json found")) {
      console.error("❌ " + msg);
    } else {
      console.error("❌ Nexus error:", err);
    }
    process.exit(1);
  }
}

main();
