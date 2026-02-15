# Agent Instructions (Nexus)

## ⚠️ HARD RULE: No Markdown Sprawl

**Only three markdown files are allowed:**
1. **README.md** - User-facing overview
2. **PRD.md** - Product requirements (the goal)
3. **AGENTS.md** - This file (current state for agents)

**All other details go in `bd` (beads) issues.**

Do NOT create:
- TODO.md, NOTES.md, STATUS.md, ARCHITECTURE.md, etc.
- docs/ directory with multiple files
- Any other markdown files

**Violations = immediate deletion.**

---

## "Land the plane" (definition)
Before handing off, you must:
1) `bun test` is green
2) `bd sync` (if bd is working in this location)
3) `git status` is clean
4. Commit any handoff state changes (esp. `AGENTS.md`)
5. If a remote exists: `git push` (don't strand work locally)

This repo uses **bd** (beads) for tasks.

---

## Repo Policy
- **Bun + TypeScript** for implementation + tests.
- **No markdown sprawl**: Only README.md, PRD.md, AGENTS.md allowed.
- Keep this single **AGENTS.md** as the only persistent "handoff/state" file.
- Record decisions inside the *relevant bd issue* (update issue description).

---

## Quick Reference

```bash
bd ready
bd show <id>
bd update <id> --status in_progress
bd close <id>

bun test
nix flake check
```

---

## Current State (handoff)

**Repo:** `~/code/try/2026-02-14-nexus`  
**Stack:** Bun + TypeScript + Nix  
**Status:** v1.0 MVP complete (pack.json-based). v2.0 PRD complete (dotfiles-based).

### v1.0 Implementation (Current - Will be Deprecated)

**What works now:**
- `pack.json` in project repos
- Skills in `skills/` directory
- Auto-injection to `.claude/skills/`, `.mcp.json`, etc.
- Nix package + home-manager module
- 36 tests passing

**Stack:**
- Bun + TypeScript
- TDD via `bun test`
- Nix flake with devShell + check
- Home-manager module (v1 API)

**Key Files:**
- `src/index.ts` - CLI entry point
- `src/graph.ts` - Canonical graph compiler
- `src/emitters/` - Claude, MCP, Codex, OpenCode emitters
- `src/state.ts` - State hash (idempotency)
- `src/cleanup.ts` - Owned-only cleanup
- `package.nix` - Nix package derivation
- `modules/home-manager.nix` - Home-manager module (v1)
- `flake.nix` - Exports package + module

**Tests:** 43 passing
- Unit tests for all components
- Golden tests (fixtures/packs/core)
- Integration tests (missing enabled, collisions, state no-op)

---

### v2.0 Architecture (PRD Complete - Ready for Implementation)

See **PRD.md** for complete specification.

**Key Changes:**
- **No local config** - Projects have zero files
- **Dotfiles-first** - Skills defined in `programs.nexus.skills.*`
- **mkRepo API** - Projects enable via flake
- **Override via inputs** - Pull skills as flake inputs
- **Pack system** - pack.json only for importable skill libraries

**Core Design:**

**User dotfiles (once):**
```nix
programs.nexus = {
  enable = true;
  skills.humanizer.source = "github:blader/humanizer";
};
```

**Project (enable only):**
```nix
nexus.lib.mkRepo {
  system = "x86_64-linux";
  clients = [ "claude" "mcp" ];
  enable.skills = [ "humanizer" ];
}
```

**Result:** No pack.json needed in projects.

---

## Implementation Phases (v2.0)

See PRD.md Section 20 for MVP scope.

**Must implement:**
1. Config source refactor (read from home-manager)
2. mkRepo API
3. Skill fetching (github:, path:)
4. Enable validation + override merging
5. Emitters (refactor to use resolved skills)
6. State hash (same as v1)
7. Cleanup (same as v1)
8. Golden tests

**Can defer:**
- Codex/OpenCode emitters (Claude + MCP first)
- Tag-based enable
- CLI tools
- Globs

---

## Migration Strategy

**v1 (current):**
```
~/project/pack.json
~/project/skills/humanizer/
```

**v2 (target):**
```
# User dotfiles
programs.nexus.skills.humanizer.source = "github:blader/humanizer";

# Project flake
mkRepo { enable.skills = [ "humanizer" ]; };
```

**Transition plan:**
1. Implement v2 API alongside v1
2. Add deprecation warnings for pack.json
3. Ship v2.0.0 with migration guide
4. Remove v1 compat layer after transition

---

## Pack System (v2.0 Clarification)

**pack.json = For Packs Only** (importable skill libraries)

**Packs (github:someone/skills-pack):**
```
pack.json          ← Required for packs
skills/
  humanizer/
  repo-status/
mcp/
  servers.json
```

**Projects:** No pack.json needed, just enable via mkRepo.

**User dotfiles:** Can reference skills from packs OR import whole packs.

---

## Testing

**Local:**
```bash
bun test
nix flake check
```

**CI (GitHub Actions):**
- Runs `bun test` on PRs + pushes to `main`
- Installs Nix on the runner (tests include `nix develop` smoke)
- Emits JUnit + publishes annotations via `dorny/test-reporter`
- Manual trigger enabled (`workflow_dispatch`)

**Test structure:**
- `test/*.test.ts` - Unit + integration tests
- `fixtures/packs/core/` - Golden test fixture

---

## Git State

- ✅ Remote configured (`origin`)
- ✅ v2 templating + source-spec work pushed to `main`
- ⚠️ `.beads` sync currently unreliable (SQLite malformed on `bd sync --flush-only`)

---

## Next Agent Tasks

**Next ready issues (after completed `uim`, `1sz`, `6ch`):**
1. `2026-02-14-nexus-dyd` — mkRepo surface layout/cleanup/strictEnv options
2. `2026-02-14-nexus-xsf` — golden tests for v2 config-mode/mkRepo outputs
3. `2026-02-14-nexus-192` — migration UX warning for pack.json mode

**Remember:**
- No new markdown files (use bd for notes when healthy)
- Keep AGENTS.md updated with progress
- Land the plane before handoff

---

## Notes

- `bd sync --flush-only` fails with: `sqlite3: database disk image is malformed` (daemon/direct mode both impacted)
- Continue delivery with git as source of truth until beads storage is repaired
- v1 remains functional while v2 refactors continue
- PRD.md is the source of truth for v2

---

**Last updated:** 2026-02-15 16:22 UTC  
**Status:** v2 in progress; latest work landed and pushed
