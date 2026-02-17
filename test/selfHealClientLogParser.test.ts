import { test, expect } from "bun:test";
import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { parseClientLogFromPath } from "../src/clientPlugins/selfHealLogRegistry";

test("client log parser > returns schema-gap hint for codex invalid config log", async () => {
  const dir = mkdtempSync(join(tmpdir(), "nexus-log-parser-"));
  try {
    const p = join(dir, "codex.log");
    writeFileSync(p, "ERROR: config.toml invalid near mcp_servers");
    const out = await parseClientLogFromPath({ client: "codex", path: p });
    expect(out?.classHint).toBe("schema-gap");
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
