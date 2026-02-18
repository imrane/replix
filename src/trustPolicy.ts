export type TrustInput = {
  provider: string;
  sourceUrl: string;
  securityStatus?: "verified" | "warning" | "unknown";
};

export type TrustResult = {
  channel: "trusted" | "review" | "untrusted";
  riskLevel: "low" | "medium" | "high";
  score: number;
  reasons: string[];
};

const TRUSTED_PROVIDERS = new Set(["clawhub", "playbooks", "github", "smithery", "mcpso"]);

export function evaluateTrustPolicy(input: TrustInput): TrustResult {
  let score = 0;
  const reasons: string[] = [];

  if (TRUSTED_PROVIDERS.has(input.provider)) {
    score += 2;
    reasons.push("provider allowlisted");
  } else {
    score -= 2;
    reasons.push("provider not allowlisted");
  }

  if (input.sourceUrl.startsWith("https://")) {
    score += 1;
    reasons.push("https source");
  }
  if (input.sourceUrl.startsWith("github:") || input.sourceUrl.startsWith("path:")) {
    score += 2;
    reasons.push("direct source scheme");
  }
  if (/[?&]rev=/.test(input.sourceUrl) || /@[0-9a-f]{7,}$/i.test(input.sourceUrl)) {
    score += 1;
    reasons.push("pinned revision");
  }

  const sec = input.securityStatus ?? "unknown";
  if (sec === "verified") {
    score += 2;
    reasons.push("security verified");
  } else if (sec === "warning") {
    score -= 3;
    reasons.push("security warning");
  } else {
    score -= 1;
    reasons.push("security unknown");
  }

  if (sec === "warning") return { channel: "untrusted", riskLevel: "high", score, reasons };
  if (score >= 4) return { channel: "trusted", riskLevel: "low", score, reasons };
  if (score >= 0) return { channel: "review", riskLevel: "medium", score, reasons };
  return { channel: "untrusted", riskLevel: "high", score, reasons };
}
