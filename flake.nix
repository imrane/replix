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
        devShells.default = pkgs.mkShell {
          packages = with pkgs; [
            bun
            nodejs_22
          ];

          shellHook = ''
            echo "🔧 Nexus devShell"
            echo "Run: bun test"
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
