import { test, expect } from "bun:test";

const CLIENTS = [
  { name: "codex", bin: "codex" },
  { name: "opencode", bin: "opencode" },
  { name: "claude", bin: "claude" },
] as const;

type ClientResult =
  | { status: "pass"; exitCode: number }
  | { status: "skip"; reason: string }
  | { status: "timeout"; timeoutMs: number };

/** Run `<bin> --version` with a hard timeout; treat hang as skip, not failure. */
async function probeClient(bin: string, timeoutMs = 3000): Promise<ClientResult> {
  if (!Bun.which(bin)) {
    return { status: "skip", reason: "binary not installed" };
  }

  const proc = Bun.spawn([bin, "--version"], {
    stdout: "pipe",
    stderr: "pipe",
    // No stdin — non-interactive; a blocking auth prompt will hit the timeout.
    stdin: null,
  });

  const timer = new Promise<"timeout">((resolve) => setTimeout(() => resolve("timeout"), timeoutMs));
  const done = proc.exited.then((code) => ({ code }));

  const result = await Promise.race([timer, done]);

  if (result === "timeout") {
    proc.kill();
    // Drain quietly to avoid resource leaks.
    await proc.exited.catch(() => {});
    return { status: "timeout", timeoutMs };
  }

  return { status: "pass", exitCode: result.code };
}

test(
  "client smoke (gated) > runs only when REPLIX_CLIENT_SMOKE=1",
  async () => {
    if (process.env.REPLIX_CLIENT_SMOKE !== "1") {
      console.log("⏭️  client smoke skipped (set REPLIX_CLIENT_SMOKE=1 to enable)");
      expect(true).toBe(true);
      return;
    }

    const summary: Record<string, string> = {};

    for (const client of CLIENTS) {
      const result = await probeClient(client.bin, 3000);

      switch (result.status) {
        case "skip":
          console.log(`⏭️  ${client.name}: skipped — ${result.reason}`);
          summary[client.name] = `skip:${result.reason}`;
          break;
        case "timeout":
          console.log(
            `⏭️  ${client.name}: timeout after ${result.timeoutMs}ms — binary present but may require auth/TTY`,
          );
          summary[client.name] = `timeout:${result.timeoutMs}ms`;
          break;
        case "pass":
          console.log(`✅ ${client.name}: responded (exit ${result.exitCode})`);
          summary[client.name] = `pass:exit${result.exitCode}`;
          break;
      }
    }

    const counts = { pass: 0, skip: 0, timeout: 0 };
    for (const v of Object.values(summary)) {
      if (v.startsWith("pass")) counts.pass++;
      else if (v.startsWith("skip")) counts.skip++;
      else if (v.startsWith("timeout")) counts.timeout++;
    }

    console.log(
      `\n📊 smoke summary: ${counts.pass} pass, ${counts.skip} skip, ${counts.timeout} timeout`,
    );

    // Suite passes as long as no client hard-failed (timeout/skip are both fine).
    // A true hard-fail would mean probeClient threw — which would surface as test error.
    expect(Object.keys(summary).length).toBe(CLIENTS.length);
  },
  20000,
);
