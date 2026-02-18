import { test, expect } from "bun:test";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { classifyImportInput } from "../src/importClassifier";

test("import classifier > detects manifest URL", () => {
  const out = classifyImportInput("https://example.com/replix.index.json");
  expect(out.kind).toBe("manifest");
});

test("import classifier > detects docs URL", () => {
  const out = classifyImportInput("https://opencode.ai/docs/config");
  expect(out.kind).toBe("docs");
});

test("import classifier > detects article URL", () => {
  const out = classifyImportInput("https://blog.example.com/how-to-build-agent-skills");
  expect(out.kind).toBe("article");
});

test("import classifier > detects repo source string", () => {
  const out = classifyImportInput("github:acme/skills?rev=abc123");
  expect(out.kind).toBe("repo");
});

test("import classifier > detects local manifest path", () => {
  const root = mkdtempSync(join(tmpdir(), "replix-classifier-manifest-"));
  try {
    const pack = join(root, "pack");
    mkdirSync(pack, { recursive: true });
    writeFileSync(join(pack, "pack.json"), JSON.stringify({ id: "x", version: "0.1.0" }));
    const out = classifyImportInput(pack);
    expect(out.kind).toBe("manifest");
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("import classifier > detects local repo path", () => {
  const root = mkdtempSync(join(tmpdir(), "replix-classifier-repo-"));
  try {
    const repo = join(root, "repo");
    mkdirSync(join(repo, ".git"), { recursive: true });
    const out = classifyImportInput(repo);
    expect(out.kind).toBe("repo");
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("import classifier > unknown fallback", () => {
  const out = classifyImportInput("just some random text from chat");
  expect(out.kind).toBe("unknown");
});
