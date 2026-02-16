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
  "nix develop smoke > mkRepo works with dotfiles registry only (no repo-local sources)",
  () => {
    if (process.env.NEXUS_NIX_SMOKE !== "1") {
      console.log("⏭️  nix smoke skipped (set NEXUS_NIX_SMOKE=1 to enable)");
      expect(true).toBe(true);
      return;
    }

    const tmp = mkdtempSync("/tmp/nexus-mkRepo-dotfiles-only-");
    const nexusRoot = resolve(__dirname, "..");

    try {
      // Make a clean copy of nexus because flakes cannot ingest unix sockets (e.g. .beads/bd.sock).
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

      // minimal project repo
      const repoRoot = join(tmp, "repo");
      mkdirSync(repoRoot, { recursive: true });

      // fake dotfiles registry + local skill content inside repo
      const skillsRoot = join(repoRoot, "skills", "humanizer");
      mkdirSync(skillsRoot, { recursive: true });
      writeFileSync(join(skillsRoot, "SKILL.md"), "---\nname: humanizer\n---\n\n# hello from nix\n");

      const dotfilesCfg = {
        skills: {
          humanizer: { source: "path:./skills/humanizer" },
        },
        mcp: {},
      };
      const dotfilesCfgPath = join(repoRoot, "dotfiles.json");
      writeFileSync(dotfilesCfgPath, JSON.stringify(dotfilesCfg));

      // project flake that uses mkRepo and enables the dotfiles skill.
      const flake = `{
  description = "nexus mkRepo dotfiles-only smoke";

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
        enable = { skills = [ "humanizer" ]; mcp = []; };

        # IMPORTANT: no per-repo sources/overrides
        skills = { };
      };
    });
}`;
      writeFileSync(join(repoRoot, "flake.nix"), flake);

      // Run nix develop and assert the injected skill exists.
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
          "test -f .claude/skills/humanizer/SKILL.md && grep -q 'hello from nix' .claude/skills/humanizer/SKILL.md",
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
