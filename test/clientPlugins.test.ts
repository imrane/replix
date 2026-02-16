import { describe, expect, test } from "bun:test";
import "../src/clientPlugins/builtins";
import { applyClientPathNormalization, assertClientPathSupported, registerClientFilePlugin } from "../src/clientPlugins/registry";

describe("client file plugins", () => {
  test("supports built-in opencode normalization", () => {
    expect(applyClientPathNormalization("opencode", ".opencode/commands/foo.md")).toBe(".opencode/command/foo.md");
  });

  test("supports external plugin registration", () => {
    registerClientFilePlugin({
      client: "acme",
      normalizePath: ({ relPath }) => relPath.replace(/^\/+/, "").replace("acme/", "acme-v2/"),
      assertSupportedPath: ({ relPath }) => {
        if (!relPath.startsWith("acme-v2/")) {
          throw new Error(`unsupported acme path: ${relPath}`);
        }
      },
    });

    const normalized = applyClientPathNormalization("acme", "/acme/tool.json");
    expect(normalized).toBe("acme-v2/tool.json");
    expect(() => assertClientPathSupported("acme", normalized)).not.toThrow();
    expect(() => assertClientPathSupported("acme", "legacy/tool.json")).toThrow("unsupported acme path");
  });
});
