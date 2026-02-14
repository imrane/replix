# Agent Instructions (Nexus)

This repo uses **bd** (beads) for tasks.

## Repo Policy
- **Bun + TypeScript** for implementation + tests.
- **No markdown sprawl**: record decisions inside the *relevant bd issue* (update the issue description). No DECISIONS.md, no extra docs.
- Keep this single **AGENTS.md** as the only persistent “handoff/state” file.

## Quick Reference

```bash
bd ready
bd show <id>
bd update <id> --status in_progress
bd close <id>

bun test
```

## Current State (update when handing off)
- Repo: `/home/imrane/src/tries/2026-02-14-nexus`
- Beads initialized: `.beads/`
- Implementation decision: **Bun TS runner invoked by Nix devShell.shellHook** (see bd issue `2026-02-14-nexus-230`).

## Landing the Plane
1. Run tests: `bun test`
2. `bd sync`
3. Commit with issue ids in the message (e.g. `feat: emitter claude (2026-02-14-nexus-8eh)`)
