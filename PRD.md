# Product Requirements Document
# Nexus — Dotfiles-First AI Toolchain Injection

**Version:** 2.0 (Updated Architecture)  
**Date:** 2026-02-14

---

## 1. Overview

### 1.1 Product Name
Nexus

### 1.2 Tagline
Dotfiles-first, declarative injection of AI skills and MCP servers for Claude, Codex, and OpenCode.

### 1.3 Problem Statement

AI developer tools (Claude Code, Codex, OpenCode) each expect configuration and assets in different locations and formats:
- `.claude/skills/`
- `.mcp.json`
- `.codex/config.toml`
- `.opencode/...`

**Current issues:**
- Skills duplicated across projects
- Local config files clutter repos
- Hard to share skills globally
- No centralized skill library
- Manual config in every project

**We need a dotfiles-first system where skills are defined once and enabled per-project.**

---

## 2. Vision

### User Dotfiles: Global Skill Library

Users maintain skill definitions in their dotfiles:

```nix
# ~/.config/home-manager/nexus.nix
programs.nexus = {
  enable = true;
  
  skills = {
    humanizer.source = "github:blader/humanizer";
    repo-status.source = "path:~/.config/nexus/skills/repo-status";
  };
  
  mcp = {
    filesystem = {
      command = "npx";
      args = ["-y" "@modelcontextprotocol/server-filesystem" "/home"];
    };
  };
};
```

### Projects: Enable Only

Projects just enable what they need:

```nix
# ~/my-project/flake.nix
{
  inputs.nexus.url = "github:imrane/nexus";
  
  outputs = { nixpkgs, nexus, ... }:
    let
      system = "x86_64-linux";
    in {
      devShells.${system}.default = nexus.lib.mkRepo {
        inherit system;
        clients = [ "claude" "mcp" ];
        enable = {
          skills = [ "humanizer" "repo-status" ];
          mcp = [ "filesystem" ];
        };
      };
    };
}
```

### Projects: Override Specific Skills

```nix
{
  inputs = {
    nexus.url = "github:imrane/nexus";
    custom-skill.url = "github:someone/custom-skill";
  };
  
  outputs = { nixpkgs, nexus, custom-skill, ... }:
    nexus.lib.mkRepo {
      system = "x86_64-linux";
      clients = [ "claude" ];
      enable = {
        skills = [ 
          "humanizer"  # From dotfiles
        ];
      };
      overrides = {
        skills = {
          custom = custom-skill;  # Project-specific override
        };
      };
    };
}
```

**Result:** When entering the repo (`nix develop`), Nexus:
- Reads skill definitions from user dotfiles
- Fetches enabled skills from sources
- Emits to `.claude/skills/`, `.mcp.json`, etc.
- No local config files needed

---

## 3. Non-Goals

- Nexus is **not** a machine-level provisioning tool
- Nexus **does not** install Claude/Codex/OpenCode
- Nexus **does not** depend on Clan
- Nexus is **not** a runtime wrapper around tools
- Nexus **does not** require local config files in projects

---

## 4. Core Principles

1. **Dotfiles-first** – Skills defined once in user config
2. **Enable-only projects** – Projects just enable, no local config
3. **Declarative**
4. **Deny-by-default**
5. **Deterministic**
6. **Safe cleanup**
7. **No wrapper dependency**
8. **Fully portable** – Same dotfiles work everywhere

---

## 5. Architecture

### 5.1 Layer Model

| Layer | Responsibility |
|-------|---------------|
| User Dotfiles | Skill library definitions |
| Nexus | Resolution + injection |
| Project Flake | Enable list + overrides |
| Tools | Execution layer |

### 5.2 Data Flow

```
User Dotfiles (programs.nexus.skills.*)
    ↓
Project Flake (mkRepo { enable = [...]; })
    ↓
Nexus (fetch + resolve + emit)
    ↓
Tool Directories (.claude/skills/, .mcp.json, etc.)
```

---

## 6. Public API

### 6.1 User Dotfiles API

```nix
# ~/.config/home-manager/flake.nix
{
  inputs.nexus.url = "github:imrane/nexus";
  
  imports = [ nexus.homeManagerModules.default ];
  
  programs.nexus = {
    enable = true;
    
    # Global skill library
    skills = {
      humanizer = {
        source = "github:blader/humanizer";
        # Optional metadata
        description = "Remove AI writing patterns";
        tags = [ "writing" "ai" ];
      };
      
      repo-status = {
        source = "path:~/.config/nexus/skills/repo-status";
      };
    };
    
    # Global MCP servers
    mcp = {
      filesystem = {
        command = "npx";
        args = [ "-y" "@modelcontextprotocol/server-filesystem" "/home" ];
        env = { };
      };
      
      github = {
        command = "npx";
        args = [ "-y" "@modelcontextprotocol/server-github" ];
      };
    };
  };
}
```

### 6.2 Project API: mkRepo

```nix
nexus.lib.mkRepo {
  system = "x86_64-linux";
  
  # Which clients to emit for
  clients = [ "claude" "mcp" "codex" "opencode" ];
  
  # Enable from dotfiles skill library
  enable = {
    skills = [ "humanizer" "repo-status" ];
    mcp = [ "filesystem" "github" ];
  };
  
  # Optional: Override specific skills
  overrides = {
    skills = {
      custom-skill = custom-skill-flake-input;
    };
  };
  
  # Optional settings
  layout = "direct";        # or "generated"
  cleanup = "owned-only";   # or "full"
  strictEnv = true;
}
```

**Returns:** A `pkgs.mkShell` with `shellHook` that runs Nexus injection.

---

## 7. Skill Sources

### 7.1 Source Types

**GitHub:**
```nix
source = "github:blader/humanizer";
source = "github:blader/humanizer/main";  # Branch
source = "github:blader/humanizer?rev=abc123";  # Pin
```

**Local Path:**
```nix
source = "path:~/.config/nexus/skills/repo-status";
source = "path:/home/imrane/skills/custom";
```

**Flake:**
```nix
source = "git+https://example.com/skill.git?ref=main";
```

### 7.2 Skill Structure

Expected in source:
```
SKILL.md          # Required
README.md         # Optional
assets/           # Optional
```

---

## 8. Resolution Process

When `mkRepo` is invoked:

1. **Read user dotfiles** (via home-manager config)
2. **Build skill registry** from `programs.nexus.skills.*`
3. **Validate enable list** (error if skill not in registry)
4. **Fetch sources** (cache in Nix store)
5. **Merge overrides** (project overrides take precedence)
6. **Compile canonical graph**
7. **Emit per-client outputs**
8. **Write state hash**

---

## 9. Enable System

### 9.1 Basic Enable

```nix
enable = {
  skills = [ "humanizer" ];
  mcp = [ "filesystem" ];
};
```

Skills/MCP must exist in user's dotfiles `programs.nexus.*`.

### 9.2 Project Overrides

```nix
# flake.nix
{
  inputs.custom-skill.url = "github:someone/custom-skill";
  
  outputs = { nexus, custom-skill, ... }:
    nexus.lib.mkRepo {
      enable = {
        skills = [ "humanizer" "custom-skill" ];
      };
      overrides = {
        skills.custom-skill = custom-skill;
      };
    };
}
```

If a skill name is in `overrides`, it uses the override source instead of dotfiles.

### 9.3 Future: Globs & Tags

```nix
enable = {
  skills = [ "writing:*" ];  # All skills tagged "writing"
  mcp = [ "*" ];             # All MCP servers
};
```

---

## 10. Client Emitters

### 10.1 Claude

**Writes:**
- `.claude/skills/<skill>/SKILL.md`
- `.claude/skills/.nexus-managed` (ownership marker)

**For each enabled skill:**
- Fetch source
- Copy to `.claude/skills/<skill-name>/`

### 10.2 MCP

**Writes:**
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

### 10.3 Codex

**Writes:**
- `.codex/config.toml`

**Header:**
```toml
# generated by nexus
[skills]
enabled = true
```

### 10.4 OpenCode

**Writes:**
- `.opencode/commands/`
- `.opencode/.nexus-managed`

---

## 11. Cleanup Strategy

### 11.1 owned-only (default)

Only remove artifacts with Nexus ownership markers:
- `.claude/skills/.nexus-managed`
- `.mcp.json` with `"__generated_by": "nexus"`
- `.codex/config.toml` with `# generated by nexus` header
- `.opencode/.nexus-managed`

**Safe:** Won't touch user-managed files.

### 11.2 full (optional)

Remove entire managed directories.

**Use case:** Clean slate enforcement.

---

## 12. State Hash

**Hash includes:**
- Enabled skills (names + sources)
- Enabled MCP servers (configs)
- Clients list
- Layout mode
- Override sources

**Stored in:** `.claude/.nexus-state`

**If unchanged → skip injection (idempotent).**

---

## 13. Environment Templating

**Supported:**
- `${PROJECT_ROOT}` → Repo root path
- `${ENV:VAR}` → Environment variable

**Example:**
```nix
mcp.filesystem.args = [ "${PROJECT_ROOT}/workspace" ];
```

**Modes:**
- `strictEnv = true` (default) → Error on missing vars
- `strictEnv = false` → Empty string on missing vars

---

## 14. Security Model

### 14.1 Deny-by-default

Nothing is enabled unless explicitly listed in `enable`.

### 14.2 Source Pinning

**Recommended:**
```nix
source = "github:blader/humanizer?rev=abc123";
```

**Optional:**
```nix
allowUnpinned = true;  # Allow floating refs
```

### 14.3 Skill Validation

Before emitting:
- Check `SKILL.md` exists
- Validate structure (optional schema check)

---

## 15. Testing Strategy

### 15.1 Unit Tests

**Test:**
- Skill resolution from dotfiles
- Enable validation
- Override merging
- Canonical graph compilation
- Emitters

### 15.2 Golden Tests

**Fixtures:**
```
fixtures/dotfiles/nexus.nix    # Mock user config
fixtures/projects/basic/       # Sample project
```

**For each:**
1. Mock user dotfiles config
2. Invoke `mkRepo`
3. Snapshot outputs
4. Diff against golden files

### 15.3 Integration Tests

- Missing skill in dotfiles → error
- Override precedence
- State hash no-op
- Missing env var (strictEnv = true)

### 15.4 CI

```bash
nix flake check
```

Runs: unit + golden + integration tests.

---

## 16. Migration from v1 (pack.json)

### 16.1 Compatibility Layer

**Phase 1:** Support both modes
- If `pack.json` exists → warn "deprecated, use dotfiles"
- If no dotfiles config → read `pack.json` (compat mode)

**Phase 2:** Remove `pack.json` support
- Ship migration guide
- Deprecation period: 3 months
- v2.0.0 = dotfiles-only

### 16.2 Migration Steps

**Before (v1):**
```
~/project/pack.json
~/project/skills/humanizer/
```

**After (v2):**
```
# User dotfiles
programs.nexus.skills.humanizer.source = "github:blader/humanizer";

# Project flake
enable = { skills = [ "humanizer" ]; };
```

---

## 17. CLI (Optional)

**Future:**
```bash
nexus ls                  # List available skills
nexus enabled             # Show enabled skills for current project
nexus doctor              # Validate config
nexus fetch <skill>       # Pre-fetch skill to cache
```

Not required for MVP.

---

## 18. Future Enhancements

- **Tag-based enable:** `enable.skills = [ "tag:writing" ];`
- **Per-client enable blocks:**
  ```nix
  claude.enable.skills = [ "humanizer" ];
  codex.enable.skills = [ "repo-status" ];
  ```
- **Skill marketplace:** Public registry of skill sources
- **Version constraints:** `humanizer >= 2.0`
- **Skill dependencies:** Skills that require other skills
- **IDE integration:** VSCode extension to browse/enable skills

---

## 19. Success Criteria

Nexus v2 is successful if:

✅ Users define skills once in dotfiles  
✅ Projects have zero local config files  
✅ Skills are portable across all projects  
✅ Override mechanism is clear and simple  
✅ No wrapper commands needed  
✅ Works with any Nix + direnv setup  
✅ Skill ecosystem can grow independently  

---

## 20. MVP Scope (v2.0)

**Must include:**
- `mkRepo` API
- Read skills from home-manager config
- Enable validation
- Override mechanism
- Skill fetching (github:, path:)
- Claude + MCP emitters
- State hash (idempotency)
- Owned-only cleanup
- Golden tests

**Can defer:**
- Codex emitter
- OpenCode emitter
- Tag-based enable
- CLI tools
- Globs
- Pack imports (v1 feature, replaced by skill sources)

---

## 21. Example Workflows

### 21.1 Initial Setup (Once)

**User adds to dotfiles:**
```nix
programs.nexus = {
  enable = true;
  skills.humanizer.source = "github:blader/humanizer";
};
```

```bash
home-manager switch
```

### 21.2 New Project

```nix
# flake.nix
{
  inputs.nexus.url = "github:imrane/nexus";
  
  outputs = { nexus, ... }:
    nexus.lib.mkRepo {
      system = "x86_64-linux";
      clients = [ "claude" ];
      enable.skills = [ "humanizer" ];
    };
}
```

```bash
nix develop
# → .claude/skills/humanizer/ created automatically
```

### 21.3 Add Custom Skill (Project-Specific)

```nix
{
  inputs = {
    nexus.url = "github:imrane/nexus";
    my-skill.url = "github:me/my-skill";
  };
  
  outputs = { nexus, my-skill, ... }:
    nexus.lib.mkRepo {
      enable.skills = [ "humanizer" "my-skill" ];
      overrides.skills.my-skill = my-skill;
    };
}
```

---

## 22. Versioning

- **Semantic versioning**
- **v1.0:** pack.json-based (deprecated)
- **v2.0:** dotfiles-first (current spec)
- **Breaking changes:** Major version bump + migration guide

---

## 23. Documentation Requirements

**Must ship with v2.0:**
- User guide (dotfiles setup)
- API reference (`mkRepo`)
- Migration guide (v1 → v2)
- Example skill sources
- Troubleshooting guide

---

**End of PRD**
