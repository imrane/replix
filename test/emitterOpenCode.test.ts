import { describe, expect, it } from "bun:test";
import { mkdtempSync, readFileSync, existsSync, mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { emitOpenCode } from "../src/emitters/opencode";

describe("opencode emitter", () => {
  it("writes commands/agents/hooks/rules and .nexus-managed marker", async () => {
    const repoRoot = mkdtempSync(join(tmpdir(), "nexus-repo-"));
    const src = mkdtempSync(join(tmpdir(), "nexus-opencode-"));
    mkdirSync(join(src, "opencode", "commands"), { recursive: true });
    mkdirSync(join(src, "opencode", "agents"), { recursive: true });
    mkdirSync(join(src, "opencode", "hooks"), { recursive: true });
    mkdirSync(join(src, "opencode", "rules"), { recursive: true });

    writeFileSync(join(src, "opencode", "commands", "hello.md"), "# hello\n");
    writeFileSync(join(src, "opencode", "agents", "planner.md"), "# planner\n");
    writeFileSync(join(src, "opencode", "hooks", "pre-commit.sh"), "echo hi\n");
    writeFileSync(join(src, "opencode", "rules", "style.md"), "# style\n");

    await emitOpenCode({
      repoRoot,
      assets: [
        {
          id: "core/commands:hello",
          kind: "commands",
          fileName: "hello.md",
          srcPath: join(src, "opencode", "commands", "hello.md"),
        },
        {
          id: "core/agents:planner",
          kind: "agents",
          fileName: "planner.md",
          srcPath: join(src, "opencode", "agents", "planner.md"),
        },
        {
          id: "core/hooks:pre-commit.sh",
          kind: "hooks",
          fileName: "pre-commit.sh",
          srcPath: join(src, "opencode", "hooks", "pre-commit.sh"),
        },
        {
          id: "core/rules:style",
          kind: "rules",
          fileName: "style.md",
          srcPath: join(src, "opencode", "rules", "style.md"),
        },
      ],
    });

    expect(existsSync(join(repoRoot, ".opencode", ".nexus-managed"))).toBeTrue();
    expect(readFileSync(join(repoRoot, ".opencode", "commands", "hello.md"), "utf8")).toContain("hello");
    expect(readFileSync(join(repoRoot, ".opencode", "agents", "planner.md"), "utf8")).toContain("planner");
    expect(readFileSync(join(repoRoot, ".opencode", "hooks", "pre-commit.sh"), "utf8")).toContain("echo hi");
    expect(readFileSync(join(repoRoot, ".opencode", "rules", "style.md"), "utf8")).toContain("style");
  });
});
