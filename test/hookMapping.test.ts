import { test, expect } from "bun:test";
import { mapCanonicalHookEvent } from "../src/clientPlugins/canonical/hookMapping";

test("hook mapping > claude maps before_tool to PreToolUse", () => {
  const out = mapCanonicalHookEvent("claude", "before_tool");
  expect(out.supported).toBe(true);
  expect(out.clientEvent).toBe("PreToolUse");
  expect(out.severity).toBe("none");
});

test("hook mapping > opencode returns warn for unsupported event", () => {
  const out = mapCanonicalHookEvent("opencode", "before_tool");
  expect(out.supported).toBe(false);
  expect(out.severity).toBe("warn");
});

test("hook mapping > codex partially maps session end to notify", () => {
  const out = mapCanonicalHookEvent("codex", "on_session_end");
  expect(out.supported).toBe(true);
  expect(out.clientEvent).toBe("notify");
});
