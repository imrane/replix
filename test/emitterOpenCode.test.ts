import { describe, expect, it } from "bun:test";
import {
  mkdtempSync,
  readFileSync,
  existsSync,
  mkdirSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { emitOpenCode } from "../src/emitters/opencode";

describe("opencode emitter", () => {
  it("writes commands and .nexus-managed marker", async () => {
    const repoRoot = mkdtempSync(join(tmpdir(), "nexus-repo-"));
    const cmdSrc = mkdtempSync(join(tmpdir(), "nexus-cmd-"));
    mkdirSync(join(cmdSrc, "commands"), { recursive: true });
    writeFileSync(join(cmdSrc, "commands", "hello.md"), "# hello\n");

    await emitOpenCode({
      repoRoot,
      commands: [
        {
          id: "core/commands:hello",
          fileName: "hello.md",
          srcPath: join(cmdSrc, "commands", "hello.md"),
        },
      ],
    });

    const marker = join(repoRoot, ".opencode", ".nexus-managed");
    expect(existsSync(marker)).toBeTrue();

    const outCmd = join(repoRoot, ".opencode", "commands", "hello.md");
    expect(existsSync(outCmd)).toBeTrue();
    expect(readFileSync(outCmd, "utf8")).toContain("hello");
  });
});
