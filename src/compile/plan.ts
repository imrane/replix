import { join } from "node:path";
import type { ReplixConfigV1 } from "../configSchema";
import type { EnableSpec } from "../enable";
import type { ClaudeSkillInput } from "../emitters/claude";
import type { McpServerInput } from "../emitters/mcp";
import type { OpenCodeAssetInput } from "../emitters/opencode";
import type { DotfilesRegistry } from "../resolver/dotfilesConfig";
import { parseEnableSpec } from "../enable";
import { compileGraph, type AvailableItems } from "../graph";
import { formatId } from "../canonicalId";
import { templateMcpServer } from "../templating";
import { resolveDotfilesSourceToPath } from "../resolver/sourceResolver";
import type { LocalPack } from "../resolver/localPack";
import { packSkillByItemId } from "../resolver/coreItems";
import type { McpServer } from "../resolver/pack";
import { resolveEnabledClientPaths } from "./clientPaths";
import { applyClientPathNormalization, assertClientPathSupported } from "../clientPlugins/registry";
import type { DotfilesClientFileDef } from "../resolver/dotfilesConfig";
import { resolveVars } from "../vars";

export type ClientFileInjection = {
  client: string;
  relPath: string;
  def: DotfilesClientFileDef;
};

export type EmitPlan = {
  repoRoot: string;
  emitRoot: string;
  layout: "direct" | "generated";
  cleanupMode: "full" | "owned-only";
  clients: string[];
  claudeSkills: ClaudeSkillInput[];
  mcpServers: McpServerInput[];
  openCodeAssets: OpenCodeAssetInput[];
  clientFileInjections: ClientFileInjection[];
  enableSpec: EnableSpec;
  stateHashInput: {
    packs: Array<{ id: string; rev: string }>;
    enable: EnableSpec;
    clients: string[];
    layout: string;
    extra?: unknown;
  };
};

async function sourcePathFromDotfiles(source: string, allowUnpinned?: boolean): Promise<string> {
  return resolveDotfilesSourceToPath(source, { allowUnpinned });
}

function resolveClientFileInjections(
  cfg: ReplixConfigV1,
  dotfiles: DotfilesRegistry,
  enableSpec: EnableSpec,
): ClientFileInjection[] {
  const out: ClientFileInjection[] = [];

  for (const client of cfg.clients) {
    const defs = dotfiles.clients.get(client)?.files ?? {};
    const definedPaths = Object.keys(defs).sort();

    const enabledPaths = resolveEnabledClientPaths({
      client,
      enable: enableSpec,
      explicitPaths: cfg.enable.clients?.[client]?.files,
      definedPaths,
    });

    const seenNormalized = new Set<string>();

    for (const rawRelPath of enabledPaths) {
      const relPath = applyClientPathNormalization(client, rawRelPath);
      assertClientPathSupported(client, relPath);

      if (client === "codex" && relPath === ".codex/config.toml") {
        throw new Error(
          "codex .codex/config.toml is generated from canonical mcp/skills; do not inject it via clients.codex.files",
        );
      }

      if (seenNormalized.has(relPath)) {
        throw new Error(`duplicate client file path after normalization: ${client}.${relPath}`);
      }
      seenNormalized.add(relPath);

      const def = defs[rawRelPath] ?? defs[relPath];
      if (!def) throw new Error(`missing client file def in dotfiles: ${client}.${rawRelPath}`);
      out.push({ client, relPath, def });
    }
  }

  return out;
}

export async function compilePlanFromConfig(params: {
  cfg: ReplixConfigV1;
  dotfiles: DotfilesRegistry;
  cwd: string;
}): Promise<EmitPlan> {
  const { cfg, dotfiles, cwd } = params;
  const repoRoot = cfg.repoRoot ?? cwd;
  const layout = cfg.layout ?? "direct";
  const cleanupMode = cfg.cleanup ?? "owned-only";
  const emitRoot = layout === "generated" ? join(repoRoot, ".replix", "generated") : repoRoot;

  const enableSpec = parseEnableSpec(cfg.enable);

  const availableSkillIds = new Set<string>([...Object.keys(cfg.overrides.skills), ...dotfiles.skills.keys()]);
  const availableSkills = new Map(
    [...availableSkillIds].sort().map((itemId) => [itemId, { kind: "skill" as const, itemId }]),
  );

  const availableMcpIds = new Set<string>([...dotfiles.mcp.keys()]);
  const availableMcp = new Map(
    [...availableMcpIds].sort().map((name) => [name, { kind: "mcp" as const, name }]),
  );

  const claudeFiles = dotfiles.clients.get("claude")?.files ?? {};
  const availableCommands = new Map(
    Object.keys(claudeFiles)
      .filter((p) => p.startsWith(".claude/commands/"))
      .map((p) => [p.replace(".claude/commands/", ""), { kind: "command" as const, itemId: p.replace(".claude/commands/", "") }]),
  );
  const availableHooks = new Map(
    Object.keys(claudeFiles)
      .filter((p) => p.startsWith(".claude/hooks/"))
      .map((p) => [p.replace(".claude/hooks/", ""), { kind: "hook" as const, itemId: p.replace(".claude/hooks/", "") }]),
  );
  const availableAgents = new Map(
    Object.keys(claudeFiles)
      .filter((p) => p.startsWith(".claude/agents/"))
      .map((p) => [p.replace(".claude/agents/", ""), { kind: "agent" as const, itemId: p.replace(".claude/agents/", "") }]),
  );
  const availableSettings = new Map<string, { kind: "setting"; itemId: string }>();
  if (claudeFiles[".claude/settings.json"]) availableSettings.set("settings", { kind: "setting", itemId: "settings" });
  if (claudeFiles[".claude/settings.local.json"]) {
    availableSettings.set("settingsLocal", { kind: "setting", itemId: "settingsLocal" });
  }

  const available: AvailableItems = {
    skills: availableSkills,
    mcp: availableMcp,
    commands: availableCommands,
    hooks: availableHooks,
    agents: availableAgents,
    settings: availableSettings,
  };

  const graph = compileGraph({ available, enable: enableSpec });
  const clientFileInjections = resolveClientFileInjections(cfg, dotfiles, enableSpec);

  const claudeSkills: ClaudeSkillInput[] = await Promise.all(
    graph.skills.map(async (node) => {
      const fromCfg = cfg.overrides.skills[node.item.itemId]?.path;
      const dotfilesSkill = dotfiles.skills.get(node.item.itemId);
      const fromDotfiles = dotfilesSkill?.source;

      const srcDir =
        fromCfg ?? (fromDotfiles ? await sourcePathFromDotfiles(fromDotfiles, dotfilesSkill?.allowUnpinned) : null);
      if (!srcDir) throw new Error(`missing skill source for: ${node.item.itemId}`);

      return {
        id: formatId({ pack: "config", imp: "skills", item: node.id }),
        itemId: node.item.itemId,
        srcDir,
      };
    }),
  );

  const resolvedVars = await resolveVars({
    repoRoot,
    cfgVars: cfg.vars,
    dotfilesVars: dotfiles.vars,
  });
  const strictEnv = cfg.strictEnv ?? dotfiles.strictEnv;

  const mcpServers: McpServerInput[] = graph.mcp.map((node) => {
    const server = dotfiles.mcp.get(node.item.name);
    if (!server) throw new Error(`missing mcp server def in dotfiles: ${node.item.name}`);
    return {
      id: formatId({ pack: "config", imp: "mcp", item: node.id }),
      name: node.item.name,
      server: templateMcpServer(server, {
        vars: resolvedVars.values,
        strictEnv,
        projectRoot: repoRoot,
      }),
    };
  });

  const stateHashInput = {
    packs: [{ id: "config", rev: "v1" }],
    enable: enableSpec,
    clients: cfg.clients,
    layout: `config:${layout}`,
    extra: {
      clientFiles: clientFileInjections.map((inj) => ({
        client: inj.client,
        path: inj.relPath,
        text: inj.def.text,
        source: inj.def.source,
        mode: inj.def.mode,
        executable: inj.def.executable,
      })),
    },
  };

  return {
    repoRoot,
    emitRoot,
    layout,
    cleanupMode,
    clients: cfg.clients,
    claudeSkills,
    mcpServers,
    openCodeAssets: [],
    clientFileInjections,
    enableSpec,
    stateHashInput,
  };
}

export async function compilePlanFromPack(params: {
  pack: LocalPack;
  packRoot: string;
  mcpServers: McpServer[];
  openCodeAssets: OpenCodeAssetInput[];
}): Promise<EmitPlan> {
  const { pack, packRoot, mcpServers, openCodeAssets } = params;

  const availableSkills = new Map(pack.skills.map((s) => [s.itemId, { kind: "skill" as const, itemId: s.itemId }]));
  const availableMcp = new Map(mcpServers.map((m) => [m.name, { kind: "mcp" as const, name: m.name }]));
  const enableSpec = parseEnableSpec(pack.meta.enable ?? {});

  const available: AvailableItems = {
    skills: availableSkills,
    mcp: availableMcp,
  };
  const graph = compileGraph({ available, enable: enableSpec });

  const claudeSkills: ClaudeSkillInput[] = graph.skills.map((node) => {
    const skill = packSkillByItemId(pack, node.item.itemId);
    return {
      id: formatId({ pack: pack.meta.id, imp: "skills", item: node.id }),
      itemId: skill.itemId,
      srcDir: skill.srcDir,
    };
  });

  const mcpInputs: McpServerInput[] = graph.mcp.map((node) => {
    const srv = mcpServers.find((s) => s.name === node.item.name);
    if (!srv) throw new Error(`missing mcp server: ${node.item.name}`);
    return {
      id: formatId({ pack: pack.meta.id, imp: "mcp", item: node.id }),
      name: srv.name,
      server: srv.server,
    };
  });

  const stateHashInput = {
    packs: [{ id: pack.meta.id, rev: pack.meta.version }],
    enable: enableSpec,
    clients: ["claude", "codex", "opencode"],
    layout: "single-pack",
  };

  return {
    repoRoot: packRoot,
    emitRoot: packRoot,
    layout: "direct",
    cleanupMode: "owned-only",
    clients: ["claude", "codex", "opencode"],
    claudeSkills,
    mcpServers: mcpInputs,
    openCodeAssets,
    clientFileInjections: [],
    enableSpec,
    stateHashInput,
  };
}
