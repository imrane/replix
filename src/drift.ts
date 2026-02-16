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
