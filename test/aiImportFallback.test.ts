import { expect, test } from "bun:test";
import { runAiFallbackNormalizer } from "../src/importProviders/aiFallback";

test("ai fallback normalizer > returns null when command not configured", () => {
  const prev = process.env.REPLIX_IMPORT_AI_NORMALIZER_CMD;
  delete process.env.REPLIX_IMPORT_AI_NORMALIZER_CMD;
  try {
    const out = runAiFallbackNormalizer({
      item: { id: "x", title: "x", sourceUrl: "https://example.com/x" },
    });
    expect(out).toBeNull();
  } finally {
    if (prev) process.env.REPLIX_IMPORT_AI_NORMALIZER_CMD = prev;
  }
});

test("ai fallback normalizer > validates strict schema from command output", () => {
  const prev = process.env.REPLIX_IMPORT_AI_NORMALIZER_CMD;
  process.env.REPLIX_IMPORT_AI_NORMALIZER_CMD = `node -e "console.log(JSON.stringify({draft:{kind:'manifest',value:'https://example.com/pack.json'},confidence:'high'}))"`;

  try {
    const out = runAiFallbackNormalizer({
      item: { id: "x", title: "x", sourceUrl: "https://example.com/x" },
    });
    expect(out?.draft.kind).toBe("manifest");
    expect(out?.confidence).toBe("high");
  } finally {
    if (prev) process.env.REPLIX_IMPORT_AI_NORMALIZER_CMD = prev;
    else delete process.env.REPLIX_IMPORT_AI_NORMALIZER_CMD;
  }
});

test("ai fallback normalizer > throws on invalid output", () => {
  const prev = process.env.REPLIX_IMPORT_AI_NORMALIZER_CMD;
  process.env.REPLIX_IMPORT_AI_NORMALIZER_CMD = `node -e "console.log('not-json')"`;

  try {
    expect(() =>
      runAiFallbackNormalizer({
        item: { id: "x", title: "x", sourceUrl: "https://example.com/x" },
      }),
    ).toThrow("non-JSON");
  } finally {
    if (prev) process.env.REPLIX_IMPORT_AI_NORMALIZER_CMD = prev;
    else delete process.env.REPLIX_IMPORT_AI_NORMALIZER_CMD;
  }
});
