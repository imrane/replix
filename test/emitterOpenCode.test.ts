import { describe, expect, it } from "bun:test";
import { mkdtempSync, readFileSync, existsSync, mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { emitOpenCode } from "../src/emitters/opencode";

describe("opencode emitter", () => {
  it("writes command/agent/hooks/rules and .nexus-managed marker (upstream-aligned dirs)", async () => {
    const repoRoot = mkdtempSync(join(tmpdir(), "nexus-repo-"));
    const src = mkdtempSync(join(tmpdir(), "nexus-opencode-"));
    mkdirSync(join(src, "opencode", "command"), { recursive: true });
    mkdirSync(join(src, "opencode", "agent"), { recursive: true });
    mkdirSync(join(src, "opencode", "hooks"), { recursive: true });
    mkdirSync(join(src, "opencode", "rules"), { recursive: true });

    writeFileSync(join(src, "opencode", "command", "hello.md"), "# hello\n");
    writeFileSync(join(src, "opencode", "agent", "planner.md"), "# planner\n");
    writeFileSync(join(src, "opencode", "hooks", "pre-commit.sh"), "echo hi\n");
    writeFileSync(join(src, "opencode", "rules", "style.md"), "# style\n");

    await emitOpenCode({
      repoRoot,
      assets: [
        {
          id: "core/command:hello",
          kind: "command",
          fileName: "hello.md",
          srcPath: join(src, "opencode", "command", "hello.md"),
        },
        {
          id: "core/agent:planner",
          kind: "agent",
          fileName: "planner.md",
          srcPath: join(src, "opencode", "agent", "planner.md"),
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
    expect(readFileSync(join(repoRoot, ".opencode", "command", "hello.md"), "utf8")).toContain("hello");
    expect(readFileSync(join(repoRoot, ".opencode", "agent", "planner.md"), "utf8")).toContain("planner");
    expect(readFileSync(join(repoRoot, ".opencode", "hooks", "pre-commit.sh"), "utf8")).toContain("echo hi");
    expect(readFileSync(join(repoRoot, ".opencode", "rules", "style.md"), "utf8")).toContain("style");
  });

  it("writes native opencode skills and opencode MCP config", async () => {
    const repoRoot = mkdtempSync(join(tmpdir(), "nexus-repo-"));
    const skillSrc = mkdtempSync(join(tmpdir(), "nexus-skill-"));
    mkdirSync(join(skillSrc, "humanizer"), { recursive: true });
    writeFileSync(join(skillSrc, "humanizer", "SKILL.md"), "---\nname: humanizer\ndescription: x\n---\n");

    await emitOpenCode({
      repoRoot,
      skills: [
        {
          id: "core:humanizer",
          itemId: "humanizer",
          srcDir: join(skillSrc, "humanizer"),
        },
      ],
      mcpServers: [
        {
          id: "core/mcp:filesystem",
          name: "filesystem",
          server: {
            command: "npx",
            args: ["-y", "@modelcontextprotocol/server-filesystem", "/home"],
          },
        },
      ],
    });

    expect(existsSync(join(repoRoot, ".opencode", "skills", "humanizer", "SKILL.md"))).toBeTrue();

    const cfg = JSON.parse(readFileSync(join(repoRoot, "opencode.json"), "utf8"));
    expect(cfg.mcp.filesystem.type).toBe("local");
    expect(cfg.mcp.filesystem.command).toEqual(["npx", "-y", "@modelcontextprotocol/server-filesystem", "/home"]);
    expect(cfg.mcp.filesystem.enabled).toBeTrue();
  });
});
