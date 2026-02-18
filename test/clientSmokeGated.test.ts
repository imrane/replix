import { test, expect } from "bun:test";

const CLIENTS = [
  { name: "codex", bin: "codex" },
  { name: "opencode", bin: "opencode" },
  { name: "claude", bin: "claude" },
] as const;

function hasBin(bin: string): boolean {
  return Boolean(Bun.which(bin));
}

test("client smoke (gated) > runs only when REPLIX_CLIENT_SMOKE=1", () => {
  if (process.env.REPLIX_CLIENT_SMOKE !== "1") {
    console.log("⏭️  client smoke skipped (set REPLIX_CLIENT_SMOKE=1 to enable)");
    expect(true).toBe(true);
    return;
  }

  const unsupported: string[] = [];

  for (const client of CLIENTS) {
    if (!hasBin(client.bin)) {
      unsupported.push(client.name);
      console.log(`⏭️  ${client.name} skipped (binary not installed)`);
      continue;
    }

    // Presence-only smoke for now; auth/runtime checks are covered by manual gated runs.
    expect(hasBin(client.bin)).toBe(true);
  }

  if (unsupported.length === CLIENTS.length) {
    console.log("⏭️  no supported clients available; smoke run completed with skips");
  }
}, 20000);
