# Global Nexus Setup

Make Nexus available everywhere with one-time dotfiles configuration.

---

## Setup: Add to Flake Registry (Recommended)

**1. Add Nexus to your user flake registry:**

```bash
nix registry add nexus "path:/home/imrane/code/try/2026-02-14-nexus"
```

Or in your dotfiles `flake.nix`:

```nix
{
  inputs = {
    nixpkgs.url = "github:NixOS/nixpkgs/nixos-unstable";
    home-manager.url = "github:nix-community/home-manager";
    
    # Add nexus
    nexus.url = "path:/home/imrane/code/try/2026-02-14-nexus";
  };

  outputs = { nixpkgs, home-manager, nexus, ... }: {
    # Your existing config...
  };
}
```

**2. Enable in Home Manager:**

```nix
# home.nix or similar
{ config, pkgs, nexus, ... }:

{
  imports = [
    nexus.homeManagerModules.default
  ];

  programs.nexus = {
    enable = true;
    autoRun = true;  # Auto-run when cd'ing into pack.json directories
  };
}
```

**3. Rebuild:**

```bash
home-manager switch
```

---

## Now Use in Any Project

### Option 1: Auto-Run (via Home Manager)

If you enabled `autoRun = true`, just `cd` into any directory with `pack.json`:

```bash
cd ~/my-project
# Nexus auto-runs if pack.json exists
```

### Option 2: Project Flake (Explicit)

```nix
# flake.nix in your project
{
  inputs = {
    nixpkgs.url = "github:NixOS/nixpkgs/nixos-unstable";
    nexus.url = "nexus";  # Uses registry entry
  };

  outputs = { self, nixpkgs, nexus }:
    let
      system = "x86_64-linux";
      pkgs = nixpkgs.legacyPackages.${system};
    in {
      devShells.${system}.default = pkgs.mkShell {
        packages = [ nexus.packages.${system}.default ];
        
        shellHook = ''
          nexus
        '';
      };
    };
}
```

### Option 3: Manual (If Installed Globally)

```bash
cd ~/my-project
nexus
```

---

## Example: Minimal Project Setup

**1. Add `pack.json` to your repo:**

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
# Copy SKILL.md or create your own
```

**3. Enter directory:**

```bash
cd ~/my-project
# If autoRun enabled: nexus runs automatically
# Otherwise: nix develop (if you added shellHook)
```

**4. Claude Code picks up skills:**

```
.claude/skills/humanizer/SKILL.md  ← Auto-generated
```

---

## Flake Registry Shortcut

Once nexus is in your registry, you can reference it anywhere as just `nexus`:

```nix
inputs.nexus.url = "nexus";  # Instead of full path
```

---

## NixOS System-Wide (Optional)

If you want nexus available system-wide (not just user):

```nix
# /etc/nixos/configuration.nix
{ config, pkgs, ... }:

let
  nexus = (builtins.getFlake "path:/home/imrane/code/try/2026-02-14-nexus").packages.${pkgs.system}.default;
in {
  environment.systemPackages = [ nexus ];
}
```

---

## Portability Across Machines

**Option A: GitHub (Recommended)**

1. Push nexus to GitHub
2. Update all references:
   ```nix
   nexus.url = "github:imrane/nexus";
   ```

**Option B: Local Path with Dotfiles**

Keep nexus in a standard location on all machines:
- `~/dotfiles/tools/nexus/`
- Reference via consistent path in home-manager

**Option C: Nix Store (Most Portable)**

Build and install via Nix:
```bash
nix profile install ~/code/try/2026-02-14-nexus
```

Then `nexus` is available everywhere.

---

## Troubleshooting

**"nexus: command not found"**
- Run `home-manager switch` or `nixos-rebuild switch`
- Check `which nexus` after rebuild

**"No pack.json found"**
- Nexus only runs in directories with `pack.json`
- Create one: `echo '{"id":"test","version":"1.0.0","imports":[],"enable":{"skills":[],"mcp":[]}}' > pack.json`

**Auto-run not working**
- Check `programs.nexus.autoRun = true` in home-manager config
- Source your shell config: `source ~/.bashrc` or restart shell

---

## What Gets Installed

- ✅ `nexus` command globally available
- ✅ Shell hooks for auto-activation (if enabled)
- ✅ Home-manager module for easy configuration
- ✅ Flake package for downstream repos

---

**Next**: Add `pack.json` to any project and Nexus handles the rest.
