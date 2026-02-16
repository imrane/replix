#!/usr/bin/env bun

import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { diffSnapshots, toBaselineMap, type DriftBaseline, type DriftTarget, type UpstreamSnapshot } from "../src/drift";

const DEFAULT_TARGETS: DriftTarget[] = [
  { key: "opencode", repo: "sst/opencode" },
  { key: "codex", repo: "openai/codex" },
  { key: "claude-code", repo: "anthropics/claude-code" },
];

type GhRelease = {
  tag_name?: string;
  published_at?: string;
};

type GhTag = {
  name?: string;
};

async function fetchJson<T>(url: string): Promise<T | null> {
  const res = await fetch(url, {
    headers: {
      Accept: "application/vnd.github+json",
      ...(process.env.GITHUB_TOKEN ? { Authorization: `Bearer ${process.env.GITHUB_TOKEN}` } : {}),
      ...(process.env.GH_TOKEN ? { Authorization: `Bearer ${process.env.GH_TOKEN}` } : {}),
      "User-Agent": "nexus-spec-drift-check",
    },
  });

  if (res.status === 404) return null;
  if (!res.ok) {
    throw new Error(`GitHub request failed (${res.status}) ${url}`);
  }

  return (await res.json()) as T;
}

async function fetchSnapshot(target: DriftTarget): Promise<UpstreamSnapshot> {
  const release = await fetchJson<GhRelease>(`https://api.github.com/repos/${target.repo}/releases/latest`);
  const tags = await fetchJson<GhTag[]>(`https://api.github.com/repos/${target.repo}/tags?per_page=1`);

  return {
    key: target.key,
    repo: target.repo,
    releaseTag: release?.tag_name,
    releasePublishedAt: release?.published_at,
    latestTag: tags?.[0]?.name,
  };
}

async function readBaseline(path: string): Promise<DriftBaseline> {
  try {
    const raw = await readFile(path, "utf8");
    return JSON.parse(raw) as DriftBaseline;
  } catch {
    return {};
  }
}

function parseTargets(): DriftTarget[] {
  const raw = process.env.NEXUS_DRIFT_TARGETS_JSON;
  if (!raw) return DEFAULT_TARGETS;
  const parsed = JSON.parse(raw) as DriftTarget[];
  return parsed;
}

async function main() {
  const cwd = process.cwd();
  const targets = parseTargets();

  const outDir = join(cwd, ".nexus");
  const baselinePath = join(outDir, "spec-drift-baseline.json");
  const reportPath = join(outDir, "spec-drift-report.json");

  const baseline = await readBaseline(baselinePath);
  const current = await Promise.all(targets.map(fetchSnapshot));
  const deltas = diffSnapshots(baseline, current);

  const report = {
    generatedAt: new Date().toISOString(),
    targets,
    deltas,
    current,
  };

  await mkdir(dirname(reportPath), { recursive: true });
  await writeFile(reportPath, JSON.stringify(report, null, 2) + "\n", "utf8");

  if (process.env.NEXUS_DRIFT_UPDATE_BASELINE === "1") {
    await writeFile(baselinePath, JSON.stringify(toBaselineMap(current), null, 2) + "\n", "utf8");
  }

  if (deltas.length === 0) {
    console.log("✅ spec drift: no changes");
    return;
  }

  console.log(`⚠️ spec drift: ${deltas.length} target(s) changed`);
  for (const d of deltas) {
    console.log(`- ${d.key} (${d.repo}): ${d.changedFields.join(", ")}`);
  }

  if (process.env.NEXUS_DRIFT_FAIL_ON_CHANGE === "1") {
    process.exit(2);
  }
}

main().catch((err) => {
  console.error("❌ spec drift check failed", err);
  process.exit(1);
});
