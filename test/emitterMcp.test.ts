import { describe, expect, it } from "bun:test";
import { mkdtempSync, readFileSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { emitMcp } from "../src/emitters/mcp";

describe("mcp emitter", () => {
  it("writes .mcp.json with __generated_by marker", async () => {
    const repoRoot = mkdtempSync(join(tmpdir(), "nexus-repo-"));

    await emitMcp({
      repoRoot,
      servers: [
        {
          id: "core/mcp:filesystem",
          name: "filesystem",
          server: { command: "node", args: ["server.js"] },
        },
      ],
    });

    const outPath = join(repoRoot, ".mcp.json");
    expect(existsSync(outPath)).toBeTrue();

    const raw = readFileSync(outPath, "utf8");
    const parsed = JSON.parse(raw);

    expect(parsed.__generated_by).toBe("nexus");
    expect(parsed.mcpServers.filesystem.command).toBe("node");
  });
});
