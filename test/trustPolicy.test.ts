import { test, expect } from "bun:test";
import { evaluateTrustPolicy } from "../src/trustPolicy";

test("trust policy > trusted provider + verified security => low risk", () => {
  const out = evaluateTrustPolicy({ provider: "clawhub", sourceUrl: "https://clawhub.ai/items/x", securityStatus: "verified" });
  expect(out.channel).toBe("trusted");
  expect(out.riskLevel).toBe("low");
});

test("trust policy > unknown provider => warning/high risk", () => {
  const out = evaluateTrustPolicy({ provider: "randomhub", sourceUrl: "https://randomhub.ai/x", securityStatus: "unknown" });
  expect(out.channel).toBe("untrusted");
  expect(out.riskLevel === "medium" || out.riskLevel === "high").toBe(true);
});

test("trust policy > warning security bumps risk", () => {
  const out = evaluateTrustPolicy({ provider: "playbooks", sourceUrl: "https://playbooks.com/skills/x", securityStatus: "warning" });
  expect(out.riskLevel).toBe("high");
});
