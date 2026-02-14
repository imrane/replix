# Nexus - Dotfiles-First AI Toolchain Injection

**Auto-inject agent skills and MCP servers into Claude Code, Codex, and OpenCode.**

⚠️ **Status:** v1.0 MVP complete. v2.0 architecture (dotfiles-based) specified in PRD.

📘 **Read the PRD:** [**docs/PRD.md**](docs/PRD.md)

---

## Vision (v2.0 - Specified, Ready for Implementation)

**Skills defined once in dotfiles. Projects just enable.**

### User Dotfiles (Once)

```nix
# ~/.config/home-manager/flake.nix
{
  inputs.nexus.url = "github:imrane/nexus";
  imports = [ nexus.homeManagerModules.default ];
  
  programs.nexus = {
    enable = true;
    skills.humanizer.source = "github:blader/humanizer";
    skills.repo-status.source = "path:~/.config/nexus/skills/repo-status";
  };
}
```

### Project (Enable Only)

```nix
# ~/my-project/flake.nix
{
  inputs.nexus.url = "github:imrane/nexus";
  
  outputs = { nexus, ... }:
    nexus.lib.mkRepo {
      system = "x86_64-linux";
      clients = [ "claude" "mcp" ];
      enable = {
        skills = [ "humanizer" "repo-status" ];
      };
    };
}
```

```bash
nix develop
# → .claude/skills/humanizer/ auto-generated (no local config needed)
```

**Benefits:**
- ✅ No local config files
- ✅ Skills portable across all projects
- ✅ Override per-project via flake inputs
- ✅ Fully declarative

See **[docs/PRD.md](docs/PRD.md)** for complete specification.

---

## Current (v1.0 - Temporary)

Uses `pack.json` in project repos. **Will be deprecated in v2.0.**

See [**STATUS.md**](STATUS.md) for implementation roadmap.

---

## Quick Start

**🎯 Goal:** Install once → Works everywhere

See [**QUICK_REFERENCE.md**](docs/QUICK_REFERENCE.md) for TL;DR version.

### Recommended Setup (One-Time)

**Add to your dotfiles' `home.nix`:**

```nix
{
  inputs.nexus.url = "path:/home/imrane/code/try/2026-02-14-nexus";
  
  # In your home-manager config:
  imports = [ nexus.homeManagerModules.default ];
  
  programs.nexus = {
    enable = true;
    autoRun = true;  # Auto-inject when cd into pack.json dirs
  };
}
```

**Then:** `home-manager switch`

**Now in any project:**

```bash
cd ~/my-project
echo '{"id":"my-project","version":"1.0.0","imports":[],"enable":{"skills":[],"mcp":[]}}' > pack.json
# Nexus auto-runs, skills injected
```

See [**docs/GLOBAL_SETUP.md**](docs/GLOBAL_SETUP.md) for complete installation options.

---

## What It Does

- **Auto-emits skills** → `.claude/skills/<skill-name>/SKILL.md`
- **Auto-emits MCP servers** → `.mcp.json`
- **Auto-emits Codex config** → `.codex/config.toml`
- **Auto-emits OpenCode commands** → `.opencode/commands/`
- **Idempotent** → Only writes when `pack.json` or enabled items change
- **Cleanup** → Removes stale skills when you disable them

---

## Usage (In Your Repo)

### 1. Add `pack.json` to your repo

```json
{
  "id": "my-pack",
  "version": "1.0.0",
  "imports": [],
  "enable": {
    "skills": ["repo-status"],
    "mcp": ["filesystem"]
  }
}
```

### 2. Create skill directories

```bash
mkdir -p skills/repo-status
# Add SKILL.md here
```

### 3. (Optional) Add MCP servers

```bash
mkdir -p mcp
# Create mcp/servers.json
```

### 4. Import Nexus in your flake

```nix
{
  inputs = {
    nixpkgs.url = "github:NixOS/nixpkgs/nixos-unstable";
    nexus.url = "path:/home/imrane/code/try/2026-02-14-nexus";
  };

  outputs = { self, nixpkgs, nexus }:
    # ...
    devShells.default = pkgs.mkShell {
      packages = [ pkgs.bun ];
      
      shellHook = ''
        # Run nexus to inject skills/MCP
        ${nexus.packages.${system}.default}/bin/nexus
      '';
    };
}
```

**Or run manually:**

```bash
bun /path/to/nexus/src/index.ts
```

---

## How It Works

1. **Loads `pack.json`** from current directory
2. **Enumerates available items**:
   - Skills: `skills/*/SKILL.md`
   - MCP servers: `mcp/servers.json`
   - OpenCode commands: `opencode/commands/*.md`
3. **Compiles canonical graph** (only enabled items)
4. **Computes state hash** (pack id + version + enabled list)
5. **Checks `.claude/.nexus-state`**:
   - If hash matches → skip emit (no-op)
   - If hash differs → emit all outputs
6. **Emits outputs**:
   - `.claude/skills/<skill>/` (copies `skills/<skill>/*`)
   - `.mcp.json` (MCP server definitions)
   - `.codex/config.toml` (Codex config)
   - `.opencode/commands/` (OpenCode command files)
7. **Writes state hash** to `.claude/.nexus-state`

---

## Pack Structure

```
your-repo/
├── pack.json              # Nexus config
├── skills/                # Skill definitions
│   ├── repo-status/
│   │   └── SKILL.md
│   └── humanizer/
│       └── SKILL.md
├── mcp/                   # MCP server definitions
│   └── servers.json
├── opencode/              # OpenCode commands (optional)
│   └── commands/
│       └── hello.md
└── .claude/               # EMITTED by Nexus (do not edit)
    ├── skills/
    │   ├── repo-status/
    │   │   └── SKILL.md
    │   └── .nexus-managed
    └── .nexus-state       # State hash (idempotency)
```

---

## Development

**Run tests:**
```bash
bun test
```

**Test with a pack:**
```bash
cd fixtures/packs/core
bun ~/code/try/2026-02-14-nexus/src/index.ts
```

**Nix checks:**
```bash
nix flake check
```

---

## Implementation Status

✅ **MVP Complete** (36 tests passing)

- Core parsing/validation (canonical IDs, pack schema, enable spec)
- Graph compiler (enable validation + collision detection)
- All emitters (Claude, MCP, Codex, OpenCode)
- State hash + idempotent behavior
- Cleanup (owned-only, respects markers)
- CLI with auto-activation via Nix shellHook
- Integration tests (missing enabled, collisions, state no-op)

---

## Next Steps (Post-MVP)

- Package as standalone Nix package
- Support git-based pack imports
- Add remote pack registry
- Multi-pack merging

---

**Created:** 2026-02-14  
**Location:** `~/code/try/2026-02-14-nexus`  
**Stack:** Bun + TypeScript + Nix  
**Tests:** 36 passing
