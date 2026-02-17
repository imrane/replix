import { test, expect } from "bun:test";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { parsePackJson } from "../src/packSchema";

test("example packs > canonical-v1 fixtures declare references", () => {
  const root = join(process.cwd(), "fixtures", "packs", "examples");
  const dirs = readdirSync(root, { withFileTypes: true }).filter((d) => d.isDirectory()).map((d) => d.name);

  for (const dir of dirs) {
    const packPath = join(root, dir, "pack.json");
    const parsed = parsePackJson(JSON.parse(readFileSync(packPath, "utf8")));
    expect(parsed.specVersion).toBe("nexus.canonical.v1-draft");
    expect(parsed.references).toBeDefined();
  }
});
