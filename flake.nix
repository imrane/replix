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
      in
      {
        packages.default = pkgs.writeShellScriptBin "nexus" ''
          if [ ! -f pack.json ]; then
            echo "❌ No pack.json found in current directory" >&2
            exit 1
          fi
          ${pkgs.bun}/bin/bun ${self}/src/index.ts
        '';

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
            src = ./.;
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
