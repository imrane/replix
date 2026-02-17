import { runNexus } from "./runNexus";
import { runDoctor } from "./doctor";
import { updateLockfile } from "./lockfile";

export type SelfHealIssueClass = "lock-drift" | "output-drift" | "schema-gap" | "unknown";

export type SelfHealResult = {
  ok: boolean;
  attempts: number;
  issueClass?: SelfHealIssueClass;
  notes: string[];
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
      return { ok: true, attempts: attempt, notes };
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

    return { ok: false, attempts: attempt, issueClass, notes };
  }

  return { ok: false, attempts: maxAttempts, issueClass: "unknown", notes };
}
