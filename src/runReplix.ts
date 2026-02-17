import { join } from "node:path";
import { loadLocalPack } from "./resolver/localPack";
import { loadPackMcpServers, loadPackOpenCodeAssets } from "./resolver/coreItems";
import { loadDotfilesRegistryFromEnv } from "./resolver/dotfilesConfig";
import { computeStateHash } from "./state";
import { shouldSkipEmit, writeStateHash } from "./stateFile";
import { parseReplixConfig } from "./configSchema";
import { compilePlanFromConfig, compilePlanFromPack } from "./compile/plan";
import { emitPlan } from "./compile/emit";
import { assertLockfileCompatibilityIfPresent } from "./lockfile";
import "./clientPlugins/builtins";
import "./outputPlugins/builtins";
import { loadExternalPlugins } from "./plugins/loadExternal";

export type RunReplixArgs = {
  cwd: string;
  configPath?: string | null;
};

const PACK_MODE_DISABLED = process.env.REPLIX_DISABLE_PACK_MODE === "1";

const PACK_MODE_DEPRECATION_WARNING = [
  "⚠️ [DEPRECATED] pack.json mode is legacy and will be removed soon.",
  "👉 Migrate to dotfiles + mkRepo config mode (REPLIX_DOTFILES_CONFIG_JSON + --config).",
  "💡 Set REPLIX_DISABLE_PACK_MODE=1 to disable pack.json fallback entirely.",
].join("\n");

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

export async function runReplix({ cwd, configPath }: RunReplixArgs): Promise<void> {
  // Config mode: dotfiles + mkRepo
  if (configPath) {
    console.log("🔧 Replix: loading config...");
    const raw = await Bun.file(configPath).text();
    const cfg = parseReplixConfig(JSON.parse(raw));

    const dotfiles = await loadDotfilesRegistryFromEnv({ cwd });
    await assertLockfileCompatibilityIfPresent({ cwd });
    await loadExternalPlugins({ cwd, clients: cfg.clients, dotfiles });

    const plan = await compilePlanFromConfig({ cfg, dotfiles, cwd });
    const desiredHash = computeStateHash(plan.stateHashInput);

    if (await shouldSkipEmit(plan.emitRoot, desiredHash)) {
      console.log("✅ Replix: no changes (state hash matches), skipping emit");
      return;
    }

    console.log("📦 Replix: emitting outputs...");
    await emitPlan(plan);
    await writeStateHash(plan.emitRoot, desiredHash);
    console.log("✅ Replix: done");
    return;
  }

  // Pack mode: legacy compatibility
  if (PACK_MODE_DISABLED) {
    throw new Error(
      "pack.json mode is disabled (REPLIX_DISABLE_PACK_MODE=1). Use dotfiles + mkRepo config mode instead.",
    );
  }

  const packRoot = await findPackRoot(cwd);
  if (!packRoot) {
    throw new Error("No pack.json found and no --config specified. See README for migration to config mode.");
  }

  console.warn(PACK_MODE_DEPRECATION_WARNING);
  console.log("🔧 Replix: loading pack...");

  await loadExternalPlugins({ cwd, clients: ["claude", "codex", "opencode"] });

  const pack = await loadLocalPack(packRoot);
  const mcpServers = await loadPackMcpServers(packRoot);
  const openCodeAssets = await loadPackOpenCodeAssets(packRoot);

  const plan = await compilePlanFromPack({ pack, packRoot, mcpServers, openCodeAssets });
  const desiredHash = computeStateHash(plan.stateHashInput);

  if (await shouldSkipEmit(packRoot, desiredHash)) {
    console.log("✅ Replix: no changes (state hash matches), skipping emit");
    return;
  }

  console.log("📦 Replix: emitting outputs...");
  await emitPlan(plan);
  await writeStateHash(packRoot, desiredHash);
  console.log("✅ Replix: done");
}
