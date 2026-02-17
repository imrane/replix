// Canonical artifact metadata schema types
// Foundation for AI-assisted artifact compilation with client capability validation

export type HookTrigger =
  | "pre-commit"
  | "pre-push"
  | "post-checkout"
  | "pre-rebase"
  | "post-merge"
  | "commit-msg";

export type ArtifactMetadata = {
  agent?: {
    description?: string;
    model?: string;
    temperature?: number;
    maxTokens?: number;
  };
  command?: {
    description?: string;
    aliases?: string[];
    requiresConfirmation?: boolean;
  };
  hook?: {
    trigger: HookTrigger;
    description?: string;
    blocking?: boolean;
  };
  settings?: {
    scope?: "global" | "local";
    description?: string;
  };
};

// Client capability declarations
export type ClientCapabilities = {
  supportedArtifactTypes: Set<string>;
  supportedMetadataFields: {
    agent?: Set<string>;
    command?: Set<string>;
    hook?: Set<string>;
    settings?: Set<string>;
  };
  supportedHookTriggers?: Set<HookTrigger>;
};

const CLAUDE_CAPABILITIES: ClientCapabilities = {
  supportedArtifactTypes: new Set(["agent", "command", "hook", "settings"]),
  supportedMetadataFields: {
    agent: new Set(["description", "model", "temperature", "maxTokens"]),
    command: new Set(["description", "aliases", "requiresConfirmation"]),
    hook: new Set(["trigger", "description", "blocking"]),
    settings: new Set(["scope", "description"]),
  },
  supportedHookTriggers: new Set([
    "pre-commit",
    "pre-push",
    "post-checkout",
    "pre-rebase",
    "post-merge",
    "commit-msg",
  ]),
};

const OPENCODE_CAPABILITIES: ClientCapabilities = {
  supportedArtifactTypes: new Set(["agent", "command"]),
  supportedMetadataFields: {
    agent: new Set(["description", "model"]),
    command: new Set(["description", "aliases"]),
  },
  supportedHookTriggers: new Set([]), // No hook support in OpenCode
};

const CODEX_CAPABILITIES: ClientCapabilities = {
  supportedArtifactTypes: new Set([]), // Codex scope is MCP/skills only
  supportedMetadataFields: {},
  supportedHookTriggers: new Set([]),
};

export const CLIENT_CAPABILITIES: Record<string, ClientCapabilities> = {
  claude: CLAUDE_CAPABILITIES,
  opencode: OPENCODE_CAPABILITIES,
  codex: CODEX_CAPABILITIES,
};

// Validation result types
export type ValidationIssue = {
  severity: "error" | "warning";
  message: string;
  path: string;
  field?: string;
};

export type ValidationResult = {
  valid: boolean;
  issues: ValidationIssue[];
};

// Deterministic validator
export function validateArtifactMetadata(params: {
  client: string;
  artifactType: keyof ArtifactMetadata;
  metadata: ArtifactMetadata;
  artifactPath: string;
}): ValidationResult {
  const { client, artifactType, metadata, artifactPath } = params;
  const issues: ValidationIssue[] = [];

  const capabilities = CLIENT_CAPABILITIES[client];
  if (!capabilities) {
    issues.push({
      severity: "error",
      message: `Unknown client: ${client}`,
      path: artifactPath,
    });
    return { valid: false, issues };
  }

  // Check if artifact type is supported by client
  if (!capabilities.supportedArtifactTypes.has(artifactType)) {
    issues.push({
      severity: "warning",
      message: `Client ${client} does not support artifact type: ${artifactType}`,
      path: artifactPath,
    });
  }

  const artifactMetadata = metadata[artifactType];
  if (!artifactMetadata) {
    return { valid: true, issues }; // No metadata to validate
  }

  const supportedFields = capabilities.supportedMetadataFields[artifactType];
  if (!supportedFields) {
    // Client doesn't support this artifact type
    if (Object.keys(artifactMetadata).length > 0) {
      issues.push({
        severity: "warning",
        message: `Client ${client} does not support ${artifactType} metadata fields`,
        path: artifactPath,
      });
    }
    return { valid: issues.every((i) => i.severity !== "error"), issues };
  }

  // Check each metadata field
  for (const [field, value] of Object.entries(artifactMetadata)) {
    if (!supportedFields.has(field)) {
      issues.push({
        severity: "warning",
        message: `Client ${client} does not support ${artifactType}.${field}`,
        path: artifactPath,
        field,
      });
    }
  }

  // Special validation for hook triggers
  if (artifactType === "hook" && "trigger" in artifactMetadata) {
    const trigger = (artifactMetadata as any).trigger as HookTrigger;
    if (capabilities.supportedHookTriggers && !capabilities.supportedHookTriggers.has(trigger)) {
      issues.push({
        severity: "error",
        message: `Client ${client} does not support hook trigger: ${trigger}`,
        path: artifactPath,
        field: "trigger",
      });
    }
  }

  const valid = issues.every((i) => i.severity !== "error");
  return { valid, issues };
}

// Helper to check if a client supports a specific artifact type
export function clientSupportsArtifactType(client: string, artifactType: string): boolean {
  const capabilities = CLIENT_CAPABILITIES[client];
  return capabilities?.supportedArtifactTypes.has(artifactType) ?? false;
}

// Helper to get all supported fields for a client + artifact type
export function getSupportedFields(client: string, artifactType: keyof ArtifactMetadata): Set<string> | undefined {
  const capabilities = CLIENT_CAPABILITIES[client];
  return capabilities?.supportedMetadataFields[artifactType];
}
