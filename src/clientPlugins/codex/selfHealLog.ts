export type ClientLogSignal = {
  classHint?: "lock-drift" | "output-drift" | "schema-gap" | "unknown";
  reason?: string;
};

export function parseCodexLog(text: string): ClientLogSignal {
  const t = text.toLowerCase();
  if (t.includes("config.toml") && t.includes("invalid")) {
    return { classHint: "schema-gap", reason: "codex config.toml validation error" };
  }
  if (t.includes("mcp_servers") && t.includes("error")) {
    return { classHint: "schema-gap", reason: "codex mcp server config error" };
  }
  return { classHint: "unknown" };
}
