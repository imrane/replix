{
  description = "Nexus - Agent skill/MCP config manager";

  inputs = {
    nixpkgs.url = "github:NixOS/nixpkgs/nixos-unstable";
    flake-utils.url = "github:numtide/flake-utils";
  };

  outputs = { self, nixpkgs, flake-utils }:
    flake-utils.lib.eachDefaultSystem (system:
      let
        pkgs = nixpkgs.legacyPackages.${system};

        # Important: flakes imported via `path:` will choke on unix sockets (e.g. .beads/bd.sock).
        # While that fetch-time issue is best avoided by consuming via `git+file://...`, we also
        # ensure our builds/tests use a cleaned source tree (no runtime artifacts).
        cleanSrc = pkgs.lib.cleanSourceWith {
          src = ./.;
          filter = path: type:
            let p = toString path; in
            !(pkgs.lib.hasInfix "/.beads/" p
              || pkgs.lib.hasSuffix "/.beads" p
              || pkgs.lib.hasInfix "/result" p
              || pkgs.lib.hasInfix "/node_modules/" p
              || pkgs.lib.hasInfix "/.direnv/" p);
        };
      in
      {
        packages = {
          default = pkgs.callPackage ./package.nix { src = cleanSrc; };
          nexus = pkgs.callPackage ./package.nix { src = cleanSrc; };
        };

        # Home-manager module for global installation
        homeManagerModules.default = import ./modules/home-manager.nix;

        devShells.default = pkgs.mkShell {
          packages = with pkgs; [
            bun
            nodejs_22
          ];

          shellHook = ''
            echo "🔧 Nexus devShell"
            if [ -f pack.json ]; then
              echo "📦 Running nexus..."
              bun run src/index.ts
            else
              echo "ℹ️  No pack.json found in current directory"
            fi
          '';
        };

        checks = {
          test = pkgs.runCommand "nexus-tests" {
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
    );
}
