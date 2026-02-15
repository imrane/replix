import { describe, expect, it } from "bun:test";
import { mkdtempSync, mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { loadPackOpenCodeAssets } from "../src/resolver/coreItems";

describe("opencode assets resolver", () => {
  it("loads commands/agents/hooks/rules from pack", async () => {
    const packRoot = mkdtempSync(join(tmpdir(), "nexus-pack-opencode-"));
    mkdirSync(join(packRoot, "opencode", "commands"), { recursive: true });
    mkdirSync(join(packRoot, "opencode", "agents"), { recursive: true });
    mkdirSync(join(packRoot, "opencode", "hooks"), { recursive: true });
    mkdirSync(join(packRoot, "opencode", "rules"), { recursive: true });

    writeFileSync(join(packRoot, "opencode", "commands", "c.md"), "# c\n");
    writeFileSync(join(packRoot, "opencode", "agents", "a.md"), "# a\n");
    writeFileSync(join(packRoot, "opencode", "hooks", "h.sh"), "echo h\n");
    writeFileSync(join(packRoot, "opencode", "rules", "r.md"), "# r\n");

    const assets = await loadPackOpenCodeAssets(packRoot);
    expect(assets.map((a) => `${a.kind}/${a.fileName}`)).toEqual([
      "agents/a.md",
      "commands/c.md",
      "hooks/h.sh",
      "rules/r.md",
    ]);
  });
});
