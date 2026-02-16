import { registerClientFilePlugin } from "./registry";

const codexSupported = (file: string): boolean => {
  return file === ".codex/config.toml" || file.startsWith(".agents/skills/") || file.startsWith(".codex/skills/");
};

registerClientFilePlugin({
  client: "opencode",
  normalizePath: ({ relPath }) => {
    const normalized = relPath.replace(/^\/+/, "");
    if (normalized === ".opencode/commands") return ".opencode/command";
    if (normalized.startsWith(".opencode/commands/")) {
      return normalized.replace(".opencode/commands/", ".opencode/command/");
    }
    if (normalized === ".opencode/agents") return ".opencode/agent";
    if (normalized.startsWith(".opencode/agents/")) {
      return normalized.replace(".opencode/agents/", ".opencode/agent/");
    }
    return normalized;
  },
});

registerClientFilePlugin({
  client: "codex",
  assertSupportedPath: ({ relPath }) => {
    if (!codexSupported(relPath)) {
      throw new Error(
        `unsupported codex repo file path: ${relPath} (supported: .codex/config.toml, .agents/skills/**, .codex/skills/**; user-global/cloud surfaces are out of scope)`,
      );
    }
  },
});
