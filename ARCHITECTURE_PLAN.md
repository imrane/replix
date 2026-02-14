# Architecture Plan: Dotfiles-Based Design

## Current Issues

1. **pack.json is project-local** → clutters repos, config duplication
2. **Skills stored per-project** → can't share across projects easily
3. **Manual config in each repo** → not portable

## New Design (Boss's Vision)

### User Dotfiles: Skill Library

User maintains skill definitions in dotfiles:

```nix
# ~/.config/home-manager/nexus.nix
{
  programs.nexus = {
    enable = true;
    
    # Global skill library
    skills = {
      humanizer = {
        source = "github:blader/humanizer";
        # Or local: source = "path:/path/to/skill";
      };
      repo-status = {
        source = "path:/home/imrane/.config/nexus/skills/repo-status";
      };
    };
    
    # Global MCP servers
    mcp = {
      filesystem = {
        command = "npx";
        args = ["-y" "@modelcontextprotocol/server-filesystem" "/home"];
      };
    };
  };
}
```

### Project: Enable Only

Project flakes just **enable** what they want:

```nix
# ~/my-project/flake.nix
{
  inputs.nexus.url = "github:imrane/nexus";
  
  outputs = { nexus, ... }: {
    devShells.default = pkgs.mkShell {
      shellHook = ''
        ${nexus.lib.inject {
          skills = [ "humanizer" "repo-status" ];
          mcp = [ "filesystem" ];
        }}
      '';
    };
  };
}
```

### Project: Override with Custom Skill

```nix
# ~/my-project/flake.nix
{
  inputs = {
    nexus.url = "github:imrane/nexus";
    custom-skill.url = "github:someone/custom-skill";
  };
  
  outputs = { nexus, custom-skill, ... }: {
    devShells.default = pkgs.mkShell {
      shellHook = ''
        ${nexus.lib.inject {
          skills = [ 
            "humanizer"  # From dotfiles
            { name = "custom"; source = custom-skill; }  # Override
          ];
        }}
      '';
    };
  };
}
```

## Implementation Tasks

### Phase 1: Refactor Config Source
- [ ] Remove pack.json requirement
- [ ] Read config from home-manager module instead
- [ ] Support skill definitions with source URLs (github:, path:)
- [ ] Fetch skills from sources at runtime

### Phase 2: Flake API
- [ ] Create `nexus.lib.inject` function
- [ ] Accept enable list + optional overrides
- [ ] Merge dotfiles skills with project overrides
- [ ] Emit to .claude/skills/ as before

### Phase 3: Skill Fetching
- [ ] Fetch github: sources via nix flake
- [ ] Cache fetched skills (nix store)
- [ ] Support path: for local skills
- [ ] Validate SKILL.md exists in source

### Phase 4: Migration Path
- [ ] Document migration from pack.json to dotfiles
- [ ] Add compat layer (read pack.json if exists, warn deprecated)
- [ ] Remove compat layer after transition

## Example Flow

**User setup (once):**
```bash
# In dotfiles
programs.nexus.skills.humanizer.source = "github:blader/humanizer";
home-manager switch
```

**Project use:**
```bash
cd ~/my-project
# In flake.nix: enable = [ "humanizer" ];
nix develop
# → .claude/skills/humanizer/SKILL.md auto-generated
```

**No local config needed.**

## Benefits

✅ Skills managed centrally in dotfiles  
✅ Projects just enable what they need  
✅ Easy to share skills across projects  
✅ Override per-project when needed  
✅ No clutter in project repos  
✅ Portable: same dotfiles → same skills everywhere

## Breaking Change

This is a **major architectural shift**. Current users with pack.json will need to:
1. Move skill definitions to dotfiles
2. Update projects to use flake-based enable
3. Remove pack.json

Suggest: ship as v2.0.0 with migration guide.
