#!/usr/bin/env bun

import { dirname, resolve } from "node:path";
import { mkdir } from "node:fs/promises";
import { compileClientSpec, type ClientSpecSnapshot } from "../src/specCompiler";

function arg(flag: string): string | null {
  const idx = process.argv.indexOf(flag);
  if (idx === -1) return null;
  return process.argv[idx + 1] ?? null;
}

async function main() {
  const inPath = arg("--in");
  const outPath = arg("--out");

  if (!inPath || !outPath) {
    console.error("Usage: bun scripts/spec-compile.ts --in <snapshot.json> --out <schema.json>");
    process.exit(1);
  }

  const raw = await Bun.file(inPath).text();
  const snapshot = JSON.parse(raw) as ClientSpecSnapshot;
  const schema = compileClientSpec(snapshot);

  const outAbs = resolve(outPath);
  await mkdir(dirname(outAbs), { recursive: true });
  await Bun.write(outAbs, JSON.stringify(schema, null, 2) + "\n");
  console.log(`✅ compiled spec schema: ${outAbs}`);
}

main().catch((err) => {
  console.error("❌ spec compile failed:", err instanceof Error ? err.message : String(err));
  process.exit(1);
});
