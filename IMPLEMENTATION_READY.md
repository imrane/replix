# Implementation Ready: v2.0 PRD

✅ **Complete Product Requirements Document saved in repo**

---

## What's Documented

### 📘 [docs/PRD.md](docs/PRD.md) - v2.0 Specification

**Complete specification for dotfiles-first architecture:**

#### 1. Core Design

**User Dotfiles (Global Skill Library):**
```nix
programs.nexus = {
  enable = true;
  skills.humanizer.source = "github:blader/humanizer";
  mcp.filesystem = { command = "npx"; args = [...]; };
};
```

**Project (Enable Only):**
```nix
nexus.lib.mkRepo {
  system = "x86_64-linux";
  clients = [ "claude" "mcp" ];
  enable = {
    skills = [ "humanizer" ];
    mcp = [ "filesystem" ];
  };
}
```

**Project Override:**
```nix
{
  inputs.custom-skill.url = "github:someone/custom";
  
  outputs = { nexus, custom-skill, ... }:
    nexus.lib.mkRepo {
      enable.skills = [ "humanizer" "custom-skill" ];
      overrides.skills.custom-skill = custom-skill;
    };
}
```

#### 2. mkRepo API

**Full signature:**
```nix
nexus.lib.mkRepo {
  system = "x86_64-linux";
  clients = [ "claude" "mcp" "codex" "opencode" ];
  enable = {
    skills = [ "skill-name" ... ];
    mcp = [ "server-name" ... ];
  };
  overrides = {
    skills = { name = flake-input; };
  };
  layout = "direct";        # or "generated"
  cleanup = "owned-only";   # or "full"
  strictEnv = true;
}
```

**Returns:** `pkgs.mkShell` with injection in `shellHook`.

#### 3. Resolution Process

1. Read user dotfiles config (`programs.nexus.*`)
2. Build skill registry
3. Validate enable list
4. Fetch sources (github:, path:)
5. Merge project overrides
6. Compile canonical graph
7. Emit per-client
8. Write state hash

#### 4. Skill Sources

Supported:
- `github:blader/humanizer`
- `github:blader/humanizer?rev=abc123` (pinned)
- `path:~/.config/nexus/skills/repo-status`
- `path:/absolute/path/to/skill`

Expected structure:
```
SKILL.md    # Required
README.md   # Optional
assets/     # Optional
```

#### 5. Client Emitters

**Claude:**
- `.claude/skills/<skill>/SKILL.md`
- `.claude/skills/.nexus-managed` (marker)

**MCP:**
- `.mcp.json` with `"__generated_by": "nexus"`

**Codex:**
- `.codex/config.toml` with header marker

**OpenCode:**
- `.opencode/commands/`
- `.opencode/.nexus-managed`

#### 6. State Hash (Idempotency)

Hash includes:
- Enabled skills (names + sources)
- Enabled MCP servers
- Clients list
- Layout mode
- Override sources

Stored: `.claude/.nexus-state`

If unchanged → skip injection (no-op).

#### 7. Cleanup Strategy

**owned-only (default):**
- Only remove Nexus-managed artifacts
- Check ownership markers

**full:**
- Remove entire managed directories

#### 8. Security

- Deny-by-default enable
- Optional source pinning (`?rev=...`)
- Skill validation (SKILL.md exists)
- Missing env var handling (`strictEnv`)

---

## Implementation Phases

### Phase 1: Config Source Refactor
- Remove pack.json requirement
- Read from home-manager config
- Parse `programs.nexus.skills.*`
- Parse `programs.nexus.mcp.*`

### Phase 2: mkRepo API
- Create `lib.mkRepo` function
- Accept `enable` + `overrides`
- Return mkShell with shellHook
- Merge dotfiles + project config

### Phase 3: Skill Fetching
- Fetch github: sources (Nix fetchGit)
- Fetch path: sources (local)
- Cache in Nix store
- Validate SKILL.md exists

### Phase 4: Emitters (Refactor)
- Update emitters to use resolved skills
- Same output format as v1
- Maintain compatibility

### Phase 5: Testing
- Unit tests (resolution, merging)
- Golden tests (full flow)
- Integration tests (errors, no-op)

### Phase 6: Migration
- Deprecation warnings for pack.json
- Migration guide
- Compat layer (read pack.json if exists)

---

## Migration from v1

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
nexus.lib.mkRepo { enable.skills = [ "humanizer" ]; };
```

---

## Testing Strategy

**Unit:**
- Skill resolution
- Enable validation
- Override merging
- Canonical graph

**Golden:**
- Fixtures: dotfiles config + project
- Snapshot outputs
- Diff against golden files

**Integration:**
- Missing skill in dotfiles → error
- Override precedence
- State hash no-op
- Collision detection

**CI:**
```bash
nix flake check
```

---

## Success Criteria

✅ Users define skills once in dotfiles  
✅ Projects have zero local config  
✅ Skills portable across all projects  
✅ Override mechanism clear  
✅ No wrapper commands needed  
✅ Works with Nix + direnv  

---

## MVP Scope (v2.0)

**Must have:**
- mkRepo API
- Read from home-manager
- Enable validation
- Override mechanism
- Skill fetching (github:, path:)
- Claude + MCP emitters
- State hash
- Owned-only cleanup
- Golden tests

**Can defer:**
- Codex/OpenCode emitters
- Tag-based enable
- CLI tools
- Globs

---

## Files in Repo

- **docs/PRD.md** - v2.0 specification (13KB)
- **docs/PRD_ORIGINAL.md** - Original pack-based design
- **ARCHITECTURE_PLAN.md** - Implementation notes
- **STATUS.md** - Current state + roadmap
- **README.md** - Updated to reference PRD

---

## Next Steps

**Ready to implement Phase 1:** Config source refactor

See PRD for complete details.

---

**Total Documentation:** ~30KB across 5 files  
**Implementation Phases:** 6 defined  
**Testing Strategy:** Complete  
**API Design:** Fully specified  

✅ **Ready for v2.0 implementation**
