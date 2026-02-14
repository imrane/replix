import { describe, expect, it } from "bun:test";
import { mkdtempSync, writeFileSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { loadLocalPack } from "../src/resolver/localPack";

describe("local pack resolver", () => {
  it("loads pack.json and enumerates skills directories", async () => {
    const root = mkdtempSync(join(tmpdir(), "nexus-pack-"));

    writeFileSync(
      join(root, "pack.json"),
      JSON.stringify({ id: "core", version: "1.0.0", imports: [] }, null, 2),
    );

    mkdirSync(join(root, "skills", "repo-status"), { recursive: true });
    writeFileSync(join(root, "skills", "repo-status", "SKILL.md"), "# skill\n");

    const pack = await loadLocalPack(root);

    expect(pack.meta.id).toBe("core");
    expect(pack.skills.map((s) => s.itemId)).toEqual(["repo-status"]);
  });
});
