# Nexus — Dotfiles-first AI tooling for repos

[![CI](https://github.com/imrane/nexus/actions/workflows/ci.yml/badge.svg)](https://github.com/imrane/nexus/actions/workflows/ci.yml)
[![codecov](https://codecov.io/github/imrane/nexus/graph/badge.svg?token=VPKG1SPQRK)](https://codecov.io/github/imrane/nexus)

Define AI tooling once in dotfiles, then enable it per repo with one unified selector model.

## Why Nexus

- **No config sprawl in every repo**
- **One canonical enable model** for skills/MCP/artifacts
- **Multi-client output generation** (Claude, OpenCode, Codex)
- **Deterministic + idempotent** emission with cleanup

---

## 60-second mental model

1. Put canonical definitions in dotfiles (`programs.nexus.*`).
2. In each repo flake, call `nexus.lib.mkRepo`.
3. Use unified `enable` selectors to choose what that repo gets.
4. Nexus emits client-native files (`.claude/*`, `.opencode/*`, `.codex/*`, `.mcp.json`).

---

## Quick start

### 1) Dotfiles (define once, **pack-first**)

```nix
# ~/.config/home-manager/nexus.nix
{
  inputs.nexus.url = "github:imrane/nexus";
  imports = [ nexus.homeManagerModules.default ];

  programs.nexus = {
    enable = true;

    # PRIMARY: import tooling bundles as packs
    packs = [
      { source = "github:your-org/nexus-pack@<rev>"; }
      { source = "path:~/.config/nexus/packs/internal"; }
    ];

    # Optional direct overrides (secondary path)
    skills.humanizer.source = "github:blader/humanizer@<rev>";

    # Optional direct MCP override
    mcp.filesystem = {
      command = "npx";
      args = ["-y" "@modelcontextprotocol/server-filesystem" "${ENV:FS_ROOT}"];
    };

    # Optional artifact overrides (client-agnostic)
    artifacts.commands."review.md" = { source = "path:~/.config/nexus/artifacts/commands/review.md"; };

    vars = { FS_ROOT = "/home/imrane"; };
    strictEnv = true;
  };
}
```

Pack-first merge behavior:
- packs are loaded first
- direct `skills` / `mcp` / artifact defs override pack values when keys collide

### 2) Repo flake (enable per repo)

```nix
# ./flake.nix
{
  inputs.nexus.url = "github:imrane/nexus";

  outputs = { nixpkgs, nexus, ... }:
    let
      system = "x86_64-linux";
    in {
      devShells.${system}.default = nexus.lib.mkRepo {
        inherit system;
        clients = [ "claude" "opencode" "codex" ];

        # PRIMARY ENTRYPOINT: unified selectors
        enable = {
          skills = [ "humanizer" ];
          mcp = [ "filesystem" ];
          commands = [ "review.md" ];
          hooks = [ "pre-commit.sh" ];
          agents = [ "security.md" ];
          settings = [ "settings" "settingsLocal" ];
        };
      };
    };
}
```

### 3) Activate

```bash
nix develop
```

Nexus emits client-native outputs in the repo.

### Pack shape expected by dotfiles pack-first mode

A pack source should contain `pack.json` and may include:
- `skills/<id>/SKILL.md`
- `mcp/servers.json`
- `commands/*.md`
- `hooks/*`
- `agents/*.md`

### 4 full pack examples (in-repo)

All include: skills + MCP + commands + hooks + agents.

- `fixtures/packs/examples/starter`
- `fixtures/packs/examples/security`
- `fixtures/packs/examples/content`
- `fixtures/packs/examples/dataops`

Use them directly in dotfiles:

```nix
programs.nexus.packs = [
  { source = "path:/home/imrane/code/try/2026-02-14-nexus/fixtures/packs/examples/starter"; }
  { source = "path:/home/imrane/code/try/2026-02-14-nexus/fixtures/packs/examples/security"; }
  { source = "path:/home/imrane/code/try/2026-02-14-nexus/fixtures/packs/examples/content"; }
  { source = "path:/home/imrane/code/try/2026-02-14-nexus/fixtures/packs/examples/dataops"; }
];
```

---

## Unified enable model (primary)

Use these selectors in `enable`:
- `skills`
- `mcp`
- `commands`
- `hooks`
- `agents`
- `settings`

### Artifact namespace in dotfiles

Primary authoring path is now client-agnostic:
- `artifacts.commands`
- `artifacts.hooks`
- `artifacts.agents`
- `artifacts.settings`
- `artifacts.settingsLocal`

Legacy `claude.*` artifact defs are still accepted for compatibility, but `artifacts.*` wins on key collisions.

### Compatibility/override path (secondary)

`enable.clients.<client>.files` still works for explicit per-client file control.
Use it only when you need an override/escape hatch.

---

## Output surfaces by client

| Client | Output |
|---|---|
| Claude | `.claude/skills/*`, `.claude/commands/*`, `.claude/hooks/*`, `.claude/agents/*`, `.claude/settings.json`, `.claude/settings.local.json` |
| OpenCode | `.opencode/skills/*`, `.opencode/command/*`, `.opencode/hooks/*`, `.opencode/agent/*`, `opencode.json` |
| Codex | `.codex/config.toml`, `.agents/skills/*` |
| Protocol MCP | `.mcp.json` |

Nexus compiles a **single canonical MCP source** into all client-native MCP targets.

---

## Environment variables and secrets (Clan/sops friendly)

Templating supports:
- `${PROJECT_ROOT}`
- `${VAR}`
- `${ENV:VAR}`

Precedence (highest wins):
1. process env
2. dotfiles `programs.nexus.vars`
3. repo config `vars`

`strictEnv`:
- `true` (default): missing var => error
- `false`: missing var => empty string

### Example with secrets exported by Clan/sops

```bash
# example: exported before entering dev shell
export MYTOOL_DEV_TOKEN="..."
export MYTOOL_PROD_TOKEN="..."
```

```nix
programs.nexus.mcp = {
  mytool-dev = {
    command = "my-mcp";
    env = {
      PROFILE = "dev";
      TOKEN = "${ENV:MYTOOL_DEV_TOKEN}";
    };
  };

  mytool-prod = {
    command = "my-mcp";
    env = {
      PROFILE = "prod";
      TOKEN = "${ENV:MYTOOL_PROD_TOKEN}";
    };
  };
};
```

Then select profile **per repo**:

```nix
enable.mcp = [ "mytool-dev" ];   # repo A
# enable.mcp = [ "mytool-prod" ]; # repo B
```

---

## CLI

```bash
# Emit (config mode)
nexus --config <path>

# Legacy fallback mode (pack.json) if --config omitted
nexus

# Discovery
nexus list skills [--config <path>]
nexus list mcp [--config <path>]

# Generate mkRepo snippet
nexus snippet --skills a,b --mcp x,y

# Drift check (no mutation, CI-friendly)
nexus check --config <path>

# Compile snapshot -> validated typed schema
nexus spec compile --in <snapshot.json> --out <schema.json>
```

---

## Guarantees

- **Idempotent emits** via state hash
- **Owned-only cleanup** by default
- **Optional full cleanup** mode
- **Path safety guards** for client surfaces
- **Fast test suite**, heavier smokes gated by env flags

---

## Status

- ✅ v2 config-mode is active and primary
- ✅ Pack-first dotfiles registry (`programs.nexus.packs`) is enabled
- ✅ Unified selectors are the recommended per-repo entrypoint
- ✅ Canonical MCP compiles to all supported client outputs
- ⚠️ Legacy repo-local pack mode (`pack.json` fallback) remains compatibility-only and is queued for removal

See:
- `PRD.md` for roadmap/spec
- `AGENTS.md` for current implementation handoff

---

## Development

```bash
bun test
bun run test:coverage
nix flake check
```

Optional gated suites:
- `NEXUS_CLIENT_SMOKE=1`
- `NEXUS_NIX_SMOKE=1`
- `NEXUS_GITHUB_INTEGRATION=1`

---

## Contributing policy

Only these markdown files are allowed:
1. `README.md`
2. `PRD.md`
3. `AGENTS.md`

Use beads (`bd`) for all other notes/tasks.

---

## License

MIT
