export type ClientLogSignal = {
  classHint?: "lock-drift" | "output-drift" | "schema-gap" | "unknown";
  reason?: string;
};

export function parseOpenCodeLog(text: string): ClientLogSignal {
  const t = text.toLowerCase();
  if (t.includes("config") && t.includes("schema") && t.includes("error")) {
    return { classHint: "schema-gap", reason: "opencode config schema error" };
  }
  if (t.includes("agent") && t.includes("unknown")) {
    return { classHint: "schema-gap", reason: "unknown opencode agent reference" };
  }
  return { classHint: "unknown" };
}
