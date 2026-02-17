import { cp, mkdir, readFile, rm, stat, writeFile, chmod } from "node:fs/promises";
import { dirname, join } from "node:path";
import type { EmitPlan, ClientFileInjection } from "./plan";
import { getOutputPlugin } from "../outputPlugins/registry";
import { cleanupFull, cleanupOwnedOnly } from "../cleanup";
import { resolveDotfilesSourceToPath } from "../resolver/sourceResolver";
import {
  validateArtifactFromFile,
  logValidationResults,
  hasHardErrors,
  inferArtifactType,
  type ArtifactValidationInput,
  type ArtifactValidationResult,
} from "./metadataValidation";

const CUSTOM_FILES_MANIFEST = join(".replix", "custom-files-owned.json");

async function readCustomFilesManifest(repoRoot: string): Promise<string[]> {
  try {
    const raw = await readFile(join(repoRoot, CUSTOM_FILES_MANIFEST), "utf8");
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed?.paths) ? parsed.paths.filter((p) => typeof p === "string") : [];
  } catch {
    return [];
  }
}

async function writeCustomFilesManifest(repoRoot: string, relPaths: string[]): Promise<void> {
  const out = join(repoRoot, CUSTOM_FILES_MANIFEST);
  await mkdir(dirname(out), { recursive: true });
  await writeFile(out, JSON.stringify({ paths: [...new Set(relPaths)].sort() }, null, 2) + "\n", "utf8");
}

async function cleanupStaleCustomFiles(repoRoot: string, desiredRelPaths: string[]): Promise<void> {
  const prev = await readCustomFilesManifest(repoRoot);
  const desired = new Set(desiredRelPaths.map((p) => p.replace(/^\/+/, "")));
  for (const rel of prev) {
    const normalized = rel.replace(/^\/+/, "");
    if (desired.has(normalized)) continue;
    await rm(join(repoRoot, normalized), { recursive: true, force: true });
  }
}

async function sourcePathFromDotfiles(source: string, allowUnpinned?: boolean): Promise<string> {
  return resolveDotfilesSourceToPath(source, { allowUnpinned });
}

async function emitClientFile(repoRoot: string, inj: ClientFileInjection): Promise<void> {
  const outPath = join(repoRoot, inj.relPath);
  await mkdir(dirname(outPath), { recursive: true });

  if (typeof inj.def.text === "string") {
    await writeFile(outPath, inj.def.text, "utf8");
  } else if (typeof inj.def.source === "string") {
    const srcPath = await sourcePathFromDotfiles(inj.def.source, inj.def.allowUnpinned);
    const srcStat = await stat(srcPath);
    if (srcStat.isDirectory()) {
      await rm(outPath, { recursive: true, force: true });
      await mkdir(outPath, { recursive: true });
      await cp(srcPath, outPath, { recursive: true, force: true });
    } else {
      await cp(srcPath, outPath, { force: true });
    }
  } else {
    throw new Error(`client file ${inj.client}:${inj.relPath} must define one of text|source`);
  }

  if (inj.def.mode) {
    await chmod(outPath, Number.parseInt(inj.def.mode, 8));
  } else if (inj.def.executable) {
    await chmod(outPath, 0o755);
  }
}

export async function emitPlan(plan: EmitPlan): Promise<void> {
  const { emitRoot, cleanupMode, clients, claudeSkills, mcpServers, openCodeAssets, clientFileInjections } = plan;

  const desiredPaths = [
    ...(clients.includes("claude") ? getOutputPlugin("claude").desiredPaths({ repoRoot: emitRoot, claudeSkills }) : []),
    ...getOutputPlugin("mcp").desiredPaths({ repoRoot: emitRoot, mcpServers }),
    ...(clients.includes("opencode")
      ? getOutputPlugin("opencode").desiredPaths({ repoRoot: emitRoot, claudeSkills, mcpServers, openCodeAssets })
      : []),
    ...(clients.includes("codex")
      ? getOutputPlugin("codex").desiredPaths({
          repoRoot: emitRoot,
          codexConfigToml: "# replix-managed\n",
          claudeSkills,
          mcpServers,
        })
      : []),
    ...clientFileInjections.map((inj) => join(emitRoot, inj.relPath)),
  ];

  if (cleanupMode === "full") {
    await cleanupFull(emitRoot);
  } else {
    await cleanupOwnedOnly({ repoRoot: emitRoot, desiredPaths });
    await cleanupStaleCustomFiles(emitRoot, clientFileInjections.map((inj) => inj.relPath));
  }

  if (clients.includes("claude")) {
    await getOutputPlugin("claude").emit({ repoRoot: emitRoot, claudeSkills });
  }

  await getOutputPlugin("mcp").emit({ repoRoot: emitRoot, mcpServers });

  if (clients.includes("opencode")) {
    await getOutputPlugin("opencode").emit({ repoRoot: emitRoot, claudeSkills, mcpServers, openCodeAssets });
  }

  if (clients.includes("codex")) {
    await getOutputPlugin("codex").emit({
      repoRoot: emitRoot,
      codexConfigToml: "# replix-managed\n",
      claudeSkills,
      mcpServers,
    });
  }

  for (const inj of clientFileInjections) {
    await emitClientFile(emitRoot, inj);
  }

  if (clientFileInjections.length > 0) {
    await writeCustomFilesManifest(emitRoot, clientFileInjections.map((inj) => inj.relPath));
  }

  // Validate artifact metadata for client files
  const validationInputs: ArtifactValidationInput[] = [];
  for (const inj of clientFileInjections) {
    const artifactType = inferArtifactType(inj.relPath);
    if (artifactType) {
      validationInputs.push({
        client: inj.client,
        artifactType,
        artifactPath: join(emitRoot, inj.relPath),
      });
    }
  }

  if (validationInputs.length > 0) {
    const validationResults: ArtifactValidationResult[] = await Promise.all(
      validationInputs.map((input) => validateArtifactFromFile(input))
    );

    logValidationResults(validationResults);

    if (hasHardErrors(validationResults)) {
      throw new Error("Artifact metadata validation failed with hard errors");
    }
  }
}
