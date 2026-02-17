export type ClientLogSignal = {
  classHint?: "lock-drift" | "output-drift" | "schema-gap" | "unknown";
  reason?: string;
};

export function parseClaudeLog(text: string): ClientLogSignal {
  const t = text.toLowerCase();
  if (t.includes("invalid") && t.includes("settings")) {
    return { classHint: "schema-gap", reason: "claude settings validation failure" };
  }
  if (t.includes("hook") && t.includes("unsupported")) {
    return { classHint: "schema-gap", reason: "unsupported hook config for claude" };
  }
  return { classHint: "unknown" };
}
