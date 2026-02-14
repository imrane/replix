# Project Status

## Current State: v1.0 MVP (Pack-Based)

✅ **Working:** Projects with `pack.json` in repo  
⚠️ **Architecture:** Will be replaced with dotfiles-based design

### What Works Now (v1.0)

- `pack.json` in project repo
- Skills stored in `skills/` directory
- Auto-injection to `.claude/skills/`
- Nix package + home-manager module
- 36 tests passing

**Location:** `~/code/try/2026-02-14-nexus`

---

## Next: v2.0 Architecture (Dotfiles-Based)

**Goal:** No local config. Skills defined in dotfiles, enabled per-project via flake.

See [ARCHITECTURE_PLAN.md](ARCHITECTURE_PLAN.md) for detailed design.

### Key Changes

**v1 (current):**
```
~/project/pack.json  ← Local config
~/project/skills/    ← Local skills
```

**v2 (planned):**
```
~/.config/home-manager/nexus.nix  ← Global skill library
~/project/flake.nix               ← Enable only
  └─> nexus.lib.inject { skills = [...]; }
```

### Migration Path

1. Implement v2 alongside v1
2. Add deprecation warnings for pack.json
3. Migration guide for existing users
4. Ship v2.0.0

---

## Implementation Phases

### Phase 1: Config Source Refactor
- Remove pack.json requirement
- Read from home-manager config
- Support skill sources (github:, path:)

### Phase 2: Flake API
- `nexus.lib.inject` function
- Merge dotfiles + project overrides
- Emit as before

### Phase 3: Skill Fetching
- Fetch from github/path
- Cache in nix store
- Validate SKILL.md

### Phase 4: Polish
- Migration guide
- Deprecate pack.json
- Clean docs

---

## Current Usage (v1 - Will Change)

**Don't build workflows around this yet.**

See README.md for current (temporary) usage.

---

**Next steps:** Start Phase 1 implementation per ARCHITECTURE_PLAN.md
