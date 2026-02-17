import { test, expect } from "bun:test";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, existsSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, join } from "node:path";

type Client = "claude" | "opencode" | "codex";

type PackCase = {
  name: string;
  root: string;
};

const PACKS: PackCase[] = ["starter", "security", "content", "dataops"].map((name) => ({
  name,
  root: join(process.cwd(), "fixtures", "packs", "examples", name),
}));

const CLIENTS: Client[] = ["claude", "opencode", "codex"];

const REQUIRED_ENV = {
  FS_ROOT: "/tmp",
  SEC_FS_ROOT: "/tmp",
  CONTENT_ROOT: "/tmp",
  DATA_ROOT: "/tmp",
  PG_URL: "postgres://localhost:5432/postgres",
};

function readPackSelectors(packRoot: string): { commands: string[]; hooks: string[]; agents: string[]; mcp: string[] } {
  const packJson = JSON.parse(readFileSync(join(packRoot, "pack.json"), "utf8")) as any;
  const refs = packJson.references ?? {};

  const commands = (refs.commands ?? []).map((p: string) => basename(p));
  const hooks = (refs.hooks ?? []).map((p: string) => basename(p));
  const agents = (refs.agents ?? []).map((p: string) => basename(p));

  const mcp: string[] = [];
  for (const rel of refs.mcp ?? []) {
    const servers = JSON.parse(readFileSync(join(packRoot, rel), "utf8")) as Record<string, any>;
    for (const key of Object.keys(servers)) {
      if (!mcp.includes(key)) mcp.push(key);
    }
  }

  return { commands, hooks, agents, mcp };
}

function runCli(cwd: string, args: string[]) {
  return Bun.spawnSync({
    cmd: ["bun", join(process.cwd(), "src/index.ts"), ...args],
    cwd,
    env: {
      ...process.env,
      ...REQUIRED_ENV,
      REPLIX_DOTFILES_CONFIG_JSON: "",
    },
    stdout: "pipe",
    stderr: "pipe",
  });
}

test("e2e matrix (gated) > sample canonical packs emit/check/doctor in a fresh repo for all clients", () => {
  if (process.env.REPLIX_E2E_PACK_MATRIX !== "1") {
    console.log("⏭️  e2e pack/client matrix skipped (set REPLIX_E2E_PACK_MATRIX=1 to enable)");
    expect(true).toBe(true);
    return;
  }

  const root = mkdtempSync(join(tmpdir(), "replix-e2e-pack-client-matrix-"));

  try {
    for (const pack of PACKS) {
      const selectors = readPackSelectors(pack.root);

      for (const client of CLIENTS) {
        const repoRoot = join(root, `${pack.name}-${client}`);
        mkdirSync(join(repoRoot, ".replix"), { recursive: true });

        writeFileSync(
          join(repoRoot, ".replix", "packs.json"),
          JSON.stringify({ packs: [{ source: `path:${pack.root}` }] }, null, 2) + "\n",
        );

        writeFileSync(
          join(repoRoot, "replix.json"),
          JSON.stringify(
            {
              version: 1,
              repoRoot,
              clients: [client],
              enable: selectors,
              overrides: { skills: {}, mcp: {} },
            },
            null,
            2,
          ) + "\n",
        );

        const compile = runCli(repoRoot, [
          "compile",
          "canonical",
          "--client",
          client,
          "--pack",
          pack.root,
          ...(client === "codex" ? [] : ["--fail-on-warn"]),
        ]);
        expect(compile.exitCode).toBe(0);

        const compilePlan = JSON.parse(compile.stdout.toString());
        if (client === "claude") {
          expect(compilePlan.summary.warnings).toBe(0);
          expect(compilePlan.entries.some((e: any) => e.kind === "command" && `${e.target ?? ""}`.includes(".claude/commands"))).toBe(true);
          expect(compilePlan.entries.some((e: any) => e.kind === "agent" && `${e.target ?? ""}`.includes(".claude/agents"))).toBe(true);
          expect(compilePlan.entries.some((e: any) => e.kind === "hook" && `${e.target ?? ""}`.includes(".claude/hooks"))).toBe(true);
        }

        if (client === "opencode") {
          expect(compilePlan.summary.warnings).toBe(0);
          expect(compilePlan.entries.some((e: any) => e.kind === "command" && `${e.target ?? ""}`.includes(".opencode/command"))).toBe(true);
          expect(compilePlan.entries.some((e: any) => e.kind === "agent" && `${e.target ?? ""}`.includes(".opencode/agent"))).toBe(true);
          expect(compilePlan.entries.some((e: any) => e.kind === "hook" && `${e.target ?? ""}`.includes(".opencode/hooks"))).toBe(true);
        }

        if (client === "codex") {
          expect(compilePlan.summary.warnings).toBeGreaterThan(0);
        }

        const emit = runCli(repoRoot, ["--config", "replix.json"]);
        expect(emit.exitCode).toBe(0);

        const check = runCli(repoRoot, ["check", "--config", "replix.json"]);
        expect(check.exitCode).toBe(0);

        const doctor = runCli(repoRoot, ["doctor", "--config", "replix.json"]);
        expect(doctor.exitCode).toBe(0);

        if (client === "claude") {
          expect(existsSync(join(repoRoot, ".claude", "commands", selectors.commands[0]))).toBe(true);
          expect(existsSync(join(repoRoot, ".claude", "agents", selectors.agents[0]))).toBe(true);
          expect(existsSync(join(repoRoot, ".claude", "hooks", selectors.hooks[0]))).toBe(true);
        }

        if (client === "opencode") {
          expect(existsSync(join(repoRoot, "opencode.json"))).toBe(true);
        }

        if (client === "codex") {
          expect(existsSync(join(repoRoot, ".codex", "config.toml"))).toBe(true);
        }

        expect(existsSync(join(repoRoot, ".mcp.json"))).toBe(true);
      }
    }
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
