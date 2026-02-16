# Nexus - Dotfiles-First AI Toolchain Injection

[![CI](https://github.com/imrane/nexus/actions/workflows/ci.yml/badge.svg)](https://github.com/imrane/nexus/actions/workflows/ci.yml)
[![codecov](https://codecov.io/github/imrane/nexus/graph/badge.svg?token=VPKG1SPQRK)](https://codecov.io/github/imrane/nexus)

**Declarative, repo-scoped injection of AI skills and MCP servers for Claude Code, Codex, and OpenCode.**

---

## What It Does

**Define skills once in dotfiles. Enable per-project via `mkRepo`.**

Nexus auto-injects configuration into the correct locations:
- `.claude/skills/` - Agent skills
- `.mcp.json` - MCP servers
- `.codex/config.toml` - Codex repo config
- `.opencode/` - OpenCode repo artifacts

**No local config files needed in projects.**

---

## Quick Start

### 1. Define Skills in Dotfiles (Once)

```nix
# ~/.config/home-manager/nexus.nix
{
  inputs.nexus.url = "github:imrane/nexus";
  
  imports = [ nexus.homeManagerModules.default ];
  
  programs.nexus = {
    enable = true;
    
    skills = {
      # GitHub sources must be pinned (pure eval): github:owner/repo@<rev>
      humanizer.source = "github:blader/humanizer@<rev>";
      repo-status.source = "path:~/.config/nexus/skills/repo-status";
    };
    
    mcp = {
      filesystem = {
        command = "npx";
        args = ["-y" "@modelcontextprotocol/server-filesystem" "/home"];
      };
    };
  };
}
```

After `home-manager switch`, skills are available to all projects.

### 1.1 Define Canonical Artifacts in Dotfiles

```nix
# ~/.config/home-manager/nexus.nix
{
  programs.nexus = {
    enable = true;

    claude = {
      commands = {
        "/review.md" = { source = "path:~/.config/nexus/claude/commands/review.md"; };
      };

      hooks = {
        "pre-commit.sh" = {
          source = "path:~/.config/nexus/claude/hooks/pre-commit.sh";
          executable = true;
        };
      };

      agents = {
        "security.md" = { source = "path:~/.config/nexus/claude/agents/security.md"; };
      };

      settings = { source = "path:~/.config/nexus/claude/settings.json"; };
      settingsLocal = { source = "path:~/.config/nexus/claude/settings.local.json"; };
    };
  };
}
```

These become canonical artifact definitions that adapters map to client-specific outputs (currently Claude emits):
- `.claude/commands/*`
- `.claude/hooks/*`
- `.claude/agents/*`
- `.claude/settings.json`
- `.claude/settings.local.json`

### 2. Enable in Project (No Config Files)

```nix
# ~/my-project/flake.nix
{
  inputs.nexus.url = "github:imrane/nexus";
  
  outputs = { nixpkgs, nexus, ... }:
    let
      system = "x86_64-linux";
      pkgs = nixpkgs.legacyPackages.${system};
    in {
      devShells.${system}.default = nexus.lib.mkRepo {
        inherit system;
        clients = [ "claude" ];
        enable = {
          skills = [ "humanizer" "repo-status" ];
          mcp = [ "filesystem" ];

          # Canonical artifact selectors
          commands = [ "review.md" ];
          hooks = [ "pre-commit.sh" ];
          agents = [ "security.md" ];
          settings = [ "settings" "settingsLocal" ];
        };
      };
    };
}
```

### 3. Use It

```bash
cd ~/my-project
nix develop
# → .claude/skills/humanizer/ auto-generated
# → .mcp.json written
# → No local config files needed

claude  # Skills auto-loaded
```

---

## Benefits

✅ **No local config** - Projects stay clean  
✅ **Define once** - Skills portable across all projects  
✅ **Override per-project** - Pull custom skills as flake inputs  
✅ **Fully declarative** - Nix-based, reproducible  
✅ **Idempotent** - Only writes when changed  
✅ **Safe cleanup** - Removes stale skills automatically

---

## Architecture

### Core API: `mkRepo`

```nix
nexus.lib.mkRepo {
  system = "x86_64-linux";
  
  # Which tool clients to emit config for (MCP is protocol-level, not a client)
  clients = [ "claude" "codex" "opencode" ];
  
  # Enable from dotfiles
  enable = {
    skills = [ "humanizer" "repo-status" ];
    mcp = [ "filesystem" "github" ];

    # Canonical selectors (compiled by client adapters)
    commands = [ "review.md" ];
    hooks = [ "pre-commit.sh" ];
    agents = [ "security.md" ];
    settings = [ "settings" "settingsLocal" ];
  };
  
  # Optional: override specific skills
  overrides = {
    skills.custom = customSkillFlake;
  };
  
  # Optional: layout mode
  layout = "direct";  # or "generated"
  
  # Optional: cleanup strategy
  cleanup = "owned-only";  # or "full"

  # Optional: templating behavior
  strictEnv = true;
}
```

Returns: `pkgs.mkShell` with injection in `shellHook`.

### Unified Artifact Selectors (Canonical Spec)

Nexus now supports canonical artifact selectors in `enable`:
- `enable.commands`
- `enable.hooks`
- `enable.agents`
- `enable.settings`

These are compiled by client adapters (Claude/OpenCode/Codex), so selection is **unified**, while output paths remain client-specific.

```nix
nexus.lib.mkRepo {
  system = "x86_64-linux";
  clients = [ "claude" "opencode" "codex" ];

  enable = {
    skills = [ "humanizer" ];
    mcp = [ "filesystem" ];

    commands = [ "review.md" ];
    hooks = [ "pre-commit.sh" ];
    agents = [ "security.md" ];
    settings = [ "settings" "settingsLocal" ];
  };
}
```

`enable.clients.<client>.files` still works as a compatibility path, but canonical selectors are the primary model.

### Enabling More Clients via Plugins

Preferred model: define plugins once in dotfiles, then refer to clients by name per repo.

**Dotfiles registry:**

```nix
programs.nexus.plugins = {
  acme = { module = "path:~/.config/nexus/plugins/acme-client.mjs"; };
  foo = { module = "path:~/.config/nexus/plugins/foo-client.mjs"; };
};
```

**Project:**

```nix
nexus.lib.mkRepo {
  system = "x86_64-linux";
  clients = [ "claude" "codex" "acme" "foo" ];
  enable = {
    skills = [ "humanizer" ];
    mcp = [ "filesystem" ];
  };
}
```

When Nexus runs, it loads plugin modules for enabled client names from the dotfiles plugin registry automatically.

Plugin modules register themselves via:
- `registerClientFilePlugin(...)`
- `registerOutputPlugin(...)`

```ts
import { registerClientFilePlugin } from "nexus/src/clientPlugins/registry";
import { registerOutputPlugin } from "nexus/src/outputPlugins/registry";

registerClientFilePlugin({
  client: "acme",
  normalizePath: ({ relPath }) => relPath.replace(/^\/+/, "").replace("acme/commands/", "acme/command/"),
});

registerOutputPlugin({
  id: "codex",
  desiredPaths: ({ repoRoot }) => [repoRoot + "/.codex/override.toml"],
  emit: async () => {
    // custom emit logic
  },
});
```

Legacy env-based loading (`NEXUS_PLUGIN_MODULES`, `NEXUS_CLIENT_PLUGIN_MODULES`, `NEXUS_OUTPUT_PLUGIN_MODULES`) remains as temporary backward compatibility.

### Skill Sources

**User dotfiles:**
```nix
programs.nexus.skills = {
  # GitHub repo
  # GitHub sources must be pinned: github:owner/repo@<rev>
  humanizer.source = "github:blader/humanizer@<rev>";

  # Optional: selective include (reduces clone/copy surface)
  repo-status.source = "github:acme/skills?rev=<rev>&include=skills/repo-status,commands/review.md#skills/repo-status";
  
  # Local path
  repo-status.source = "path:~/.config/nexus/skills/repo-status";
  
  # From a skill pack
  code-review.source = "github:someone/skills-pack#code-review";
};
```

**Project override:**
```nix
{
  inputs.custom.url = "github:someone/custom-skill";
  
  outputs = { nexus, custom, ... }:
    nexus.lib.mkRepo {
      enable.skills = [ "humanizer" "custom" ];
      overrides.skills.custom = custom;
    };
}
```

---

## Pack System (For Publishers)

**`pack.json` is ONLY for publishable skill packs** (not for projects).

### Creating a Skill Pack

```
my-skills-pack/
├── pack.json              # Required for packs
├── skills/
│   ├── humanizer/
│   │   └── SKILL.md
│   └── repo-status/
│       └── SKILL.md
├── commands/
│   └── review.md
├── hooks/
│   └── pre-commit.sh
├── agents/
│   └── security.md
└── mcp/
    └── servers.json
```

Canonical `commands/`, `hooks/`, and `agents/` folders are included so packs can carry first-class artifact definitions alongside skills/MCP (used by current examples and upcoming compiler/plugin flows).

**pack.json:**
```json
{
  "id": "my-skills-pack",
  "version": "1.0.0",
  "imports": []
}
```

### Publishing

```bash
git init
git add -A
git commit -m "Initial skill pack"
git remote add origin git@github.com:you/my-skills-pack.git
git push -u origin main
```

### Using Published Packs

**In user dotfiles:**
```nix
programs.nexus.packs = [
  { source = "github:you/my-skills-pack"; }
];

# Then enable individual skills
programs.nexus.enable.skills = [
  "my-skills-pack:humanizer"
  "my-skills-pack:repo-status"
];
```

**Or reference directly:**
```nix
programs.nexus.skills.humanizer.source = "github:you/my-skills-pack#humanizer";
```

---

## Clients

### Claude Code

**Emits:**
- `.claude/skills/<skill-name>/SKILL.md`
- `.claude/skills/.nexus-managed` (ownership marker)
- Optional parity files when configured/enabled:
  - `.claude/commands/*`
  - `.claude/hooks/*`
  - `.claude/agents/*`
  - `.claude/settings.json`
  - `.claude/settings.local.json`

**Marker:**
```text
generated by nexus
```

### MCP (Protocol Surface, Not a Client)

MCP is a protocol consumed by clients (Claude/Codex/OpenCode), not a client itself.

**Emits:**
- `.mcp.json`

**Format:**
```json
{
  "__generated_by": "nexus",
  "mcpServers": {
    "filesystem": {
      "command": "npx",
      "args": ["-y", "@modelcontextprotocol/server-filesystem", "/home"]
    }
  }
}
```

### Codex

**Emits (repo-scoped):**
- `.codex/config.toml`

Codex loads repo config from `.codex/config.toml` (OpenAI Codex config reference: https://developers.openai.com/codex/config-reference).

**Codex support matrix (Nexus):**

| Surface | Scope | Nexus status | Notes |
|---|---|---|---|
| `.codex/config.toml` | Repository | ✅ Supported | Written with ownership header only (no speculative default sections), cleaned in `owned-only` mode when Nexus-managed, and enforced by config-path validation |
| `~/.codex/*` (user config) | User-global | ❌ Not emitted | Out of scope for repo-scoped injection |
| Cloud/workspace settings | Cloud-only | ❌ Not emitted | Not represented as repo files |

**Header:**
```toml
# generated by nexus
```

### OpenCode

**Emits:**
- `.opencode/command/`
- `.opencode/agent/`
- `.opencode/hooks/`
- `.opencode/rules/`
- `.opencode/.nexus-managed` (ownership marker)

---

## How It Works

1. **Read dotfiles config** - Load skill definitions from `programs.nexus`
2. **Resolve enable list** - Match enabled items to skill sources
3. **Fetch skills** - Clone/cache from github:, path:, etc.
4. **Compile canonical graph** - Merge enabled skills, MCP, and canonical artifact selectors (commands/hooks/agents/settings)
5. **Compute state hash** - Hash of enabled items + sources
6. **Check if changed** - Compare to `.claude/.nexus-state`
7. **Emit outputs** - Write `.claude/skills/`, `.mcp.json`, etc.
8. **Write state** - Save hash for next run (idempotency)

---

## State & Idempotency

**State hash includes:**
- Skill/MCP IDs
- Source URLs/revisions
- Enable lists
- Clients

**Stored in:**
- `layout=direct` → `.claude/.nexus-state`
- `layout=generated` → `.nexus/generated/.claude/.nexus-state`

**Behavior:**
- Hash matches → Skip emit (no-op)
- Hash differs → Re-emit all outputs
- Missing state → First run, emit everything

---

## Cleanup

**Owned-only (default):**
- Only removes files Nexus previously generated
- Checks ownership markers (`.nexus-managed`, `__generated_by`)

**Full (optional):**
- Removes entire managed directories
- Use with caution

---

## CLI Feature Set

Current Nexus CLI commands:

```bash
# Emit Nexus artifacts (default command)
nexus --config <path>
# or
nexus

# List available items in current repo context
nexus list skills [--config <path>]
nexus list mcp [--config <path>]

# Generate mkRepo enable snippet
nexus snippet --skills a,b --mcp x,y

# Drift detection without mutation (CI-friendly)
nexus check --config <path>

# Compile spec snapshot -> validated typed schema (3tv)
nexus spec compile --in <snapshot.json> --out <schema.json>
```

Notes:
- `list` marks each item as `enabled` or `available`.
- `check` exits non-zero when generated outputs drift.
- `spec compile` validates path safety by client roots before writing schema.
- If `--config` is omitted, Nexus uses pack-mode fallback (`pack.json`) where applicable.

---

## Development

### Run Tests

```bash
bun test
```

Optional local guard before pushing:

```bash
./scripts/install-githooks.sh
```

CI runs the same tests on every PR.

### Optional Client Smoke Tests (Gated)

```bash
bun run test:smoke:clients
```

Notes:
- Smoke tests are opt-in and run only when `NEXUS_CLIENT_SMOKE=1`.
- Missing client binaries are reported as explicit skips (not failures).
- CI can enable this with repo variable `NEXUS_CLIENT_SMOKE=1`.

### Coverage

```bash
bun run test:coverage
```

Outputs:
- Console coverage summary (text reporter)
- `coverage/lcov.info` (LCOV artifact)

In CI, the LCOV file is uploaded as artifact: `coverage-lcov`.

### Build Package

```bash
nix build
```

### Run Checks

```bash
nix flake check
```

---

## Implementation Status

⚠️ **v1.0 MVP Complete** (legacy pack.json path still present, queued for removal)

✅ **v2 config-mode active** — dotfiles registry, `mkRepo`, templating, layout/cleanup modes, and client outputs are implemented and covered by tests.

✅ **Canonical MCP source direction landed** — one internal MCP definition now compiles to client outputs (`.mcp.json`, `opencode.json`, Codex config generation) instead of maintaining multiple internal MCP sources.

🚧 **Current focus** — compress runtime complexity (`runNexus.ts`) and remove legacy compatibility branches while preserving behavior.

### Migration Direction (updated)

- **Pre-launch policy:** no formal deprecation rollout required yet.
- **Legacy surfaces** (notably `pack.json` mode and path-first client-file enable flows) are queued for removal as canonical config-mode hardening completes.
- **Primary path:** dotfiles + `mkRepo` config mode.

See **[PRD.md](PRD.md)** for complete v2.0 specification.

See **[AGENTS.md](AGENTS.md)** for implementation state.

---

## Project Structure

```
nexus/
├── README.md              # This file
├── PRD.md                 # Product requirements + trajectory
├── AGENTS.md              # Implementation state + handoff context
├── src/                   # TypeScript source
├── test/                  # Bun tests (default suite is fast; optional heavy suites are env-gated)
├── modules/               # Nix modules
│   └── home-manager.nix   # Home-manager integration
├── flake.nix              # Nix flake
└── fixtures/              # Test fixtures
    └── packs/core/        # Golden test pack
```

---

## Contributing

**Hard Rule:** Only 3 markdown files allowed:
1. `README.md` - User-facing overview
2. `PRD.md` - Product requirements
3. `AGENTS.md` - Implementation state

**All other notes → Use `bd` (beads) issues.**

No TODO.md, STATUS.md, ARCHITECTURE.md, or docs/ sprawl.

---

## License

MIT

---

**Created:** 2026-02-14  
**Repo:** https://github.com/imrane/nexus  
**Stack:** Bun + TypeScript + Nix  
**Tests:** Passing (core suite optimized; optional integration suites are gated)
