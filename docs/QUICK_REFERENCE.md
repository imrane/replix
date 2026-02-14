# Quick Reference

## Setup Once (Choose One)

### A. Home Manager (Recommended - Auto-runs everywhere)

```nix
# ~/.config/home-manager/flake.nix or home.nix
{
  inputs.nexus.url = "path:/home/imrane/code/try/2026-02-14-nexus";
  
  # In your home-manager config:
  imports = [ nexus.homeManagerModules.default ];
  
  programs.nexus = {
    enable = true;
    autoRun = true;  # Auto-run when cd into pack.json dirs
  };
}
```

**After `home-manager switch`:**
- `cd` into any directory with `pack.json` → Nexus auto-runs
- Skills injected automatically

---

### B. Flake Registry (Global reference)

```bash
nix registry add nexus "path:/home/imrane/code/try/2026-02-14-nexus"
```

**Then in any project:**

```nix
{
  inputs.nexus.url = "nexus";  # Short reference
}
```

---

### C. Install to User Profile

```bash
nix profile install ~/code/try/2026-02-14-nexus
```

**Then:**
```bash
cd ~/my-project
nexus  # Available globally
```

---

## Use in Projects

### If Home Manager Auto-Run Enabled

Just `cd` into your project:

```bash
cd ~/my-project
# Nexus runs automatically if pack.json exists
```

---

### If Using Project Flake

```nix
# flake.nix
{
  inputs.nexus.url = "nexus";  # Or full path/URL
  
  outputs = { nixpkgs, nexus, ... }: {
    devShells.default = pkgs.mkShell {
      shellHook = ''
        ${nexus.packages.${system}.default}/bin/nexus
      '';
    };
  };
}
```

```bash
nix develop  # Runs nexus on shell entry
```

---

### Manual Run

```bash
cd ~/my-project
nexus
```

---

## Project Setup (Same for All Methods)

**1. Add `pack.json`:**

```json
{
  "id": "my-project",
  "version": "1.0.0",
  "imports": [],
  "enable": {
    "skills": ["humanizer"],
    "mcp": []
  }
}
```

**2. Add skills:**

```bash
mkdir -p skills/humanizer
# Add SKILL.md
```

**3. Done.**

`.claude/skills/humanizer/SKILL.md` auto-generated.

---

## What Happens

```
pack.json exists → Nexus loads config → Emits enabled items
  ↓
.claude/skills/
.mcp.json
.codex/config.toml
.opencode/commands/
```

---

## Portability

**Local Machine:**
- Use `path:` URL in flake inputs
- Home manager module for auto-activation

**Across Machines:**
1. Push nexus to GitHub
2. Update inputs: `nexus.url = "github:imrane/nexus"`
3. Same config works everywhere

**CI/CD:**
- Reference nexus flake in project
- No global install needed

---

## Boss's Workflow (Recommended)

**One-time (Dotfiles):**

```nix
# In your dotfiles flake.nix
{
  inputs.nexus.url = "github:imrane/nexus";  # After you push
  
  # In home.nix
  imports = [ nexus.homeManagerModules.default ];
  programs.nexus.enable = true;
  programs.nexus.autoRun = true;
}
```

**Every Project:**

```bash
cd ~/new-project
echo '{"id":"new-project","version":"1.0.0","imports":[],"enable":{"skills":[],"mcp":[]}}' > pack.json
mkdir -p skills
# Add skills as needed
```

**That's it.** Skills auto-inject when you `cd` into the directory.

---

## Commands

- `nexus` - Run in current directory (must have pack.json)
- `nix build .#nexus` - Build package from flake
- `nix flake check` - Run tests
- `bun test` - Run tests locally

---

## Files Generated (Do Not Edit)

- `.claude/` - Auto-managed by Nexus
- `.mcp.json` - Auto-managed
- `.codex/` - Auto-managed
- `.opencode/` - Auto-managed

All regenerated on every run (idempotent).
