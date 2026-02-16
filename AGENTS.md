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
**Status:** v2 config-mode is implemented and actively hardening; v1 pack mode is queued for removal (no deprecation rollout needed before removal).

### ⚠️ Engineering Warning (Boss directive — 2026-02-16)

The implementation has drifted into **over-engineering** for the core job (compile canonical pack spec to client-native artifacts). Delivery speed is being hurt by layered transitional abstractions and dual-mode compatibility paths.

**What must happen now (non-optional):**
1. **Ship thin vertical slices** from canonical spec → client-native outputs (starting with OpenCode skills + MCP native config).
2. **Reduce orchestration complexity** in `runNexus.ts` by moving to one deterministic compile plan + emit path.
3. **Remove/cordon legacy paths** (pack mode + env/plugin compatibility shims) behind explicit compatibility gates, then delete.
4. **Keep tests high-signal**: golden behavior tests over combinatorial architecture tests.
5. **No new abstractions without immediate payoff** to current refactor goals.

If work increases moving parts without reducing branches/LOC in the hot path, stop and redesign simpler.

### Runtime Reality (what is shipping now)

**Implemented and tested:**
- Dotfiles registry resolution (`programs.nexus.skills` + `programs.nexus.mcp`)
- `mkRepo` enable flow + override merging
- Emitters: Claude, MCP, Codex, OpenCode
- **Single-source MCP compilation**: canonical MCP definitions compile to `.mcp.json`, `opencode.json`, and Codex MCP config generation
- Codex conformance guard (schema + runtime defense-in-depth)
- OpenCode canonical singular dirs (`command/agent`) + legacy plural alias input support
- Claude parity files: commands/hooks/agents + `settings` + `settingsLocal`
- Templating (`${PROJECT_ROOT}`, `${ENV:VAR}`), layout modes, cleanup strategies
- State hash idempotency + owned-only cleanup

**Tests:** Passing (default suite trimmed + fast)
- Behavior/golden/integration focus
- Optional gated heavy suites: `NEXUS_CLIENT_SMOKE=1`, `NEXUS_NIX_SMOKE=1`, `NEXUS_GITHUB_INTEGRATION=1`

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

**Transition plan (updated):**
1. Continue v2 API hardening (canonical graph + adapters)
2. Keep v1 pack mode only as short-lived compatibility while refactor lands
3. Queue v1 pack mode for direct removal (no staged deprecation warnings required)
4. Keep migration notes concise in README/PRD for any remaining early users

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

**Current priority queue (refactor-first):**
1. `2026-02-14-nexus-1qi` — Refactor sequence guardrail: OpenCode first, then shared adapter contract
2. `2026-02-14-nexus-m1i` — automate upstream release/spec drift detection (**in_progress**)
3. `2026-02-14-nexus-3tv` — AI-assisted spec compiler (docs/repo → typed schema) (**in_progress**)

**Recently closed:**
- `2026-02-14-nexus-9dy` (runNexus collapsed into compile-plan + emit pipeline - 2026-02-16)
- `2026-02-14-nexus-n4j` (legacy compatibility surfaces gated behind env flags - 2026-02-16)
- `2026-02-14-nexus-0uk` (selective github source includes via `?include=` + tests/docs)
- `2026-02-14-nexus-6pg` (OpenCode native outputs parity: skills + MCP from canonical enable lists)
- `2026-02-14-nexus-fu5` (test suite trimmed to high-signal behavior/golden core; heavy suites gated)
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
- **Codex scope decision (updated 2026-02-16):** Codex selectors remain **no-op** at canonical selector mapping level, but codex outputs are now compiled from canonical skill/MCP inputs.
- **Codex conformance guard (updated 2026-02-16):** unsupported Codex repo paths are rejected; codex skill emission target is `.agents/skills/**`; direct injection of `.codex/config.toml` via `clients.codex.files` is blocked to keep a single MCP source.
- **Testing decision:** keep fast, deterministic golden/schema/cleanup/state tests as the always-on suite; add **gated client smoke tests** (env-var opt-in) when non-interactive validation exists and no auth is required.
- **TDD calibration (Boss directive, 2026-02-16):** maintain lean TDD for conformance work—one failing test per behavior change, avoid harness churn, and prefer code-heavy diffs once behavior is locked.
- **Codex conformance hardening (2026-02-16):** repo support stays strict to `.codex/config.toml`; in pack mode, emit ownership marker only (no speculative default sections like `[skills]`).
- **CLI usability gap captured (2026-02-16):** added P1 tasks for `list skills/mcp` and flake snippet helper; added P2 task for first-class command/agent enable ergonomics beyond raw `enable.clients.<client>.files` paths.
- **Problems encountered during ship push (2026-02-16):**
  - duplicate-path failures when canonical selectors and explicit client file lists targeted the same OpenCode output path
  - split MCP paths (canonical + client-file overrides) risked two sources of truth
  - heavy test matrix (nix/github/client smoke always-on) slowed iteration signal
- **Cleanup rationale applied (2026-02-16):**
  - enforce one canonical MCP source and compile to each client output
  - block codex `.codex/config.toml` direct injection via `clients.codex.files`
  - trim low-signal tests; gate expensive suites behind env flags
- **Architecture direction (2026-02-16, Boss):** move to one canonical pack/artifact spec (skills, MCP, hooks, commands, agents, settings) compiled by `mkRepo` into client-specific outputs; treat file-path client injection as temporary compatibility.
- **Removal policy (2026-02-16, Boss):** since adoption is still pre-launch, do not spend cycles on formal deprecation rollout; queue legacy surfaces (notably pack.json mode and path-first client-file APIs) for clean removal as canonical/plugin architecture lands.
- **Plugin split direction (2026-02-16, Boss):** clients are moving into separate plugin units; prioritize core canonical graph + adapter interface first, then peel built-ins into standalone plugins on that interface.
- **Adapter groundwork started (2026-02-16):** added selector adapter contract (`src/adapters/types.ts`) and built-in adapters for Claude (`src/adapters/claude.ts`), OpenCode (`src/adapters/opencode.ts`), and Codex (`src/adapters/codex.ts`), with registry lookup (`src/adapters/registry.ts`) used by `runNexus` for canonical selector → client path mapping. Current Codex adapter is intentionally selector-noop because codex repo scope in Nexus remains `.codex/config.toml` only.
- **Compile-stage extraction started (2026-02-16):** selector planning was moved out of `runNexus` into `src/compile/clientPaths.ts` (`resolveCanonicalSelectorPaths` + `resolveEnabledClientPaths`) with focused tests (`test/clientPathsCompile.test.ts`) to make plugin extraction mechanical.
- **Concise handoff (2026-02-16):** canonical selectors are now first-class (`enable.commands/hooks/agents/settings`), adapter registry covers built-ins (claude/opencode/codex), and codex selector mapping remains intentionally empty until codex plugin scope expands beyond `.codex/config.toml`.
- **Important gap (2026-02-16):** unification is currently complete at the *project enable* layer, but dotfiles authoring is still mixed (`claude.*` + `clients.<client>.files`); a truly client-agnostic dotfiles `artifacts.*` schema is still pending.
- **mkRepo DX fix (2026-02-16):** `nexus.lib.mkRepo` now infers `pkgs` + `nexusPackage` by default from flake context; callers can still override explicitly.
- **Drift check command (2026-02-16):** added `nexus check --config <path>` to detect output drift without mutating the working repo (CI-friendly non-zero exit + ADD/MODIFY/REMOVE report).
- **Selector guardrail (2026-02-16):** canonical selector paths are now filtered by client-defined file defs to prevent cross-client failures when only one client defines a selector target.
- **Claude skill copy hardening (2026-02-16):** emitter now skips VCS metadata directories (`.git/.hg/.svn`) to avoid permission/runtime issues when copying cached git sources.
- **Codex audit artifacts (2026-02-16):** added `fixtures/codex-surface-matrix.json` + shim fixture (`fixtures/codex-skill-shim`) + tests to lock current policy.

PRD.md remains source of truth for v2 goals.

---

## Notes (new learnings / references)

- **Claude settings files (repo scope):** support both `.claude/settings.json` and `.claude/settings.local.json` as first-class dotfiles conveniences (`claude.settings` / `claude.settingsLocal`). Docs: https://code.claude.com/docs/en/settings
- **Keep Nexus minimal:** Openboot has a good *layering + selective include* concept for agent references, but Nexus should not grow into stack autodetect/orchestration. Repo: https://github.com/treadiehq/openboot
- **MCP ergonomics:** tools like EveryMCP are great for imperative “patch my agents now”, but Nexus stays declarative (dotfiles + mkRepo). Repo: https://github.com/am-will/everymcp
- **Codecov private repo token:** CI already reads `secrets.CODECOV_TOKEN` in `.github/workflows/ci.yml`; set it at repo settings → Secrets and variables → Actions.

---

## Session Delta (2026-02-16, concise)
- **Refactor complete (9dy + n4j):**
  - Collapsed `runNexus.ts` from 360+ lines to ~60 lines via compile-plan + emit pipeline abstraction
  - Extracted `src/compile/plan.ts` (unified EmitPlan type + compilers for config/pack modes)
  - Extracted `src/compile/emit.ts` (pure emission logic consuming plan)
  - Gated pack.json mode behind `NEXUS_DISABLE_PACK_MODE=1` env flag
  - Gated legacy plugin env vars behind `NEXUS_DISABLE_LEGACY_ENV=1` env flag with deprecation warnings
  - All 89 tests remain green; no regressions
- Previous session (closed epic `nexus-9yh`):
  - `src/clientPlugins/*` (client path normalize/validate hooks)
  - `src/outputPlugins/*` (emission + desiredPaths plugin hooks)
  - external plugin loader and dotfiles-first plugin registry (`programs.nexus.plugins`)
  - README upgraded with canonical selectors examples
  - Pack fixture expanded with `{commands,hooks,agents}` examples
- `3tv` progress:
  - typed intermediate schema parser (`src/specSchema.ts`)
  - compiler layer (`src/specCompiler.ts`) + CLI (`scripts/spec-compile.ts`)
  - CLI command `nexus spec compile --in <snapshot.json> --out <schema.json>`
- Current test baseline: `89 pass, 0 fail`.

**Last updated:** 2026-02-16 23:12 UTC  
**Status:** v2 config-mode shipping with pluginized client/output architecture; runNexus refactored into compile-plan + emit pipeline with legacy compatibility gated behind env flags.
