import { join } from "node:path";
import { loadLocalPack } from "./resolver/localPack";
import { loadPackMcpServers, loadPackOpenCodeCommands, packSkillByItemId } from "./resolver/coreItems";
import { loadDotfilesRegistryFromEnv } from "./resolver/dotfilesConfig";
import { parseEnableSpec } from "./enable";
import { compileGraph, type AvailableItems } from "./graph";
import { formatId } from "./canonicalId";
import { computeStateHash } from "./state";
import { shouldSkipEmit, writeStateHash } from "./stateFile";
import { emitClaude, type ClaudeSkillInput } from "./emitters/claude";
import { emitMcp, type McpServerInput } from "./emitters/mcp";
import { emitCodex } from "./emitters/codex";
import { emitOpenCode, type OpenCodeCommandInput } from "./emitters/opencode";
import { cleanupOwnedOnly } from "./cleanup";
import { parseNexusConfig, type NexusConfigV1 } from "./configSchema";

export type RunNexusArgs = {
  cwd: string;
  configPath?: string | null;
};

async function findPackRoot(start: string): Promise<string | null> {
  let current = start;
  const root = "/";
  while (true) {
    try {
      const packJson = join(current, "pack.json");
      await Bun.file(packJson).text();
      return current;
    } catch {
      if (current === root) return null;
      current = join(current, "..");
    }
  }
}

async function loadConfig(configPath: string): Promise<NexusConfigV1> {
  const raw = await Bun.file(configPath).text();
  const json = JSON.parse(raw);
  return parseNexusConfig(json);
}

function sourcePathFromDotfiles(source: string): string {
  if (!source.startsWith("path:")) {
    throw new Error(`unsupported dotfiles source (only path: supported for now): ${source}`);
  }
  return source.slice("path:".length);
}

export async function runNexus({ cwd, configPath }: RunNexusArgs): Promise<void> {
  // Mode A: config-driven (no pack.json required)
  if (configPath) {
    const cfg = await loadConfig(configPath);
    const repoRoot = cfg.repoRoot ?? cwd;

    console.log("🔧 Nexus: loading config...");

    const enableSpec = parseEnableSpec(cfg.enable);

    const dotfiles = await loadDotfilesRegistryFromEnv();

    const availableSkillIds = new Set<string>([...Object.keys(cfg.sources.skills), ...dotfiles.skills.keys()]);
    const availableSkills = new Map([...availableSkillIds].sort().map((itemId) => [itemId, { kind: "skill" as const, itemId }]));

    const availableMcpIds = new Set<string>([...dotfiles.mcp.keys()]);
    const availableMcp = new Map([...availableMcpIds].sort().map((name) => [name, { kind: "mcp" as const, name }]));

    const available: AvailableItems = {
      skills: availableSkills,
      mcp: availableMcp,
    };

    const graph = compileGraph({ available, enable: enableSpec });

    const desiredHash = computeStateHash({
      packs: [{ id: "config", rev: "v1" }],
      enable: enableSpec,
      clients: cfg.clients,
      layout: "config",
    });

    if (await shouldSkipEmit(repoRoot, desiredHash)) {
      console.log("✅ Nexus: no changes (state hash matches), skipping emit");
      return;
    }

    console.log("📦 Nexus: emitting outputs...");

    const claudeSkills: ClaudeSkillInput[] = graph.skills.map((node) => {
      const fromCfg = cfg.sources.skills[node.item.itemId]?.path;
      const fromDotfiles = dotfiles.skills.get(node.item.itemId)?.source;

      const srcDir = fromCfg ?? (fromDotfiles ? sourcePathFromDotfiles(fromDotfiles) : null);
      if (!srcDir) throw new Error(`missing skill source for: ${node.item.itemId}`);

      return {
        id: formatId({ pack: "config", imp: "skills", item: node.id }),
        itemId: node.item.itemId,
        srcDir,
      };
    });

    const claudeSkillsRoot = join(repoRoot, ".claude", "skills");
    const desiredPaths = claudeSkills.flatMap((s) => [
      join(claudeSkillsRoot, s.itemId),
      join(claudeSkillsRoot, s.itemId, "SKILL.md"),
    ]);
    desiredPaths.push(join(claudeSkillsRoot, ".nexus-managed"));
    if (cfg.clients.includes("mcp")) desiredPaths.push(join(repoRoot, ".mcp.json"));

    await cleanupOwnedOnly({ repoRoot, desiredPaths });

    if (cfg.clients.includes("claude")) {
      await emitClaude({ repoRoot, skills: claudeSkills });
    }

    if (cfg.clients.includes("mcp")) {
      const mcpInputs: McpServerInput[] = graph.mcp.map((node) => {
        const server = dotfiles.mcp.get(node.item.name);
        if (!server) throw new Error(`missing mcp server def in dotfiles: ${node.item.name}`);
        return {
          id: formatId({ pack: "config", imp: "mcp", item: node.id }),
          name: node.item.name,
          server,
        };
      });
      await emitMcp({ repoRoot, servers: mcpInputs });
    }

    await writeStateHash(repoRoot, desiredHash);
    console.log("✅ Nexus: done");
    return;
  }

  // Mode B: pack.json-driven (v1)
  const packRoot = await findPackRoot(cwd);
  if (!packRoot) {
    throw new Error("No pack.json found (searched up from current directory)");
  }

  const repoRoot = packRoot;

  console.log("🔧 Nexus: loading pack...");
  const pack = await loadLocalPack(packRoot);

  const availableSkills = new Map(pack.skills.map((s) => [s.itemId, { kind: "skill" as const, itemId: s.itemId }]));

  const mcpServers = await loadPackMcpServers(packRoot);
  const availableMcp = new Map(mcpServers.map((m) => [m.name, { kind: "mcp" as const, name: m.name }]));

  const openCodeCommands = await loadPackOpenCodeCommands(packRoot);

  const enableSpec = parseEnableSpec(pack.meta.enable ?? {});

  const available: AvailableItems = {
    skills: availableSkills,
    mcp: availableMcp,
  };
  const graph = compileGraph({ available, enable: enableSpec });

  const stateInput = {
    packs: [{ id: pack.meta.id, rev: pack.meta.version }],
    enable: enableSpec,
    clients: ["claude", "mcp", "codex", "opencode"],
    layout: "single-pack",
  };
  const desiredHash = computeStateHash(stateInput);

  if (await shouldSkipEmit(repoRoot, desiredHash)) {
    console.log("✅ Nexus: no changes (state hash matches), skipping emit");
    return;
  }

  console.log("📦 Nexus: emitting outputs...");

  const claudeSkills: ClaudeSkillInput[] = graph.skills.map((node) => {
    const skill = packSkillByItemId(pack, node.item.itemId);
    return {
      id: formatId({ pack: pack.meta.id, imp: "skills", item: node.id }),
      itemId: skill.itemId,
      srcDir: skill.srcDir,
    };
  });

  const claudeSkillsRoot = join(repoRoot, ".claude", "skills");
  const desiredPaths = claudeSkills.flatMap((s) => [
    join(claudeSkillsRoot, s.itemId),
    join(claudeSkillsRoot, s.itemId, "SKILL.md"),
  ]);
  desiredPaths.push(join(claudeSkillsRoot, ".nexus-managed"));
  desiredPaths.push(join(repoRoot, ".mcp.json"));
  desiredPaths.push(join(repoRoot, ".codex", "config.toml"));

  await cleanupOwnedOnly({ repoRoot, desiredPaths });
  await emitClaude({ repoRoot, skills: claudeSkills });

  const mcpInputs: McpServerInput[] = graph.mcp.map((node) => {
    const srv = mcpServers.find((s) => s.name === node.item.name);
    if (!srv) throw new Error(`missing mcp server: ${node.item.name}`);
    return {
      id: formatId({ pack: pack.meta.id, imp: "mcp", item: node.id }),
      name: srv.name,
      server: srv.server,
    };
  });
  await emitMcp({ repoRoot, servers: mcpInputs });

  await emitCodex({ repoRoot, configToml: `# nexus-managed\n[skills]\nenabled = true\n` });

  const openCodeInputs: OpenCodeCommandInput[] = openCodeCommands.map((cmd) => ({
    id: formatId({ pack: pack.meta.id, imp: "commands", item: cmd.fileName }),
    fileName: cmd.fileName,
    srcPath: cmd.srcPath,
  }));
  await emitOpenCode({ repoRoot, commands: openCodeInputs });

  await writeStateHash(repoRoot, desiredHash);
  console.log("✅ Nexus: done");
}
