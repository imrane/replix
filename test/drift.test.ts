import { test, expect } from "bun:test";
import { diffSnapshots, toBaselineMap, type UpstreamSnapshot } from "../src/drift";

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
