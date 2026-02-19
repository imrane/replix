import { test, expect } from "bun:test";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { validateShapeSnapshot } from "../src/clientPlugins/shapeProvenance";

function makeSnapshot(overrides: Record<string, unknown> = {}): string {
  return JSON.stringify({
    client: "test-client",
    capturedAt: new Date().toISOString(),
    versionNote: "test snapshot",
    sources: ["https://example.com/docs"],
    ...overrides,
  });
}

function daysAgoISO(days: number): string {
  return new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();
}

test("shapeProvenance > fresh snapshot is ok with no warnings", async () => {
  const dir = mkdtempSync(join(tmpdir(), "replix-shape-"));
  const path = join(dir, "snap.json");
  writeFileSync(path, makeSnapshot({ capturedAt: daysAgoISO(5) }));
  try {
    const result = await validateShapeSnapshot(path, 30);
    expect(result.ok).toBe(true);
    expect(result.errors).toEqual([]);
    expect(result.warnings).toEqual([]);
    expect(result.checklist).toBeNull();
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("shapeProvenance > snapshot in warning zone emits warning + checklist", async () => {
  const dir = mkdtempSync(join(tmpdir(), "replix-shape-warn-"));
  const path = join(dir, "snap.json");
  writeFileSync(path, makeSnapshot({ capturedAt: daysAgoISO(25) }));
  try {
    const result = await validateShapeSnapshot(path, 30);
    expect(result.ok).toBe(true);
    expect(result.warnings.length).toBeGreaterThan(0);
    expect(result.warnings[0]).toContain("approaching expiry");
    expect(result.checklist).not.toBeNull();
    expect(result.checklist!.dueForRefresh).toBe(true);
    expect(result.checklist!.sources).toContain("https://example.com/docs");
    expect(result.checklist!.steps.length).toBeGreaterThan(0);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("shapeProvenance > expired snapshot has error + checklist", async () => {
  const dir = mkdtempSync(join(tmpdir(), "replix-shape-expired-"));
  const path = join(dir, "snap.json");
  writeFileSync(path, makeSnapshot({ capturedAt: daysAgoISO(45) }));
  try {
    const result = await validateShapeSnapshot(path, 30);
    expect(result.ok).toBe(false);
    expect(result.errors.some((e) => e.includes("snapshot too old"))).toBe(true);
    expect(result.checklist).not.toBeNull();
    expect(result.checklist!.dueForRefresh).toBe(true);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("shapeProvenance > missing client field is an error", async () => {
  const dir = mkdtempSync(join(tmpdir(), "replix-shape-bad-"));
  const path = join(dir, "snap.json");
  writeFileSync(path, makeSnapshot({ client: undefined }));
  try {
    const result = await validateShapeSnapshot(path, 30);
    expect(result.ok).toBe(false);
    expect(result.errors).toContain("missing client");
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("shapeProvenance > invalid source url is an error", async () => {
  const dir = mkdtempSync(join(tmpdir(), "replix-shape-url-"));
  const path = join(dir, "snap.json");
  writeFileSync(path, makeSnapshot({ sources: ["not-a-url"] }));
  try {
    const result = await validateShapeSnapshot(path, 30);
    expect(result.ok).toBe(false);
    expect(result.errors.some((e) => e.includes("invalid source url"))).toBe(true);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("shapeProvenance > checklist steps include source URLs and actionable instructions", async () => {
  const dir = mkdtempSync(join(tmpdir(), "replix-shape-steps-"));
  const path = join(dir, "snap.json");
  writeFileSync(path, makeSnapshot({ capturedAt: daysAgoISO(22), sources: ["https://example.com/docs"] }));
  try {
    const result = await validateShapeSnapshot(path, 30);
    expect(result.checklist).not.toBeNull();
    const steps = result.checklist!.steps.join("\n");
    expect(steps).toContain("https://example.com/docs");
    expect(steps).toContain("capturedAt");
    expect(steps).toContain("replix spec validate-client-shapes");
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
