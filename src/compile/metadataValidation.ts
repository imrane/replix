// Emitter integration for artifact metadata validation
// Validates metadata during compile/emit for claude/opencode/codex clients

import { readFile } from "node:fs/promises";
import { join } from "node:path";
import {
  validateArtifactMetadata,
  type ArtifactMetadata,
  type ValidationResult,
} from "../artifactMetadata";
import { parseFrontmatter, type ParsedMetadata } from "../metadataParser";

export type ArtifactValidationInput = {
  client: string;
  artifactType: keyof ArtifactMetadata;
  artifactPath: string;
  metadata?: ArtifactMetadata; // Optional sidecar metadata
};

export type ArtifactValidationResult = {
  artifactPath: string;
  client: string;
  artifactType: string;
  result: ValidationResult;
};

/**
 * Validate artifact metadata from file or sidecar
 * Attempts to parse frontmatter from file if no sidecar metadata provided
 */
export async function validateArtifactFromFile(
  input: ArtifactValidationInput
): Promise<ArtifactValidationResult> {
  let metadata: ArtifactMetadata;

  if (input.metadata) {
    // Use sidecar metadata if provided
    metadata = input.metadata;
  } else {
    // Try to parse frontmatter from file
    try {
      const content = await readFile(input.artifactPath, "utf8");
      const parsed = parseFrontmatter(content);
      metadata = parsed ? (parsed as ArtifactMetadata) : {};
    } catch (err) {
      // File read error - treat as no metadata
      metadata = {};
    }
  }

  const result = validateArtifactMetadata({
    client: input.client,
    artifactType: input.artifactType,
    metadata,
    artifactPath: input.artifactPath,
  });

  return {
    artifactPath: input.artifactPath,
    client: input.client,
    artifactType: input.artifactType,
    result,
  };
}

/**
 * Log validation results deterministically
 * Warnings go to console.warn, errors go to console.error
 */
export function logValidationResults(results: ArtifactValidationResult[]): void {
  for (const { artifactPath, client, result } of results) {
    for (const issue of result.issues) {
      const prefix = `[replix:metadata:${client}] ${artifactPath}`;
      const message = `${prefix}: ${issue.message}${issue.field ? ` (field: ${issue.field})` : ""}`;
      
      if (issue.severity === "error") {
        console.error(message);
      } else {
        console.warn(message);
      }
    }
  }
}

/**
 * Check if validation results contain hard errors
 */
export function hasHardErrors(results: ArtifactValidationResult[]): boolean {
  return results.some(r => !r.result.valid);
}

/**
 * Validate client-specific artifacts from dotfiles injections
 */
export function inferArtifactType(relPath: string): keyof ArtifactMetadata | null {
  if (relPath.includes("/commands/") || relPath.includes("/command/")) {
    return "command";
  }
  if (relPath.includes("/hooks/")) {
    return "hook";
  }
  if (relPath.includes("/agents/") || relPath.includes("/agent/")) {
    return "agent";
  }
  if (relPath.includes("settings")) {
    return "settings";
  }
  return null;
}
