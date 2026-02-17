{
  description = "Replix - Agent skill/MCP config manager";

  inputs = {
    nixpkgs.url = "github:NixOS/nixpkgs/nixos-unstable";
    flake-utils.url = "github:numtide/flake-utils";
  };

  outputs = { self, nixpkgs, flake-utils }:
    (flake-utils.lib.eachDefaultSystem (system:
      let
        pkgs = nixpkgs.legacyPackages.${system};

        # Important: flakes imported via `path:` will choke on unix sockets (e.g. .beads/bd.sock).
        # Best practice: consume via `git+file://...` or GitHub.
        # Also ensure our builds/tests use a cleaned source tree (no runtime artifacts).
        cleanSrc = pkgs.lib.cleanSourceWith {
          src = ./.;
          filter = path: type:
            let p = toString path; in
            !(
              # Keep .beads in-repo, but exclude daemon/runtime artifacts that break flakes
              pkgs.lib.hasSuffix "/.beads/bd.sock" p
              || pkgs.lib.hasSuffix "/.beads/daemon.pid" p
              || pkgs.lib.hasSuffix "/.beads/daemon.lock" p
              || pkgs.lib.hasSuffix "/.beads/daemon.log" p
              || pkgs.lib.hasSuffix "/.beads/.jsonl.lock" p

              # Common non-source artifacts
              || pkgs.lib.hasInfix "/result" p
              || pkgs.lib.hasInfix "/node_modules/" p
              || pkgs.lib.hasInfix "/.direnv/" p
            );
        };
      in
      {
        packages = {
          default = pkgs.callPackage ./package.nix { src = cleanSrc; };
          replix = pkgs.callPackage ./package.nix { src = cleanSrc; };
        };

        # Home-manager module for global installation
        homeManagerModules.default = import ./modules/home-manager.nix;

        devShells.default = pkgs.mkShell {
          packages = with pkgs; [
            bun
            nodejs_22
          ];

          shellHook = ''
            echo "🔧 Replix devShell"
            if [ -f pack.json ]; then
              echo "📦 Running replix..."
              bun run src/index.ts
            else
              echo "ℹ️  No pack.json found in current directory"
            fi
          '';
        };

        checks = {
          test = pkgs.runCommand "replix-tests" {
            buildInputs = [ pkgs.bun ];
            src = cleanSrc;
          } ''
            cd $src
            export HOME=$TMPDIR
            ${pkgs.bun}/bin/bun test
            touch $out
          '';
        };
      }
    ))
    // {
      # Top-level library API (v2 direction).
      # mkRepo can infer pkgs + replix package from this flake; callers may still override explicitly.
      lib = import ./lib { inherit self nixpkgs; };
    };
}
