import { test, expect } from "bun:test";
import { assessImpact, diffSnapshots, toBaselineMap, type UpstreamSnapshot } from "../src/drift";

test("drift diff > detects changed release tag", () => {
  const before: UpstreamSnapshot[] = [
    { key: "opencode", repo: "sst/opencode", releaseTag: "v0.1.0", releasePublishedAt: "2026-02-01T00:00:00Z" },
  ];
  const after: UpstreamSnapshot[] = [
    { key: "opencode", repo: "sst/opencode", releaseTag: "v0.1.1", releasePublishedAt: "2026-02-02T00:00:00Z" },
  ];

  const diff = diffSnapshots(toBaselineMap(before), after);
  expect(diff).toHaveLength(1);
  expect(diff[0]?.changedFields).toContain("releaseTag");
});

test("drift diff > no changes returns empty", () => {
  const now: UpstreamSnapshot[] = [
    { key: "claude", repo: "anthropics/claude-code", latestTag: "v1.2.3" },
  ];
  const diff = diffSnapshots(toBaselineMap(now), now);
  expect(diff).toHaveLength(0);
});

test("drift diff > missing baseline target is flagged as new_target", () => {
  const after: UpstreamSnapshot[] = [
    { key: "codex", repo: "openai/codex", latestTag: "v0.9.0" },
  ];
  const diff = diffSnapshots({}, after);
  expect(diff).toHaveLength(1);
  expect(diff[0]?.changedFields).toEqual(["new_target"]);
});

test("drift impact > assigns high risk for new target", () => {
  const after: UpstreamSnapshot[] = [{ key: "codex", repo: "openai/codex", latestTag: "v0.9.0" }];
  const delta = diffSnapshots({}, after)[0]!;
  const impact = assessImpact(delta);
  expect(impact.risk).toBe("high");
  expect(impact.affectedModules).toContain("src/emitters/codex.ts");
});

test("drift impact > assigns medium risk for release-only change", () => {
  const before = [{ key: "opencode", repo: "sst/opencode", releaseTag: "v1.0.0" }];
  const after = [{ key: "opencode", repo: "sst/opencode", releaseTag: "v1.0.1" }];
  const delta = diffSnapshots(toBaselineMap(before), after)[0]!;
  const impact = assessImpact(delta);
  expect(impact.risk).toBe("medium");
  expect(impact.suggestedTests).toContain("test/adapterOpenCode.test.ts");
});

test("drift diff > detects docs fingerprint drift", () => {
  const before = [{ key: "claude-code", repo: "anthropics/claude-code", docsFingerprint: "abc" }];
  const after = [{ key: "claude-code", repo: "anthropics/claude-code", docsFingerprint: "xyz" }];
  const delta = diffSnapshots(toBaselineMap(before), after)[0]!;
  expect(delta.changedFields).toContain("docsFingerprint");
  expect(assessImpact(delta).risk).toBe("medium");
});
