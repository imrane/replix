#!/usr/bin/env bun

import { join } from "node:path";
import { loadLocalPack } from "./resolver/localPack";
import { loadPackMcpServers, loadPackOpenCodeCommands, packSkillByItemId } from "./resolver/coreItems";
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

async function main() {
  const cwd = process.cwd();
  const packRoot = await findPackRoot(cwd);
  if (!packRoot) {
    console.error("❌ No pack.json found (searched up from current directory)");
    process.exit(1);
  }

  // Assume repo root is the same as pack root for now (can be configurable later)
  const repoRoot = packRoot;

  console.log("🔧 Nexus: loading pack...");
  const pack = await loadLocalPack(packRoot);

  // Load available items
  const availableSkills = new Map(pack.skills.map((s) => [s.itemId, { kind: "skill" as const, itemId: s.itemId }]));

  const mcpServers = await loadPackMcpServers(packRoot);
  const availableMcp = new Map(mcpServers.map((m) => [m.name, { kind: "mcp" as const, name: m.name }]));

  const openCodeCommands = await loadPackOpenCodeCommands(packRoot);

  // Parse enable spec from pack.json
  const enableSpec = parseEnableSpec(pack.meta.enable ?? {});

  // Compile graph
  const available: AvailableItems = {
    skills: availableSkills,
    mcp: availableMcp,
  };
  const graph = compileGraph({ available, enable: enableSpec });

  // Compute state hash
  const stateInput = {
    packs: [{ id: pack.meta.id, rev: pack.meta.version }],
    enable: enableSpec,
    clients: ["claude", "mcp", "codex", "opencode"],
    layout: "single-pack",
  };
  const desiredHash = computeStateHash(stateInput);

  // Check if we should skip (idempotent)
  if (await shouldSkipEmit(repoRoot, desiredHash)) {
    console.log("✅ Nexus: no changes (state hash matches), skipping emit");
    return;
  }

  console.log("📦 Nexus: emitting outputs...");

  // Emit Claude skills
  const claudeSkills: ClaudeSkillInput[] = graph.skills.map((node) => {
    const skill = packSkillByItemId(pack, node.item.itemId);
    return {
      id: formatId({ pack: pack.meta.id, imp: "skills", item: node.id }),
      itemId: skill.itemId,
      srcDir: skill.srcDir,
    };
  });

  // Build desired paths for cleanup
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

  // Emit MCP
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

  // Emit Codex (placeholder config)
  await emitCodex({ repoRoot, configToml: `# nexus-managed\n[skills]\nenabled = true\n` });

  // Emit OpenCode commands
  const openCodeInputs: OpenCodeCommandInput[] = openCodeCommands.map((cmd) => ({
    id: formatId({ pack: pack.meta.id, imp: "commands", item: cmd.fileName }),
    fileName: cmd.fileName,
    srcPath: cmd.srcPath,
  }));
  await emitOpenCode({ repoRoot, commands: openCodeInputs });

  // Write state file
  await writeStateHash(repoRoot, desiredHash);

  console.log("✅ Nexus: done");
}

main().catch((err) => {
  console.error("❌ Nexus error:", err);
  process.exit(1);
});
