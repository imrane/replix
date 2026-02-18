import { expect, test } from "bun:test";
import { detectKnownInputFormat, deterministicDraftFromKnownFormat } from "../src/formatAdapters";

test("format adapters > detects claude markdown", () => {
  const format = detectKnownInputFormat({
    sourceId: ".claude/commands/review.md",
    content: `---\nname: review\n---\n# Review\nDo X`,
  });
  expect(format).toBe("claude-markdown");

  const out = deterministicDraftFromKnownFormat({
    sourceId: ".claude/commands/review.md",
    content: `---\nname: review\n---\n# Review\nDo X`,
  });
  expect(out?.draft.kind).toBe("docs");
  expect(out?.confidence).toBe("high");
});

test("format adapters > detects codex toml", () => {
  const format = detectKnownInputFormat({
    sourceId: ".codex/config.toml",
    content: `[profile.default]\nmodel = \"gpt\"\n`,
  });
  expect(format).toBe("codex-toml");

  const out = deterministicDraftFromKnownFormat({
    sourceId: ".codex/config.toml",
    content: `[profile.default]\nmodel = \"gpt\"\n`,
  });
  expect(out?.draft.kind).toBe("manifest");
});

test("format adapters > detects opencode json", () => {
  const format = detectKnownInputFormat({
    sourceId: ".opencode/mcp-servers.json",
    content: `{\n  \"mcpServers\": {\n    \"test\": {\n      \"command\": \"node\"\n    }\n  }\n}`,
  });
  expect(format).toBe("opencode-json");

  const out = deterministicDraftFromKnownFormat({
    sourceId: ".opencode/mcp-servers.json",
    content: `{\"mcpServers\":{\"test\":{\"command\":\"node\"}}}`,
  });
  expect(out?.draft.kind).toBe("manifest");
});

test("format adapters > unknown input returns null", () => {
  const format = detectKnownInputFormat({ sourceId: "notes.txt", content: "random text" });
  expect(format).toBe("unknown");

  const out = deterministicDraftFromKnownFormat({ sourceId: "notes.txt", content: "random text" });
  expect(out).toBeNull();
});
