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
**Status:** v2 config-mode is implemented and actively hardening; v1 pack mode remains as deprecated compatibility.

### Runtime Reality (what is shipping now)

**Implemented and tested:**
- Dotfiles registry resolution (`programs.nexus.skills` + `programs.nexus.mcp`)
- `mkRepo` enable flow + override merging
- Emitters: Claude, MCP, Codex (`.codex/config.toml` repo scope), OpenCode
- Codex conformance guard (schema + runtime defense-in-depth)
- OpenCode canonical singular dirs (`command/agent`) + legacy plural alias input support
- Claude parity files: commands/hooks/agents + `settings` + `settingsLocal`
- Templating (`${PROJECT_ROOT}`, `${ENV:VAR}`), layout modes, cleanup strategies
- State hash idempotency + owned-only cleanup

**Tests:** 74 passing
- Unit + integration + golden coverage
- Optional gated client smoke (`NEXUS_CLIENT_SMOKE=1`)

**Key Files:**
- `src/runNexus.ts` - config-mode orchestration + runtime guards
- `src/configSchema.ts` - schema validation + codex path conformance
- `src/resolver/dotfilesConfig.ts` - dotfiles registry loader
- `src/emitters/` - Claude, MCP, Codex, OpenCode emitters
- `src/state.ts`, `src/stateFile.ts` - idempotency and persistence
- `src/cleanup.ts` - owned-only/full cleanup

---

### v2 Architecture (source of truth)

See **PRD.md** for product requirements and trajectory.

**Key Changes (still true):**
- **No local config** in projects by default
- **Dotfiles-first** registry
- **mkRepo API** for per-repo enablement
- **Override via inputs** for repo-specific skill sources
- **Pack system** scoped to publishable/importable libraries

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
  clients = [ "claude" ];
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
- ✅ `.beads` sync repaired and committed (`bddcf55`)

---

## Next Agent Tasks

**Current priority queue (spec-first):**
1. `2026-02-14-nexus-zjl` — Claude Code artifact spec audit (commands/hooks/agents/settings)
2. `2026-02-14-nexus-7op` — Codex artifact/config spec audit
3. `2026-02-14-nexus-3co` — Codex skills surface + shim adapter audit (canonical → codex)
4. `2026-02-14-nexus-d38` — CI: gated client smoke tests
5. `2026-02-14-nexus-m1i` — automate upstream release/spec drift detection
6. `2026-02-14-nexus-3tv` — AI-assisted spec compiler (docs/repo → typed schema)

**Recently closed:**
- `2026-02-14-nexus-pry` (Codecov upload + README badge)
- `2026-02-14-nexus-rrq` (per-client custom injection)
- `2026-02-14-nexus-0qi` (OpenCode parity slice landed, pending strict conformance audit)

**Remember:**
- No new markdown files (use bd for notes when healthy)
- Keep AGENTS.md concise + current
- Land the plane before handoff

---

## Notes (decisions)

- **OpenCode path alignment (2026-02-15):** upstream `anomalyco/opencode` uses `.opencode/command` + `.opencode/agent` (singular). Nexus now emits/loads these canonical dirs and keeps `commands/agents` as *read-only aliases* for backward compatibility. Rationale: match upstream by default while not breaking existing packs.
- **Codex scope decision (2026-02-15):** keep Nexus core Codex support as **repo `.codex/config.toml` only**. Codex has a separate skills surface (`.agents/skills` and `.codex/skills`) with different metadata expectations; we’ll treat this as a future client-plugin concern.
- **Codex conformance guard (2026-02-16):** this is now enforced in two places: (1) schema parse (`config.enable.clients.codex.files` accepts only `.codex/config.toml`), and (2) runtime injection guard in `runNexus` (defense-in-depth).
- **Testing decision:** keep fast, deterministic golden/schema/cleanup/state tests as the always-on suite; add **gated client smoke tests** (env-var opt-in) when non-interactive validation exists and no auth is required.
- **TDD calibration (Boss directive, 2026-02-16):** maintain lean TDD for conformance work—one failing test per behavior change, avoid harness churn, and prefer code-heavy diffs once behavior is locked.
- **Codex conformance hardening (2026-02-16):** repo support stays strict to `.codex/config.toml`; in pack mode, emit ownership marker only (no speculative default sections like `[skills]`).
- **CLI usability gap captured (2026-02-16):** added P1 tasks for `list skills/mcp` and flake snippet helper; added P2 task for first-class command/agent enable ergonomics beyond raw `enable.clients.<client>.files` paths.

PRD.md remains source of truth for v2 goals.

---

## Notes (new learnings / references)

- **Claude settings files (repo scope):** support both `.claude/settings.json` and `.claude/settings.local.json` as first-class dotfiles conveniences (`claude.settings` / `claude.settingsLocal`). Docs: https://code.claude.com/docs/en/settings
- **Keep Nexus minimal:** Openboot has a good *layering + selective include* concept for agent references, but Nexus should not grow into stack autodetect/orchestration. Repo: https://github.com/treadiehq/openboot
- **MCP ergonomics:** tools like EveryMCP are great for imperative “patch my agents now”, but Nexus stays declarative (dotfiles + mkRepo). Repo: https://github.com/am-will/everymcp

---

**Last updated:** 2026-02-16 04:36 UTC  
**Status:** v2 config-mode shipping with 74 green tests; focus is CLI ergonomics + drift detection + selective source includes while preserving strict declarative scope
