export type CanonicalHookEvent =
  | "on_session_start"
  | "on_user_prompt"
  | "before_tool"
  | "after_tool_success"
  | "after_tool_failure"
  | "on_permission_request"
  | "on_agent_start"
  | "on_agent_stop"
  | "before_compact"
  | "on_session_end";

export type HookMappingResult = {
  supported: boolean;
  clientEvent?: string;
  severity: "none" | "warn" | "error";
  reason?: string;
};

const CLAUDE_MAP: Record<CanonicalHookEvent, string> = {
  on_session_start: "SessionStart",
  on_user_prompt: "UserPromptSubmit",
  before_tool: "PreToolUse",
  after_tool_success: "PostToolUse",
  after_tool_failure: "PostToolUseFailure",
  on_permission_request: "PermissionRequest",
  on_agent_start: "SubagentStart",
  on_agent_stop: "SubagentStop",
  before_compact: "PreCompact",
  on_session_end: "SessionEnd",
};

// OpenCode does not currently document a first-class hook event API equivalent.
const OPENCODE_UNSUPPORTED = new Set<CanonicalHookEvent>([
  "on_session_start",
  "on_user_prompt",
  "before_tool",
  "after_tool_success",
  "after_tool_failure",
  "on_permission_request",
  "on_agent_start",
  "on_agent_stop",
  "before_compact",
  "on_session_end",
]);

// Codex supports notify hook style but not full event surface parity.
const CODEX_PARTIAL: Partial<Record<CanonicalHookEvent, string>> = {
  on_session_end: "notify",
};

export function mapCanonicalHookEvent(client: string, event: CanonicalHookEvent): HookMappingResult {
  if (client === "claude") {
    return { supported: true, clientEvent: CLAUDE_MAP[event], severity: "none" };
  }

  if (client === "opencode") {
    if (OPENCODE_UNSUPPORTED.has(event)) {
      return {
        supported: false,
        severity: "warn",
        reason: "opencode hook event mapping not yet implemented",
      };
    }
  }

  if (client === "codex") {
    const mapped = CODEX_PARTIAL[event];
    if (mapped) return { supported: true, clientEvent: mapped, severity: "warn", reason: "codex partial hook parity" };
    return { supported: false, severity: "warn", reason: "codex does not support this canonical hook event" };
  }

  return { supported: false, severity: "error", reason: `unknown client: ${client}` };
}
