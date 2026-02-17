{ config, lib, pkgs, ... }:

with lib;

let
  cfg = config.programs.nexus;
in {
  options.programs.nexus = {
    enable = mkEnableOption "Nexus agent skill manager";

    package = mkOption {
      type = types.package;
      default = pkgs.callPackage ../package.nix {};
      description = "The nexus package to use";
    };

    autoRun = mkOption {
      type = types.bool;
      default = true;
      description = "Automatically run nexus when entering directories with pack.json";
    };

    packs = mkOption {
      type = types.listOf (types.submodule ({ ... }: {
        options = {
          source = mkOption {
            type = types.str;
            description = "Pack source (path:... or github:... pinned). Must resolve to a directory containing pack.json.";
          };
          allowUnpinned = mkOption { type = types.bool; default = false; };
        };
      }));
      default = [];
      description = "Pack-first registry inputs. Packs are loaded first, then direct skills/mcp/client defs can override.";
    };

    # v2 direction: dotfiles registry (skills + MCP servers)
    skills = mkOption {
      type = types.attrsOf (types.submodule ({ ... }: {
        options = {
          source = mkOption {
            type = types.str;
            description = "Skill source (path:... or pinned github:owner/repo@rev[#subdir])";
          };
          description = mkOption { type = types.nullOr types.str; default = null; };
          tags = mkOption { type = types.listOf types.str; default = []; };
          allowUnpinned = mkOption { type = types.bool; default = false; };
        };
      }));
      default = {};
      description = "Global skill registry (dotfiles-first).";
    };

    mcp = mkOption {
      type = types.attrsOf (types.submodule ({ ... }: {
        options = {
          command = mkOption { type = types.str; };
          args = mkOption { type = types.listOf types.str; default = []; };
          env = mkOption { type = types.attrsOf types.str; default = {}; };
        };
      }));
      default = {};
      description = "Global MCP server registry (dotfiles-first).";
    };

    artifacts = mkOption {
      type = types.submodule ({ ... }: {
        options = {
          commands = mkOption { type = types.attrsOf (types.submodule ({ ... }: { options = {
            text = mkOption { type = types.nullOr types.str; default = null; };
            source = mkOption { type = types.nullOr types.str; default = null; };
            mode = mkOption { type = types.nullOr types.str; default = null; };
            executable = mkOption { type = types.bool; default = false; };
            allowUnpinned = mkOption { type = types.bool; default = false; };
          }; })); default = {}; };
          hooks = mkOption { type = types.attrsOf (types.submodule ({ ... }: { options = {
            text = mkOption { type = types.nullOr types.str; default = null; };
            source = mkOption { type = types.nullOr types.str; default = null; };
            mode = mkOption { type = types.nullOr types.str; default = null; };
            executable = mkOption { type = types.bool; default = false; };
            allowUnpinned = mkOption { type = types.bool; default = false; };
          }; })); default = {}; };
          agents = mkOption { type = types.attrsOf (types.submodule ({ ... }: { options = {
            text = mkOption { type = types.nullOr types.str; default = null; };
            source = mkOption { type = types.nullOr types.str; default = null; };
            mode = mkOption { type = types.nullOr types.str; default = null; };
            executable = mkOption { type = types.bool; default = false; };
            allowUnpinned = mkOption { type = types.bool; default = false; };
          }; })); default = {}; };
          settings = mkOption { type = types.nullOr (types.submodule ({ ... }: { options = {
            text = mkOption { type = types.nullOr types.str; default = null; };
            source = mkOption { type = types.nullOr types.str; default = null; };
            mode = mkOption { type = types.nullOr types.str; default = null; };
            executable = mkOption { type = types.bool; default = false; };
            allowUnpinned = mkOption { type = types.bool; default = false; };
          }; })); default = null; };
          settingsLocal = mkOption { type = types.nullOr (types.submodule ({ ... }: { options = {
            text = mkOption { type = types.nullOr types.str; default = null; };
            source = mkOption { type = types.nullOr types.str; default = null; };
            mode = mkOption { type = types.nullOr types.str; default = null; };
            executable = mkOption { type = types.bool; default = false; };
            allowUnpinned = mkOption { type = types.bool; default = false; };
          }; })); default = null; };
        };
      });
      default = {};
      description = "Client-agnostic artifact definitions (commands/hooks/agents/settings).";
    };

    plugins = mkOption {
      type = types.attrsOf (types.submodule ({ ... }: {
        options = {
          module = mkOption {
            type = types.str;
            description = "Plugin module specifier (path/package) loaded when the client name is enabled in mkRepo.clients.";
          };
        };
      }));
      default = {};
      description = "Plugin registry keyed by client name (dotfiles-first client plugin loading).";
    };

    vars = mkOption {
      type = types.attrsOf types.str;
      default = {};
      description = "Dotfiles defaults for templating variables used in emitted config.";
    };

    strictEnv = mkOption {
      type = types.bool;
      default = true;
      description = "Fail on missing template vars when true; otherwise substitute empty strings.";
    };

    registryPath = mkOption {
      type = types.str;
      default = "${config.xdg.configHome}/nexus/registry.json";
      description = "Path to the generated dotfiles registry JSON.";
    };
  };

  config = mkIf cfg.enable {
    home.packages = [ cfg.package ];

    # Export dotfiles registry JSON + env var for runtime resolution.
    home.file."${cfg.registryPath}".text = builtins.toJSON {
      packs = map (v: {
        source = v.source;
        allowUnpinned = v.allowUnpinned;
      }) cfg.packs;
      skills = mapAttrs (_: v: {
        source = v.source;
        description = v.description;
        tags = v.tags;
        allowUnpinned = v.allowUnpinned;
      }) cfg.skills;
      mcp = mapAttrs (_: v: {
        command = v.command;
        args = v.args;
        env = v.env;
      }) cfg.mcp;
      plugins = mapAttrs (_: v: {
        module = v.module;
      }) cfg.plugins;
      artifacts = cfg.artifacts;
      vars = cfg.vars;
      strictEnv = cfg.strictEnv;
    };

    home.sessionVariables.NEXUS_DOTFILES_CONFIG_JSON = cfg.registryPath;

    # Add shell hook for auto-activation
    programs.bash.initExtra = mkIf cfg.autoRun ''
      # Nexus auto-activation
      _nexus_auto() {
        if [ -f pack.json ] && [ -x "$(command -v nexus)" ]; then
          nexus 2>/dev/null || true
        fi
      }
      
      # Run on cd
      _nexus_cd() {
        builtin cd "$@" && _nexus_auto
      }
      alias cd='_nexus_cd'
      
      # Run on shell startup if in a pack directory
      _nexus_auto
    '';

    programs.zsh.initExtra = mkIf cfg.autoRun ''
      # Nexus auto-activation
      _nexus_auto() {
        if [ -f pack.json ] && [ -x "$(command -v nexus)" ]; then
          nexus 2>/dev/null || true
        fi
      }
      
      # Run on directory change
      autoload -U add-zsh-hook
      add-zsh-hook chpwd _nexus_auto
      
      # Run on shell startup if in a pack directory
      _nexus_auto
    '';
  };
}
