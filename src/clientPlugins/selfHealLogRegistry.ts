import { readFile } from "node:fs/promises";
import { parseClaudeLog } from "./claude/selfHealLog";
import { parseOpenCodeLog } from "./opencode/selfHealLog";
import { parseCodexLog } from "./codex/selfHealLog";

export type ClientLogClass = "lock-drift" | "output-drift" | "schema-gap" | "unknown";

export type ClientLogSignal = {
  classHint?: ClientLogClass;
  reason?: string;
};

export async function parseClientLogFromPath(params: { client?: string; path?: string | null }): Promise<ClientLogSignal | null> {
  if (!params.client || !params.path) return null;

  const raw = await readFile(params.path, "utf8");

  if (params.client === "claude") return parseClaudeLog(raw);
  if (params.client === "opencode") return parseOpenCodeLog(raw);
  if (params.client === "codex") return parseCodexLog(raw);

  return { classHint: "unknown", reason: `no parser for client ${params.client}` };
}
