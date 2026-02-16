import { describe, expect, it } from "bun:test";
import { existsSync } from "node:fs";
import { join } from "node:path";

const FIX = join(import.meta.dir, "..", "fixtures", "packs", "core");

describe("core pack fixture canonical folders", () => {
  it("includes commands/hooks/agents examples", () => {
    expect(existsSync(join(FIX, "commands", "review.md"))).toBeTrue();
    expect(existsSync(join(FIX, "hooks", "pre-commit.sh"))).toBeTrue();
    expect(existsSync(join(FIX, "agents", "security.md"))).toBeTrue();
  });
});
