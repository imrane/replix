# Replix — dotfiles-first AI tooling for repos

[![CI](https://github.com/imrane/replix/actions/workflows/ci.yml/badge.svg)](https://github.com/imrane/replix/actions/workflows/ci.yml)
[![codecov](https://codecov.io/github/imrane/replix/graph/badge.svg?token=VPKG1SPQRK)](https://codecov.io/github/imrane/replix)

Define tooling once, enable per repo, emit client-native artifacts deterministically.

## What Replix gives you

- Dotfiles-first config (`programs.replix.*`)
- Pack-first distribution with per-repo enable selectors
- Multi-client emitters: Claude, OpenCode, Codex, MCP
- Idempotent output + cleanup ownership
- Reliability gates (lock drift, checksum/signature, doctor, golden gate)

---

## Mental model (60s)

1. Define packs/skills/MCP/artifacts in dotfiles.
2. In repo flake, call `replix.lib.mkRepo` and set `enable.*` selectors.
3. Run Replix to emit `.claude/*`, `.opencode/*`, `.codex/*`, `.mcp.json`.
4. Lock + doctor keep outputs reproducible and safe.

---

## Dotfiles (define once)

```nix
# ~/.config/home-manager/replix.nix
{
  inputs.replix.url = "github:imrane/replix";
  imports = [ replix.homeManagerModules.default ];

  programs.replix = {
    enable = true;

    # pack-first
    packs = [
      { source = "github:your-org/replix-pack?rev=<sha>"; }
      { source = "path:~/.config/replix/packs/internal"; }

      # DX alias: source + folder/folders (normalized to github ?include=...)
      # lets you pull specific pack directories from one repo without long URLs.
      {
        source = "github:imrane/replix";
        folders = [
          "fixtures/packs/examples/starter"
          "fixtures/packs/examples/security"
        ];
        allowUnpinned = true;
      }

      # Alias import via repo index (replix.index.json):
      # { "packs": { "starter": "fixtures/packs/examples/starter" } }
      { source = "github:imrane/replix"; pack = "starter"; allowUnpinned = true; }
    ];

    # You can inspect aliases before using them:
    # replix pack list-aliases github:imrane/replix


    # optional direct overrides
    skills.humanizer.source = "github:blader/humanizer?rev=<sha>";
    mcp.filesystem = {
      command = "npx";
      args = ["-y" "@modelcontextprotocol/server-filesystem" "${ENV:FS_ROOT}"];
    };

    # client-agnostic artifact namespace
    artifacts.commands."review.md" = {
      source = "path:~/.config/replix/artifacts/commands/review.md";
    };

    vars = { FS_ROOT = "/home/your-user"; };
    strictEnv = true;
  };
}
```

Merge order: `packs < direct dotfiles defs` on key collision.

---

## Repo flake (enable per repo)

```nix
{
  inputs.replix.url = "github:imrane/replix";

  outputs = { replix, ... }: {
    devShells.x86_64-linux.default = replix.lib.mkRepo {
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
    };
  };
}
```

Then:

```bash
nix develop
```

---

## Pack shape (canonical v1 draft)

A canonical pack must define `pack.json` with:

- `specVersion: "replix.canonical.v1-draft"`
- `references` map (source of truth for what to compile)

Example references:

```json
{
  "references": {
    "skills": ["skills/reviewer/SKILL.md"],
    "commands": ["commands/review-pr.md"],
    "agents": ["agents/reviewer.md"],
    "hooks": ["hooks/before-tool.json"],
    "mcp": ["mcp/servers.json"]
  }
}
```

Files are still stored under pack folders (`skills/`, `commands/`, `agents/`, `hooks/`, `mcp/`), but compilation reads `references` first and validates file existence/type.

In-repo examples:

- `fixtures/packs/examples/starter`
- `fixtures/packs/examples/security`
- `fixtures/packs/examples/content`
- `fixtures/packs/examples/dataops`

---

## Unified enable selectors

Primary selectors in `enable`:

- `skills`, `mcp`, `commands`, `hooks`, `agents`, `settings`

Artifact authoring namespace in dotfiles:

- `artifacts.commands`, `artifacts.hooks`, `artifacts.agents`, `artifacts.settings`, `artifacts.settingsLocal`

Legacy `claude.*` artifacts are accepted for compatibility.

---

## Output surfaces

| Client | Output |
|---|---|
| Claude | `.claude/skills/*`, `.claude/commands/*`, `.claude/hooks/*`, `.claude/agents/*`, `.claude/settings.json`, `.claude/settings.local.json` |
| OpenCode | `.opencode/skills/*`, `.opencode/command/*`, `.opencode/hooks/*`, `.opencode/agent/*`, `opencode.json` |
| Codex | `.codex/config.toml`, `.agents/skills/*` |
| MCP | `.mcp.json` |

Canonical MCP is compiled once, then emitted to all client-native targets.

---

## Secrets and templating

Templates:

- `${PROJECT_ROOT}`
- `${VAR}`
- `${ENV:VAR}`

Resolution precedence (high → low):

1. repo config `vars`
2. dotfiles `programs.replix.vars`
3. file-backed vars
4. process env

File-backed sources:

- `<repo>/.replix/vars/<VAR_NAME>`
- `/run/secrets/<VAR_NAME>`
- `/var/run/secrets/<VAR_NAME>`
- `*_FILE` env pointers (e.g. `API_TOKEN_FILE=/run/secrets/API_TOKEN`)

`strictEnv=true` (default) blocks unresolved vars.

---

## CLI

```bash
# Bootstrap
replix init --client claude --with-lock

# Emit + verify
replix --config .replix/repo.json
replix check --config .replix/repo.json
replix doctor --config .replix/repo.json

# Locking
replix lock update

# Non-Nix pack lifecycle (repo-local .replix/packs.json)
replix pack install github:owner/repo?rev=<sha>
replix pack list
replix pack uninstall github:owner/repo?rev=<sha>
replix pack upgrade

# Reliability + support
replix support bundle
replix registry build [--out <dir>]

# Canonical compile + validation gates
replix compile canonical --client <claude|opencode|codex> [--pack <path>] [--fail-on-warn]
replix spec validate-canonical-pack [--pack <path>]
replix spec validate-client-shapes [--max-age-days N]

# Self-healing compile loop (TS-first AI hook)
replix compile self-heal --config .replix/repo.json --max-attempts 3 \
  --client <claude|opencode|codex> --client-log <path> \
  --ai-fix-ts <script.ts>

# Discovery/helpers
replix list skills [--config <path>]
replix list mcp [--config <path>]
replix snippet --skills a,b --mcp x,y
replix spec compile --in <snapshot.json> --out <schema.json>
```

---

## Reliability model

- `replix.lock.json` captures pack version/rev/required vars/checksum
- Runtime compatibility gate blocks drift until `replix lock update`
- Optional pack signatures:
  - set `signaturePublicKey` in pack source config
  - include `pack.sig` in pack root
  - lock/update verifies signature over integrity checksum
- Structured ops log: `.replix/logs/events.ndjson`
- Client-specific self-heal log parsers in plugins (`src/clientPlugins/*/selfHealLog.ts`)
- Support snapshot: `replix support bundle` → `.replix/support/*.json`
- Static pack registry: `replix registry build` → `index.html` + `index.json`
- Canonical compile quality gates: warning summary + `--fail-on-warn`
- Canonical pack validator + client shape provenance validator
- Golden release gate script + CI workflow for Linux/macOS

### New canonical process (author -> compile -> validate -> self-heal)

1. **Author canonical pack only** (`specVersion` + `references` in `pack.json`).
2. **Compile plan per client** with `replix compile canonical --client ...`.
3. **Gate quality** using `--fail-on-warn` in CI.
4. **Validate canonical shape** (`replix spec validate-canonical-pack`).
5. **Validate client snapshot provenance/freshness** (`replix spec validate-client-shapes`).
6. **Run bounded self-heal** (`replix compile self-heal ... --ai-fix-ts ...`) when compilation/runtime issues appear.
7. **Escalate to human** when loop can’t recover within max attempts (see `.replix/self-heal/last-report.json`).

---

## Status

- ✅ v2 config mode is primary
- ✅ Pack-first registry enabled (`programs.replix.packs`)
- ✅ Non-Nix lifecycle supported via `.replix/packs.json`
- ✅ Lock/checksum/signature reliability gates active
- ✅ Support bundle + structured logs + static registry generator shipped
- ✅ Golden reliability gate shipped (`scripts/release-gate.ts`, workflow)
- ⚠️ Legacy repo-local `pack.json` fallback remains compatibility-only (planned removal)

See `PRD.md` for roadmap and `AGENTS.md` for handoff state.

---

## Development

```bash
bun test
bun run test:coverage
bun run test:release-gate
nix flake check
```

Optional gated suites:

- `REPLIX_CLIENT_SMOKE=1`
- `REPLIX_NIX_SMOKE=1`
- `REPLIX_GITHUB_INTEGRATION=1`

---

## Contributing policy

Only these markdown files are allowed:

1. `README.md`
2. `PRD.md`
3. `AGENTS.md`

Use beads (`bd`) for all other notes/tasks.

---

## License

MIT
