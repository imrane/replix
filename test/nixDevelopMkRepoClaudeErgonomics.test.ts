import { test, expect } from "bun:test";
import { mkdtempSync, writeFileSync, mkdirSync, rmSync } from "node:fs";
import { join, resolve } from "node:path";
import { execFileSync } from "node:child_process";

function run(cmd: string[], opts?: { cwd?: string; env?: Record<string, string> }) {
  execFileSync(cmd[0]!, cmd.slice(1), {
    cwd: opts?.cwd,
    stdio: "inherit",
    env: { ...process.env, ...(opts?.env ?? {}) },
  });
}

test(
  "nix develop smoke > mkRepo claude selector ergonomics enables commands+agents",
  () => {
    const tmp = mkdtempSync("/tmp/nexus-mkRepo-claude-ergonomics-");
    const nexusRoot = resolve(__dirname, "..");

    try {
      const nexusClean = join(tmp, "nexus-clean");
      run([
        "bash",
        "-lc",
        [
          `mkdir -p ${JSON.stringify(nexusClean)}`,
          `tar -C ${JSON.stringify(nexusRoot)} \
            --exclude=.beads/bd.sock \
            --exclude=.beads/daemon.pid \
            --exclude=.beads/daemon.lock \
            --exclude=.beads/daemon.log \
            --exclude=.beads/.jsonl.lock \
            --exclude=node_modules \
            --exclude=.direnv \
            -cf - . | tar -C ${JSON.stringify(nexusClean)} -xf -`,
        ].join(" && "),
      ]);

      const repoRoot = join(tmp, "repo");
      mkdirSync(repoRoot, { recursive: true });

      const cmdDir = join(repoRoot, "defs", "commands");
      const agentDir = join(repoRoot, "defs", "agents");
      mkdirSync(cmdDir, { recursive: true });
      mkdirSync(agentDir, { recursive: true });
      writeFileSync(join(cmdDir, "review.md"), "# review command\n");
      writeFileSync(join(agentDir, "security.md"), "# security agent\n");

      const dotfilesCfgPath = join(repoRoot, "dotfiles.json");
      writeFileSync(
        dotfilesCfgPath,
        JSON.stringify(
          {
            skills: {},
            mcp: {},
            claude: {
              commands: {
                "review.md": { source: `path:${join(cmdDir, "review.md")}` },
              },
              agents: {
                "security.md": { source: `path:${join(agentDir, "security.md")}` },
              },
            },
          },
          null,
          2,
        ),
      );

      const flake = `{
  description = "nexus mkRepo claude selector ergonomics smoke";

  inputs = {
    nixpkgs.url = "github:NixOS/nixpkgs/nixos-unstable";
    flake-utils.url = "github:numtide/flake-utils";
    nexus.url = "path:${nexusClean}";
  };

  outputs = { self, nixpkgs, flake-utils, nexus }:
    flake-utils.lib.eachDefaultSystem (system: {
      devShells.default = nexus.lib.mkRepo {
        inherit system;
        clients = [ "claude" ];
        enable = { skills = []; mcp = []; };
        claude = {
          commands = [ "review.md" ];
          agents = [ "security.md" ];
        };
      };
    });
}`;
      writeFileSync(join(repoRoot, "flake.nix"), flake);

      run(
        [
          "nix",
          "develop",
          "--extra-experimental-features",
          "nix-command flakes",
          "-c",
          "bash",
          "--noprofile",
          "--norc",
          "-c",
          "test -f .claude/commands/review.md && test -f .claude/agents/security.md",
        ],
        {
          cwd: repoRoot,
          env: {
            NEXUS_DOTFILES_CONFIG_JSON: dotfilesCfgPath,
          },
        },
      );

      expect(true).toBe(true);
    } finally {
      rmSync(tmp, { recursive: true, force: true });
    }
  },
  { timeout: 120_000 },
);
