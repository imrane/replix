import { cp, mkdir, readFile, rm, stat, writeFile, chmod } from "node:fs/promises";
import { dirname, join } from "node:path";
import { loadLocalPack } from "./resolver/localPack";
import { loadPackMcpServers, loadPackOpenCodeAssets, packSkillByItemId } from "./resolver/coreItems";
import { loadDotfilesRegistryFromEnv, type DotfilesClientFileDef } from "./resolver/dotfilesConfig";
import { resolveDotfilesSourceToPath } from "./resolver/sourceResolver";
import { parseEnableSpec } from "./enable";
import { compileGraph, type AvailableItems } from "./graph";
import { formatId } from "./canonicalId";
import { computeStateHash } from "./state";
import { shouldSkipEmit, writeStateHash } from "./stateFile";
import { emitClaude, type ClaudeSkillInput } from "./emitters/claude";
import { emitMcp, type McpServerInput } from "./emitters/mcp";
import { emitCodex } from "./emitters/codex";
import { emitOpenCode, type OpenCodeAssetInput } from "./emitters/opencode";
import { cleanupFull, cleanupOwnedOnly } from "./cleanup";
import { parseNexusConfig, type NexusConfigV1 } from "./configSchema";
import { templateMcpServer } from "./templating";

export type RunNexusArgs = {
  cwd: string;
  configPath?: string | null;
};

type ClientFileInjection = {
  client: string;
  relPath: string;
  def: DotfilesClientFileDef;
};

const CUSTOM_FILES_MANIFEST = join(".nexus", "custom-files-owned.json");

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

async function sourcePathFromDotfiles(source: string, allowUnpinned?: boolean): Promise<string> {
  return resolveDotfilesSourceToPath(source, { allowUnpinned });
}

async function readCustomFilesManifest(repoRoot: string): Promise<string[]> {
  try {
    const raw = await readFile(join(repoRoot, CUSTOM_FILES_MANIFEST), "utf8");
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed?.paths) ? parsed.paths.filter((p) => typeof p === "string") : [];
  } catch {
    return [];
  }
}

async function writeCustomFilesManifest(repoRoot: string, relPaths: string[]): Promise<void> {
  const out = join(repoRoot, CUSTOM_FILES_MANIFEST);
  await mkdir(dirname(out), { recursive: true });
  await writeFile(out, JSON.stringify({ paths: [...new Set(relPaths)].sort() }, null, 2) + "\n", "utf8");
}

async function cleanupStaleCustomFiles(repoRoot: string, desiredRelPaths: string[]): Promise<void> {
  const prev = await readCustomFilesManifest(repoRoot);
  const desired = new Set(desiredRelPaths.map((p) => p.replace(/^\/+/, "")));
  for (const rel of prev) {
    const normalized = rel.replace(/^\/+/, "");
    if (desired.has(normalized)) continue;
    await rm(join(repoRoot, normalized), { recursive: true, force: true });
  }
}

async function emitClientFile(repoRoot: string, inj: ClientFileInjection): Promise<void> {
  const outPath = join(repoRoot, inj.relPath);
  await mkdir(dirname(outPath), { recursive: true });

  if (typeof inj.def.text === "string") {
    await writeFile(outPath, inj.def.text, "utf8");
  } else if (typeof inj.def.source === "string") {
    const srcPath = await sourcePathFromDotfiles(inj.def.source, inj.def.allowUnpinned);
    const srcStat = await stat(srcPath);
    if (srcStat.isDirectory()) {
      await rm(outPath, { recursive: true, force: true });
      await mkdir(outPath, { recursive: true });
      await cp(srcPath, outPath, { recursive: true, force: true });
    } else {
      await cp(srcPath, outPath, { force: true });
    }
  } else {
    throw new Error(`client file ${inj.client}:${inj.relPath} must define one of text|source`);
  }

  if (inj.def.mode) {
    await chmod(outPath, Number.parseInt(inj.def.mode, 8));
  } else if (inj.def.executable) {
    await chmod(outPath, 0o755);
  }
}

function normalizeClientFilePath(client: string, relPath: string): string {
  const normalized = relPath.replace(/^\/+/, "");

  // OpenCode conformance bridge: support legacy plural dirs while emitting canonical singular dirs.
  if (client === "opencode") {
    if (normalized === ".opencode/commands") return ".opencode/command";
    if (normalized.startsWith(".opencode/commands/")) {
      return normalized.replace(".opencode/commands/", ".opencode/command/");
    }
    if (normalized === ".opencode/agents") return ".opencode/agent";
    if (normalized.startsWith(".opencode/agents/")) {
      return normalized.replace(".opencode/agents/", ".opencode/agent/");
    }
  }

  return normalized;
}

function assertClientFilePathSupported(client: string, relPath: string): void {
  // Codex conformance: repo-scoped surface is .codex/config.toml only.
  if (client === "codex" && relPath !== ".codex/config.toml") {
    throw new Error(
      `unsupported codex repo file path: ${relPath} (supported: .codex/config.toml; user-global/cloud surfaces are out of scope)`,
    );
  }
}

function resolveClientFileInjections(cfg: NexusConfigV1, dotfiles: Awaited<ReturnType<typeof loadDotfilesRegistryFromEnv>>): ClientFileInjection[] {
  const out: ClientFileInjection[] = [];

  for (const client of cfg.clients) {
    const defs = dotfiles.clients.get(client)?.files ?? {};
    const definedPaths = Object.keys(defs).sort();
    const enabledPaths = cfg.enable.clients?.[client]?.files ?? definedPaths;
    const seenNormalized = new Set<string>();

    for (const rawRelPath of enabledPaths) {
      const relPath = normalizeClientFilePath(client, rawRelPath);
      assertClientFilePathSupported(client, relPath);

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

const PACK_MODE_DEPRECATION_WARNING = [
  "⚠️ [DEPRECATED] pack.json mode is legacy and will be removed in v2.0.0.",
  "👉 Migrate to dotfiles + mkRepo config mode (NEXUS_DOTFILES_CONFIG_JSON + --config).",
  "📅 Timeline: v1.x = compatibility mode with warnings; v2.0.0 = pack.json mode removed.",
].join("\n");

export async function runNexus({ cwd, configPath }: RunNexusArgs): Promise<void> {
  // Mode A: config-driven (no pack.json required)
  if (configPath) {
    const cfg = await loadConfig(configPath);
    const repoRoot = cfg.repoRoot ?? cwd;
    const layout = cfg.layout ?? "direct";
    const cleanupMode = cfg.cleanup ?? "owned-only";
    const emitRoot = layout === "generated" ? join(repoRoot, ".nexus", "generated") : repoRoot;

    console.log("🔧 Nexus: loading config...");

    const enableSpec = parseEnableSpec(cfg.enable);

    const dotfiles = await loadDotfilesRegistryFromEnv();

    const availableSkillIds = new Set<string>([...Object.keys(cfg.overrides.skills), ...dotfiles.skills.keys()]);
    const availableSkills = new Map([...availableSkillIds].sort().map((itemId) => [itemId, { kind: "skill" as const, itemId }]));

    const availableMcpIds = new Set<string>([...dotfiles.mcp.keys()]);
    const availableMcp = new Map([...availableMcpIds].sort().map((name) => [name, { kind: "mcp" as const, name }]));

    const available: AvailableItems = {
      skills: availableSkills,
      mcp: availableMcp,
    };

    const graph = compileGraph({ available, enable: enableSpec });
    const clientFileInjections = resolveClientFileInjections(cfg, dotfiles);

    const desiredHash = computeStateHash({
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
    });

    if (await shouldSkipEmit(emitRoot, desiredHash)) {
      console.log("✅ Nexus: no changes (state hash matches), skipping emit");
      return;
    }

    console.log("📦 Nexus: emitting outputs...");

    const claudeSkills: ClaudeSkillInput[] = await Promise.all(
      graph.skills.map(async (node) => {
        const fromCfg = cfg.overrides.skills[node.item.itemId]?.path;
        const dotfilesSkill = dotfiles.skills.get(node.item.itemId);
        const fromDotfiles = dotfilesSkill?.source;

        const srcDir =
          fromCfg ??
          (fromDotfiles ? await sourcePathFromDotfiles(fromDotfiles, dotfilesSkill?.allowUnpinned) : null);
        if (!srcDir) throw new Error(`missing skill source for: ${node.item.itemId}`);

        return {
          id: formatId({ pack: "config", imp: "skills", item: node.id }),
          itemId: node.item.itemId,
          srcDir,
        };
      }),
    );

    const claudeSkillsRoot = join(emitRoot, ".claude", "skills");
    const desiredPaths = claudeSkills.flatMap((s) => [
      join(claudeSkillsRoot, s.itemId),
      join(claudeSkillsRoot, s.itemId, "SKILL.md"),
    ]);
    desiredPaths.push(join(claudeSkillsRoot, ".nexus-managed"));
    if (graph.mcp.length > 0) desiredPaths.push(join(emitRoot, ".mcp.json"));
    for (const inj of clientFileInjections) desiredPaths.push(join(emitRoot, inj.relPath));

    if (cleanupMode === "full") {
      await cleanupFull(emitRoot);
    } else {
      await cleanupOwnedOnly({ repoRoot: emitRoot, desiredPaths });
      await cleanupStaleCustomFiles(emitRoot, clientFileInjections.map((inj) => inj.relPath));
    }

    if (cfg.clients.includes("claude")) {
      await emitClaude({ repoRoot: emitRoot, skills: claudeSkills });
    }

    if (graph.mcp.length > 0) {
      const processVars = Object.fromEntries(
        Object.entries(process.env)
          .filter(([, v]) => typeof v === "string")
          .map(([k, v]) => [k, v as string]),
      );
      const mergedVars = {
        ...processVars,
        ...dotfiles.vars,
        ...cfg.vars,
      };
      const strictEnv = cfg.strictEnv ?? dotfiles.strictEnv;

      const mcpInputs: McpServerInput[] = graph.mcp.map((node) => {
        const server = dotfiles.mcp.get(node.item.name);
        if (!server) throw new Error(`missing mcp server def in dotfiles: ${node.item.name}`);
        return {
          id: formatId({ pack: "config", imp: "mcp", item: node.id }),
          name: node.item.name,
          server: templateMcpServer(server, {
            vars: mergedVars,
            strictEnv,
            projectRoot: repoRoot,
          }),
        };
      });
      await emitMcp({ repoRoot: emitRoot, servers: mcpInputs });
    }

    for (const inj of clientFileInjections) {
      await emitClientFile(emitRoot, inj);
    }
    await writeCustomFilesManifest(emitRoot, clientFileInjections.map((inj) => inj.relPath));

    await writeStateHash(emitRoot, desiredHash);
    console.log("✅ Nexus: done");
    return;
  }

  // Mode B: pack.json-driven (v1)
  const packRoot = await findPackRoot(cwd);
  if (!packRoot) {
    throw new Error("No pack.json found (searched up from current directory)");
  }

  const repoRoot = packRoot;

  console.warn(PACK_MODE_DEPRECATION_WARNING);
  console.log("🔧 Nexus: loading pack...");
  const pack = await loadLocalPack(packRoot);

  const availableSkills = new Map(pack.skills.map((s) => [s.itemId, { kind: "skill" as const, itemId: s.itemId }]));

  const mcpServers = await loadPackMcpServers(packRoot);
  const availableMcp = new Map(mcpServers.map((m) => [m.name, { kind: "mcp" as const, name: m.name }]));

  const openCodeAssets = await loadPackOpenCodeAssets(packRoot);

  const enableSpec = parseEnableSpec(pack.meta.enable ?? {});

  const available: AvailableItems = {
    skills: availableSkills,
    mcp: availableMcp,
  };
  const graph = compileGraph({ available, enable: enableSpec });

  const stateInput = {
    packs: [{ id: pack.meta.id, rev: pack.meta.version }],
    enable: enableSpec,
    clients: ["claude", "codex", "opencode"],
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
  desiredPaths.push(join(repoRoot, ".opencode", ".nexus-managed"));
  for (const asset of openCodeAssets) {
    desiredPaths.push(join(repoRoot, ".opencode", asset.kind, asset.fileName));
  }

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

  const openCodeInputs: OpenCodeAssetInput[] = openCodeAssets.map((asset) => ({
    id: formatId({ pack: pack.meta.id, imp: asset.kind, item: asset.fileName }),
    kind: asset.kind,
    fileName: asset.fileName,
    srcPath: asset.srcPath,
  }));
  await emitOpenCode({ repoRoot, assets: openCodeInputs });

  await writeStateHash(repoRoot, desiredHash);
  console.log("✅ Nexus: done");
}
