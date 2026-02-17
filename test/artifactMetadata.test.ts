import { describe, test, expect } from "bun:test";
import {
  validateArtifactMetadata,
  clientSupportsArtifactType,
  getSupportedFields,
  type ArtifactMetadata,
} from "../src/artifactMetadata";

describe("artifactMetadata", () => {
  // Test (a): claude hook trigger accepted
  test("claude accepts valid hook trigger", () => {
    const metadata: ArtifactMetadata = {
      hook: {
        trigger: "pre-commit",
        description: "Run linter before commit",
        blocking: true,
      },
    };

    const result = validateArtifactMetadata({
      client: "claude",
      artifactType: "hook",
      metadata,
      artifactPath: ".claude/hooks/lint.sh",
    });

    expect(result.valid).toBe(true);
    expect(result.issues).toHaveLength(0);
  });

  test("claude accepts all standard hook triggers", () => {
    const triggers = ["pre-commit", "pre-push", "post-checkout", "pre-rebase", "post-merge", "commit-msg"];

    for (const trigger of triggers) {
      const metadata: ArtifactMetadata = {
        hook: { trigger: trigger as any },
      };

      const result = validateArtifactMetadata({
        client: "claude",
        artifactType: "hook",
        metadata,
        artifactPath: `.claude/hooks/${trigger}.sh`,
      });

      expect(result.valid).toBe(true);
      expect(result.issues).toHaveLength(0);
    }
  });

  // Test (b): unsupported trigger for codex produces warning/error path
  test("codex produces warning for hook artifact type", () => {
    const metadata: ArtifactMetadata = {
      hook: {
        trigger: "pre-commit",
        description: "Test hook",
      },
    };

    const result = validateArtifactMetadata({
      client: "codex",
      artifactType: "hook",
      metadata,
      artifactPath: ".codex/hooks/test.sh",
    });

    // Should have warning about unsupported artifact type
    expect(result.issues.length).toBeGreaterThan(0);
    const typeWarning = result.issues.find((i) => i.message.includes("does not support artifact type"));
    expect(typeWarning).toBeDefined();
    expect(typeWarning?.severity).toBe("warning");
  });

  test("codex produces error for unsupported hook trigger", () => {
    const metadata: ArtifactMetadata = {
      hook: {
        trigger: "pre-commit",
      },
    };

    const result = validateArtifactMetadata({
      client: "codex",
      artifactType: "hook",
      metadata,
      artifactPath: ".codex/hooks/test.sh",
    });

    // Even though codex doesn't support hooks, if trigger is checked it should fail
    // Since codex has no supported triggers, any trigger should produce an error or warning
    expect(result.issues.length).toBeGreaterThan(0);
  });

  test("opencode produces error for unsupported hook trigger", () => {
    const metadata: ArtifactMetadata = {
      hook: {
        trigger: "pre-commit",
      },
    };

    const result = validateArtifactMetadata({
      client: "opencode",
      artifactType: "hook",
      metadata,
      artifactPath: ".opencode/hooks/test.sh",
    });

    // OpenCode doesn't support hooks at all
    expect(result.issues.length).toBeGreaterThan(0);
    const issue = result.issues.find((i) => i.message.includes("does not support"));
    expect(issue).toBeDefined();
  });

  // Test (c): command metadata field mapping check
  test("claude accepts all command metadata fields", () => {
    const metadata: ArtifactMetadata = {
      command: {
        description: "Review code changes",
        aliases: ["rev", "check"],
        requiresConfirmation: true,
      },
    };

    const result = validateArtifactMetadata({
      client: "claude",
      artifactType: "command",
      metadata,
      artifactPath: ".claude/commands/review.md",
    });

    expect(result.valid).toBe(true);
    expect(result.issues).toHaveLength(0);
  });

  test("opencode warns about unsupported command field", () => {
    const metadata: ArtifactMetadata = {
      command: {
        description: "Review code changes",
        aliases: ["rev"],
        requiresConfirmation: true, // OpenCode doesn't support this
      },
    };

    const result = validateArtifactMetadata({
      client: "opencode",
      artifactType: "command",
      metadata,
      artifactPath: ".opencode/command/review.md",
    });

    // Should have warning about requiresConfirmation
    const warning = result.issues.find((i) => i.field === "requiresConfirmation");
    expect(warning).toBeDefined();
    expect(warning?.severity).toBe("warning");
    expect(warning?.message).toContain("does not support");

    // Should still be valid (warnings don't fail)
    expect(result.valid).toBe(true);
  });

  test("codex warns about command artifact type", () => {
    const metadata: ArtifactMetadata = {
      command: {
        description: "Test command",
      },
    };

    const result = validateArtifactMetadata({
      client: "codex",
      artifactType: "command",
      metadata,
      artifactPath: ".codex/commands/test.md",
    });

    // Codex doesn't support command artifact type
    const warning = result.issues.find((i) => i.message.includes("does not support artifact type"));
    expect(warning).toBeDefined();
    expect(warning?.severity).toBe("warning");
  });

  test("agent metadata field mapping", () => {
    const metadata: ArtifactMetadata = {
      agent: {
        description: "Security audit agent",
        model: "claude-3.5-sonnet",
        temperature: 0.7,
        maxTokens: 4096,
      },
    };

    const claudeResult = validateArtifactMetadata({
      client: "claude",
      artifactType: "agent",
      metadata,
      artifactPath: ".claude/agents/security.md",
    });

    expect(claudeResult.valid).toBe(true);
    expect(claudeResult.issues).toHaveLength(0);

    const opencodeResult = validateArtifactMetadata({
      client: "opencode",
      artifactType: "agent",
      metadata,
      artifactPath: ".opencode/agent/security.md",
    });

    // OpenCode only supports description and model
    const tempWarning = opencodeResult.issues.find((i) => i.field === "temperature");
    const tokensWarning = opencodeResult.issues.find((i) => i.field === "maxTokens");
    expect(tempWarning).toBeDefined();
    expect(tokensWarning).toBeDefined();
    expect(opencodeResult.valid).toBe(true); // Warnings don't fail validation
  });

  test("clientSupportsArtifactType helper", () => {
    expect(clientSupportsArtifactType("claude", "hook")).toBe(true);
    expect(clientSupportsArtifactType("claude", "command")).toBe(true);
    expect(clientSupportsArtifactType("opencode", "hook")).toBe(false);
    expect(clientSupportsArtifactType("opencode", "command")).toBe(true);
    expect(clientSupportsArtifactType("codex", "command")).toBe(false);
    expect(clientSupportsArtifactType("unknown", "command")).toBe(false);
  });

  test("getSupportedFields helper", () => {
    const claudeCommandFields = getSupportedFields("claude", "command");
    expect(claudeCommandFields).toBeDefined();
    expect(claudeCommandFields?.has("description")).toBe(true);
    expect(claudeCommandFields?.has("aliases")).toBe(true);
    expect(claudeCommandFields?.has("requiresConfirmation")).toBe(true);

    const opencodeCommandFields = getSupportedFields("opencode", "command");
    expect(opencodeCommandFields).toBeDefined();
    expect(opencodeCommandFields?.has("description")).toBe(true);
    expect(opencodeCommandFields?.has("aliases")).toBe(true);
    expect(opencodeCommandFields?.has("requiresConfirmation")).toBe(false);

    const codexCommandFields = getSupportedFields("codex", "command");
    expect(codexCommandFields).toBeUndefined();
  });

  test("validation with empty metadata", () => {
    const metadata: ArtifactMetadata = {
      command: {},
    };

    const result = validateArtifactMetadata({
      client: "claude",
      artifactType: "command",
      metadata,
      artifactPath: ".claude/commands/test.md",
    });

    expect(result.valid).toBe(true);
    expect(result.issues).toHaveLength(0);
  });

  test("validation with unknown client produces error", () => {
    const metadata: ArtifactMetadata = {
      command: {
        description: "Test",
      },
    };

    const result = validateArtifactMetadata({
      client: "unknown-client",
      artifactType: "command",
      metadata,
      artifactPath: "test.md",
    });

    expect(result.valid).toBe(false);
    const error = result.issues.find((i) => i.severity === "error");
    expect(error).toBeDefined();
    expect(error?.message).toContain("Unknown client");
  });

  test("settings metadata validation", () => {
    const metadata: ArtifactMetadata = {
      settings: {
        scope: "global",
        description: "Global settings",
      },
    };

    const claudeResult = validateArtifactMetadata({
      client: "claude",
      artifactType: "settings",
      metadata,
      artifactPath: ".claude/settings.json",
    });

    expect(claudeResult.valid).toBe(true);
    expect(claudeResult.issues).toHaveLength(0);

    // OpenCode doesn't support settings
    const opencodeResult = validateArtifactMetadata({
      client: "opencode",
      artifactType: "settings",
      metadata,
      artifactPath: ".opencode/settings.json",
    });

    expect(opencodeResult.issues.length).toBeGreaterThan(0);
    const warning = opencodeResult.issues.find((i) => i.message.includes("does not support artifact type"));
    expect(warning).toBeDefined();
  });
});
