# Nexus — dotfiles-first AI tooling for repos

[![CI](https://github.com/imrane/nexus/actions/workflows/ci.yml/badge.svg)](https://github.com/imrane/nexus/actions/workflows/ci.yml)
[![codecov](https://codecov.io/github/imrane/nexus/graph/badge.svg?token=VPKG1SPQRK)](https://codecov.io/github/imrane/nexus)

Define tooling once, enable per repo, emit client-native artifacts deterministically.

## What Nexus gives you

- Dotfiles-first config (`programs.nexus.*`)
- Pack-first distribution with per-repo enable selectors
- Multi-client emitters: Claude, OpenCode, Codex, MCP
- Idempotent output + cleanup ownership
- Reliability gates (lock drift, checksum/signature, doctor, golden gate)

---

## Mental model (60s)

1. Define packs/skills/MCP/artifacts in dotfiles.
2. In repo flake, call `nexus.lib.mkRepo` and set `enable.*` selectors.
3. Run Nexus to emit `.claude/*`, `.opencode/*`, `.codex/*`, `.mcp.json`.
4. Lock + doctor keep outputs reproducible and safe.

---

## Dotfiles (define once)

```nix
# ~/.config/home-manager/nexus.nix
{
  inputs.nexus.url = "github:imrane/nexus";
  imports = [ nexus.homeManagerModules.default ];

  programs.nexus = {
    enable = true;

    # pack-first
    packs = [
      { source = "github:your-org/nexus-pack?rev=<sha>"; }
      { source = "path:~/.config/nexus/packs/internal"; }
    ];

    # optional direct overrides
    skills.humanizer.source = "github:blader/humanizer?rev=<sha>";
    mcp.filesystem = {
      command = "npx";
      args = ["-y" "@modelcontextprotocol/server-filesystem" "${ENV:FS_ROOT}"];
    };

    # client-agnostic artifact namespace
    artifacts.commands."review.md" = {
      source = "path:~/.config/nexus/artifacts/commands/review.md";
    };

    vars = { FS_ROOT = "/home/imrane"; };
    strictEnv = true;
  };
}
```

Merge order: `packs < direct dotfiles defs` on key collision.

---

## Repo flake (enable per repo)

```nix
{
  inputs.nexus.url = "github:imrane/nexus";

  outputs = { nexus, ... }: {
    devShells.x86_64-linux.default = nexus.lib.mkRepo {
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

## Pack shape

A pack source must contain `pack.json`; optionally:

- `skills/<id>/SKILL.md`
- `mcp/servers.json`
- `opencode/command/*.md`, `opencode/hooks/*`, `opencode/agent/*.md`
- `commands/*.md`, `hooks/*`, `agents/*.md` (artifact ingestion path)

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
2. dotfiles `programs.nexus.vars`
3. file-backed vars
4. process env

File-backed sources:

- `<repo>/.nexus/vars/<VAR_NAME>`
- `/run/secrets/<VAR_NAME>`
- `/var/run/secrets/<VAR_NAME>`
- `*_FILE` env pointers (e.g. `API_TOKEN_FILE=/run/secrets/API_TOKEN`)

`strictEnv=true` (default) blocks unresolved vars.

---

## CLI

```bash
# Bootstrap
nexus init --client claude --with-lock

# Emit + verify
nexus --config .nexus/repo.json
nexus check --config .nexus/repo.json
nexus doctor --config .nexus/repo.json

# Locking
nexus lock update

# Non-Nix pack lifecycle (repo-local .nexus/packs.json)
nexus pack install github:owner/repo?rev=<sha>
nexus pack list
nexus pack uninstall github:owner/repo?rev=<sha>
nexus pack upgrade

# Reliability + support
nexus support bundle
nexus registry build [--out <dir>]

# Discovery/helpers
nexus list skills [--config <path>]
nexus list mcp [--config <path>]
nexus snippet --skills a,b --mcp x,y
nexus spec compile --in <snapshot.json> --out <schema.json>
```

---

## Reliability model

- `nexus.lock.json` captures pack version/rev/required vars/checksum
- Runtime compatibility gate blocks drift until `nexus lock update`
- Optional pack signatures:
  - set `signaturePublicKey` in pack source config
  - include `pack.sig` in pack root
  - lock/update verifies signature over integrity checksum
- Structured ops log: `.nexus/logs/events.ndjson`
- Support snapshot: `nexus support bundle` → `.nexus/support/*.json`
- Static pack registry: `nexus registry build` → `index.html` + `index.json`
- Golden release gate script + CI workflow for Linux/macOS

---

## Status

- ✅ v2 config mode is primary
- ✅ Pack-first registry enabled (`programs.nexus.packs`)
- ✅ Non-Nix lifecycle supported via `.nexus/packs.json`
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

- `NEXUS_CLIENT_SMOKE=1`
- `NEXUS_NIX_SMOKE=1`
- `NEXUS_GITHUB_INTEGRATION=1`

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
