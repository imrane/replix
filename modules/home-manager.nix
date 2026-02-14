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
  };

  config = mkIf cfg.enable {
    home.packages = [ cfg.package ];

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
