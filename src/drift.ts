export type DriftTarget = {
  key: string;
  repo: string; // owner/name
  channel?: "release" | "tag";
};

export type UpstreamSnapshot = {
  key: string;
  repo: string;
  releaseTag?: string;
  releasePublishedAt?: string;
  latestTag?: string;
};

export type DriftBaseline = Record<string, UpstreamSnapshot>;

export type DriftDelta = {
  key: string;
  repo: string;
  before?: UpstreamSnapshot;
  after: UpstreamSnapshot;
  changedFields: string[];
};

export type DriftRisk = "low" | "medium" | "high";

export type DriftImpact = {
  risk: DriftRisk;
  affectedModules: string[];
  suggestedTests: string[];
};

function normalized(v: string | undefined): string {
  return (v ?? "").trim();
}

export function diffSnapshots(baseline: DriftBaseline, current: UpstreamSnapshot[]): DriftDelta[] {
  const out: DriftDelta[] = [];

  for (const after of current) {
    const before = baseline[after.key];
    const changedFields: string[] = [];

    if (!before) {
      changedFields.push("new_target");
    } else {
      if (normalized(before.releaseTag) !== normalized(after.releaseTag)) changedFields.push("releaseTag");
      if (normalized(before.releasePublishedAt) !== normalized(after.releasePublishedAt)) changedFields.push("releasePublishedAt");
      if (normalized(before.latestTag) !== normalized(after.latestTag)) changedFields.push("latestTag");
    }

    if (changedFields.length > 0) {
      out.push({ key: after.key, repo: after.repo, before, after, changedFields });
    }
  }

  return out;
}

export function toBaselineMap(current: UpstreamSnapshot[]): DriftBaseline {
  return Object.fromEntries(current.map((s) => [s.key, s]));
}

export function assessImpact(delta: DriftDelta): DriftImpact {
  const hasRelease = delta.changedFields.includes("releaseTag") || delta.changedFields.includes("releasePublishedAt");
  const hasTag = delta.changedFields.includes("latestTag");
  const isNew = delta.changedFields.includes("new_target");

  let risk: DriftRisk = "low";
  if (isNew) risk = "high";
  else if (hasRelease && hasTag) risk = "high";
  else if (hasRelease || hasTag) risk = "medium";

  const byKey: Record<string, { modules: string[]; tests: string[] }> = {
    "claude-code": {
      modules: ["src/emitters/claude.ts", "src/adapters/claude.ts", "src/resolver/dotfilesConfig.ts"],
      tests: ["test/configModeClaudeParity.test.ts", "test/adapterClaude.test.ts"],
    },
    codex: {
      modules: ["src/emitters/codex.ts", "src/adapters/codex.ts", "src/configSchema.ts"],
      tests: ["test/configModeCodexConformance.test.ts", "test/adapterCodex.test.ts"],
    },
    opencode: {
      modules: ["src/emitters/opencode.ts", "src/adapters/opencode.ts", "src/resolver/coreItems.ts"],
      tests: ["test/configModeOpenCodeConformance.test.ts", "test/adapterOpenCode.test.ts"],
    },
  };

  const mapped = byKey[delta.key] ?? {
    modules: ["src/runNexus.ts", "src/compile/clientPaths.ts"],
    tests: ["test/clientPathsCompile.test.ts", "test/goldenConfigModeV2.test.ts"],
  };

  return {
    risk,
    affectedModules: mapped.modules,
    suggestedTests: mapped.tests,
  };
}
