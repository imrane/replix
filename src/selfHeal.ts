import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { runNexus } from "./runNexus";
import { runDoctor } from "./doctor";
import { updateLockfile } from "./lockfile";

export type SelfHealIssueClass = "lock-drift" | "output-drift" | "schema-gap" | "unknown";

export type SelfHealResult = {
  ok: boolean;
  attempts: number;
  issueClass?: SelfHealIssueClass;
  notes: string[];
  reportPath: string;
};

function classify(problems: string[]): SelfHealIssueClass {
  const text = problems.join("\n");
  if (text.includes("lockfile compatibility gate failed")) return "lock-drift";
  if (text.includes("output drift detected")) return "output-drift";
  if (text.includes("missing enabled") || text.includes("pack reference file not found") || text.includes("must be")) {
    return "schema-gap";
  }
  return "unknown";
}

async function writeReport(params: {
  cwd: string;
  ok: boolean;
  attempts: number;
  issueClass?: SelfHealIssueClass;
  notes: string[];
}): Promise<string> {
  const dir = join(params.cwd, ".nexus", "self-heal");
  await mkdir(dir, { recursive: true });
  const path = join(dir, "last-report.json");
  await writeFile(
    path,
    JSON.stringify(
      {
        generatedAt: new Date().toISOString(),
        ok: params.ok,
        attempts: params.attempts,
        issueClass: params.issueClass,
        notes: params.notes,
      },
      null,
      2,
    ) + "\n",
    "utf8",
  );
  return path;
}

export async function runSelfHealCompile(params: {
  cwd: string;
  configPath: string;
  maxAttempts?: number;
}): Promise<SelfHealResult> {
  const maxAttempts = Math.max(1, params.maxAttempts ?? 3);
  const notes: string[] = [];

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    notes.push(`attempt ${attempt}/${maxAttempts}: emit`);
    try {
      await runNexus({ cwd: params.cwd, configPath: params.configPath });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      notes.push(`emit failed: ${msg}`);
    }

    const doctor = await runDoctor({ cwd: params.cwd, configPath: params.configPath });
    if (doctor.ok) {
      notes.push(`attempt ${attempt}: doctor ok`);
      const reportPath = await writeReport({ cwd: params.cwd, ok: true, attempts: attempt, notes });
      return { ok: true, attempts: attempt, notes, reportPath };
    }

    const issueClass = classify(doctor.problems);
    notes.push(`attempt ${attempt}: class=${issueClass}`);

    if (issueClass === "lock-drift") {
      const lock = await updateLockfile({ cwd: params.cwd });
      notes.push(`lock updated: ${lock.path}`);
      continue;
    }

    if (issueClass === "output-drift") {
      notes.push("retrying after drift");
      continue;
    }

    const reportPath = await writeReport({ cwd: params.cwd, ok: false, attempts: attempt, issueClass, notes });
    return { ok: false, attempts: attempt, issueClass, notes, reportPath };
  }

  const reportPath = await writeReport({ cwd: params.cwd, ok: false, attempts: maxAttempts, issueClass: "unknown", notes });
  return { ok: false, attempts: maxAttempts, issueClass: "unknown", notes, reportPath };
}
