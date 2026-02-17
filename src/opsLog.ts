import { existsSync } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";

export type NexusLogEvent = {
  ts: string;
  op: string;
  status: "ok" | "error";
  message?: string;
  details?: Record<string, unknown>;
};

export function logFilePath(cwd: string): string {
  return join(cwd, ".nexus", "logs", "events.ndjson");
}

export async function appendLogEvent(params: {
  cwd: string;
  op: string;
  status: "ok" | "error";
  message?: string;
  details?: Record<string, unknown>;
}): Promise<void> {
  const path = logFilePath(params.cwd);
  await mkdir(dirname(path), { recursive: true });

  const event: NexusLogEvent = {
    ts: new Date().toISOString(),
    op: params.op,
    status: params.status,
    message: params.message,
    details: params.details,
  };

  let existing = "";
  if (existsSync(path)) {
    existing = await readFile(path, "utf8");
  }
  const line = JSON.stringify(event) + "\n";
  await writeFile(path, existing + line, "utf8");
}

export async function readRecentLogLines(params: { cwd: string; maxLines?: number }): Promise<string[]> {
  const path = logFilePath(params.cwd);
  if (!existsSync(path)) return [];

  const raw = await readFile(path, "utf8");
  const lines = raw
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);

  const maxLines = params.maxLines ?? 200;
  return lines.slice(Math.max(0, lines.length - maxLines));
}
