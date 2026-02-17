import { test, expect } from "bun:test";

const CLIENTS = [
  { name: "codex", bin: "codex" },
  { name: "opencode", bin: "opencode" },
  { name: "claude", bin: "claude" },
] as const;

function hasBin(bin: string): boolean {
  const p = Bun.spawnSync({ cmd: ["bash", "-lc", `command -v ${bin}`], stdout: "ignore", stderr: "ignore" });
  return p.exitCode === 0;
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

    const p = Bun.spawnSync({ cmd: [client.bin, "--help"], stdout: "pipe", stderr: "pipe" });
    const combined = `${new TextDecoder().decode(p.stdout)}\n${new TextDecoder().decode(p.stderr)}`;

    expect(p.exitCode).toBe(0);
    expect(combined.length).toBeGreaterThan(0);
  }

  if (unsupported.length === CLIENTS.length) {
    console.log("⏭️  no supported clients available; smoke run completed with skips");
  }
});
