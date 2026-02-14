#!/usr/bin/env bun

import { runNexus } from "./runNexus";

function readArgValue(flag: string): string | null {
  const idx = process.argv.indexOf(flag);
  if (idx === -1) return null;
  const v = process.argv[idx + 1];
  return typeof v === "string" ? v : null;
}

async function main() {
  const cwd = process.cwd();
  const configPath = readArgValue("--config");

  try {
    await runNexus({ cwd, configPath });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (msg.includes("No pack.json found")) {
      console.error("❌ " + msg);
    } else {
      console.error("❌ Nexus error:", err);
    }
    process.exit(1);
  }
}

main();
