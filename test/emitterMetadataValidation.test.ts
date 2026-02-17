import { describe, test, expect, beforeEach, afterEach } from "bun:test";
import { mkdir, writeFile, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { emitPlan, type EmitPlan } from "../src/compile/emit";
import { validateArtifactFromFile, inferArtifactType, logValidationResults } from "../src/compile/metadataValidation";
import "../src/outputPlugins/builtins"; // Ensure plugins are registered

const testDir = join(tmpdir(), `replix-test-${Date.now()}`);

beforeEach(async () => {
  await mkdir(testDir, { recursive: true });
});

afterEach(async () => {
  await rm(testDir, { recursive: true, force: true });
});

describe("emitter metadata validation integration", () => {
  test("inferArtifactType correctly identifies artifact types", () => {
    expect(inferArtifactType(".claude/commands/review.md")).toBe("command");
    expect(inferArtifactType(".opencode/command/review.md")).toBe("command");
    expect(inferArtifactType(".claude/hooks/pre-commit.sh")).toBe("hook");
    expect(inferArtifactType(".claude/agents/security.md")).toBe("agent");
    expect(inferArtifactType(".opencode/agent/security.md")).toBe("agent");
    expect(inferArtifactType(".claude/settings.json")).toBe("settings");
    expect(inferArtifactType(".claude/settingsLocal.json")).toBe("settings");
    expect(inferArtifactType(".claude/skills/test/index.ts")).toBe(null);
  });

  test("validateArtifactFromFile parses frontmatter", async () => {
    const artifactPath = join(testDir, "test-command.md");
    const content = `---
command:
  description: Test command
  aliases: [test, t]
  requiresConfirmation: true
---
# Test Command
Content here`;

    await writeFile(artifactPath, content, "utf8");

    const result = await validateArtifactFromFile({
      client: "claude",
      artifactType: "command",
      artifactPath,
    });

    expect(result.result.valid).toBe(true);
    expect(result.result.issues).toHaveLength(0);
  });

  test("validateArtifactFromFile detects unsupported fields", async () => {
    const artifactPath = join(testDir, "test-command.md");
    const content = `---
command:
  description: Test command
  aliases: [test]
  requiresConfirmation: true
---
# Test Command`;

    await writeFile(artifactPath, content, "utf8");

    const result = await validateArtifactFromFile({
      client: "opencode",
      artifactType: "command",
      artifactPath,
    });

    expect(result.result.valid).toBe(true); // Warnings don't fail
    const warning = result.result.issues.find((i) => i.field === "requiresConfirmation");
    expect(warning).toBeDefined();
    expect(warning?.severity).toBe("warning");
    expect(warning?.message).toContain("does not support");
  });

  test("validateArtifactFromFile detects unsupported hook trigger", async () => {
    const artifactPath = join(testDir, "test-hook.sh");
    const content = `---
hook:
  trigger: pre-commit
  description: Test hook
  blocking: true
---
#!/bin/bash
echo "test"`;

    await writeFile(artifactPath, content, "utf8");

    const result = await validateArtifactFromFile({
      client: "opencode",
      artifactType: "hook",
      artifactPath,
    });

    // OpenCode doesn't support hooks
    expect(result.result.issues.length).toBeGreaterThan(0);
    const warning = result.result.issues.find((i) => i.message.includes("does not support artifact type"));
    expect(warning).toBeDefined();
  });

  test("validateArtifactFromFile handles missing frontmatter", async () => {
    const artifactPath = join(testDir, "test-command.md");
    const content = "# Test Command\nNo frontmatter here";

    await writeFile(artifactPath, content, "utf8");

    const result = await validateArtifactFromFile({
      client: "claude",
      artifactType: "command",
      artifactPath,
    });

    // Should succeed with no issues (no metadata to validate)
    expect(result.result.valid).toBe(true);
    expect(result.result.issues).toHaveLength(0);
  });

  test("validateArtifactFromFile accepts sidecar metadata", async () => {
    const artifactPath = join(testDir, "test-command.md");
    await writeFile(artifactPath, "# Test Command", "utf8");

    const result = await validateArtifactFromFile({
      client: "claude",
      artifactType: "command",
      artifactPath,
      metadata: {
        command: {
          description: "Test command",
          aliases: ["test", "t"],
          requiresConfirmation: true,
        },
      },
    });

    expect(result.result.valid).toBe(true);
    expect(result.result.issues).toHaveLength(0);
  });

  test("validateArtifactFromFile with sidecar detects unsupported fields", async () => {
    const artifactPath = join(testDir, "test-agent.md");
    await writeFile(artifactPath, "# Test Agent", "utf8");

    const result = await validateArtifactFromFile({
      client: "opencode",
      artifactType: "agent",
      artifactPath,
      metadata: {
        agent: {
          description: "Test agent",
          model: "claude-3.5-sonnet",
          temperature: 0.7, // Not supported by opencode
          maxTokens: 4096,  // Not supported by opencode
        },
      },
    });

    expect(result.result.valid).toBe(true); // Warnings don't fail
    expect(result.result.issues.length).toBeGreaterThan(0);
    
    const tempWarning = result.result.issues.find((i) => i.field === "temperature");
    const tokensWarning = result.result.issues.find((i) => i.field === "maxTokens");
    expect(tempWarning).toBeDefined();
    expect(tokensWarning).toBeDefined();
  });

  test("logValidationResults outputs deterministically", async () => {
    const artifactPath = join(testDir, "test-command.md");
    
    const results = [
      {
        artifactPath,
        client: "opencode",
        artifactType: "command",
        result: {
          valid: true,
          issues: [
            {
              severity: "warning" as const,
              message: "Client opencode does not support command.requiresConfirmation",
              path: artifactPath,
              field: "requiresConfirmation",
            },
          ],
        },
      },
    ];

    // Test that logValidationResults doesn't throw
    expect(() => logValidationResults(results)).not.toThrow();
  });

  test("emitPlan validates client file injections", async () => {
    const repoRoot = join(testDir, "repo");
    await mkdir(repoRoot, { recursive: true });

    const commandContent = `---
command:
  description: Review command
  aliases: [rev]
  requiresConfirmation: true
---
# Review Command`;

    const plan: EmitPlan = {
      repoRoot,
      emitRoot: repoRoot,
      layout: "direct",
      cleanupMode: "owned-only",
      clients: ["opencode"],
      claudeSkills: [],
      mcpServers: [],
      openCodeAssets: [],
      clientFileInjections: [
        {
          client: "opencode",
          relPath: ".opencode/command/review.md",
          def: {
            text: commandContent,
          },
        },
      ],
      enableSpec: {
        skills: [],
        mcp: [],
        commands: [],
        hooks: [],
        agents: [],
        settings: [],
        packs: [],
        clients: {},
      },
      stateHashInput: {
        packs: [],
        enable: {
          skills: [],
          mcp: [],
          commands: [],
          hooks: [],
          agents: [],
          settings: [],
          packs: [],
          clients: {},
        },
        clients: ["opencode"],
        layout: "direct",
      },
    };

    // Should not throw (warnings are logged but don't break emit)
    await expect(emitPlan(plan)).resolves.toBeUndefined();
  });

  test("emitPlan throws on hard validation errors for unknown client", async () => {
    const repoRoot = join(testDir, "repo-error");
    await mkdir(repoRoot, { recursive: true });

    const commandContent = `---
command:
  description: Test command
---
# Test Command`;

    const plan: EmitPlan = {
      repoRoot,
      emitRoot: repoRoot,
      layout: "direct",
      cleanupMode: "owned-only",
      clients: ["unknown-client" as any],
      claudeSkills: [],
      mcpServers: [],
      openCodeAssets: [],
      clientFileInjections: [
        {
          client: "unknown-client",
          relPath: ".unknown/commands/test.md",
          def: {
            text: commandContent,
          },
        },
      ],
      enableSpec: {
        skills: [],
        mcp: [],
        commands: [],
        hooks: [],
        agents: [],
        settings: [],
        packs: [],
        clients: {},
      },
      stateHashInput: {
        packs: [],
        enable: {
          skills: [],
          mcp: [],
          commands: [],
          hooks: [],
          agents: [],
          settings: [],
          packs: [],
          clients: {},
        },
        clients: ["unknown-client"],
        layout: "direct",
      },
    };

    // Should throw because unknown client is a hard error
    await expect(emitPlan(plan)).rejects.toThrow("metadata validation failed");
  });

  test("emitPlan logs warnings for unsupported artifact types without breaking", async () => {
    const repoRoot = join(testDir, "repo-warnings");
    await mkdir(repoRoot, { recursive: true });

    const hookContent = `---
hook:
  trigger: pre-commit
  description: Test hook
---
#!/bin/bash
echo "test"`;

    const plan: EmitPlan = {
      repoRoot,
      emitRoot: repoRoot,
      layout: "direct",
      cleanupMode: "owned-only",
      clients: ["codex"],
      claudeSkills: [],
      mcpServers: [],
      openCodeAssets: [],
      clientFileInjections: [
        {
          client: "codex",
          relPath: ".codex/hooks/pre-commit.sh",
          def: {
            text: hookContent,
          },
        },
      ],
      enableSpec: {
        skills: [],
        mcp: [],
        commands: [],
        hooks: [],
        agents: [],
        settings: [],
        packs: [],
        clients: {},
      },
      stateHashInput: {
        packs: [],
        enable: {
          skills: [],
          mcp: [],
          commands: [],
          hooks: [],
          agents: [],
          settings: [],
          packs: [],
          clients: {},
        },
        clients: ["codex"],
        layout: "direct",
      },
    };

    // Should not throw (warnings for unsupported artifact types don't break emit)
    await expect(emitPlan(plan)).resolves.toBeUndefined();
  });
});
