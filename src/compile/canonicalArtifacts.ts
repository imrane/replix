import { readFile } from "node:fs/promises";
import { basename, join } from "node:path";
import { loadLocalPack } from "../resolver/localPack";
import { mapCanonicalHookEvent, type CanonicalHookEvent } from "../clientPlugins/canonical/hookMapping";

export type CanonicalArtifactPlanEntry = {
  kind: "skill" | "command" | "agent" | "hook" | "mcp";
  source: string;
  target?: string;
  warning?: string;
};

export type CanonicalArtifactPlanSummary = {
  total: number;
  warnings: number;
  byKind: Record<string, number>;
};

function skillIdFromRef(ref: string): string {
  return basename(join(ref, ".."));
}

async function parseHookEventIfJson(path: string): Promise<CanonicalHookEvent | null> {
  if (!path.endsWith(".json")) return null;
  try {
    const raw = await readFile(path, "utf8");
    const parsed = JSON.parse(raw) as { event?: CanonicalHookEvent };
    return parsed.event ?? null;
  } catch {
    return null;
  }
}

export function summarizeCanonicalPlan(entries: CanonicalArtifactPlanEntry[]): CanonicalArtifactPlanSummary {
  const byKind: Record<string, number> = {};
  for (const e of entries) byKind[e.kind] = (byKind[e.kind] ?? 0) + 1;
  return {
    total: entries.length,
    warnings: entries.filter((e) => !!e.warning).length,
    byKind,
  };
}

export async function compileCanonicalPackToClient(params: {
  packRoot: string;
  client: "claude" | "opencode" | "codex";
}): Promise<CanonicalArtifactPlanEntry[]> {
  const pack = await loadLocalPack(params.packRoot);
  const refs = pack.meta.references;
  if (!refs) throw new Error("canonical compile requires pack.references");

  const out: CanonicalArtifactPlanEntry[] = [];

  for (const ref of refs.skills ?? []) {
    const id = skillIdFromRef(ref);
    const source = join(params.packRoot, ref);
    const target =
      params.client === "claude"
        ? `.claude/skills/${id}/SKILL.md`
        : params.client === "opencode"
          ? `.opencode/skills/${id}/SKILL.md`
          : `.agents/skills/${id}/SKILL.md`;
    out.push({ kind: "skill", source, target });
  }

  for (const ref of refs.commands ?? []) {
    const name = basename(ref);
    const source = join(params.packRoot, ref);
    if (params.client === "codex") {
      out.push({ kind: "command", source, warning: "codex has no command artifact target" });
    } else {
      const target = params.client === "claude" ? `.claude/commands/${name}` : `.opencode/command/${name}`;
      out.push({ kind: "command", source, target });
    }
  }

  for (const ref of refs.agents ?? []) {
    const name = basename(ref);
    const source = join(params.packRoot, ref);
    if (params.client === "codex") {
      out.push({ kind: "agent", source, warning: "codex has no agent artifact target" });
    } else {
      const target = params.client === "claude" ? `.claude/agents/${name}` : `.opencode/agent/${name}`;
      out.push({ kind: "agent", source, target });
    }
  }

  for (const ref of refs.hooks ?? []) {
    const name = basename(ref);
    const source = join(params.packRoot, ref);

    const event = await parseHookEventIfJson(source);
    if (event) {
      const mapped = mapCanonicalHookEvent(params.client, event);
      if (!mapped.supported) {
        out.push({ kind: "hook", source, warning: mapped.reason ?? "unsupported hook event" });
        continue;
      }
      if (mapped.severity === "warn" && mapped.reason) {
        out.push({ kind: "hook", source, warning: mapped.reason });
      }
    }

    if (params.client === "codex") {
      out.push({ kind: "hook", source, warning: "codex has no hook artifact target" });
    } else {
      const target = params.client === "claude" ? `.claude/hooks/${name}` : `.opencode/hooks/${name}`;
      out.push({ kind: "hook", source, target });
    }
  }

  for (const ref of refs.mcp ?? []) {
    const source = join(params.packRoot, ref);
    const target = params.client === "opencode" ? "opencode.json#mcp" : params.client === "claude" ? ".mcp.json" : ".codex/config.toml#mcp_servers";
    out.push({ kind: "mcp", source, target });
  }

  return out;
}
