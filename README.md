# Nexus - Agent Skill/MCP Config Manager

**Auto-inject agent skills and MCP servers into Claude Code, Codex, and OpenCode.**

Nexus reads a `pack.json` in your repo, enumerates available skills/MCP servers, and emits the enabled ones to the correct locations (`.claude/skills/`, `.mcp.json`, etc.). It runs automatically when you enter a Nix devShell.

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
