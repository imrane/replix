{ self, nixpkgs }:
{
  # mkRepo is curried so `nexus.lib.mkRepo { ... }` works in project flakes.
  # pkgs + nexusPackage can be provided explicitly, but default from this flake when omitted.
  mkRepo = { system, pkgs ? null, nexusPackage ? null, ... }@args:
    let
      resolvedPkgs = if pkgs != null then pkgs else nixpkgs.legacyPackages.${system};
      resolvedNexusPackage = if nexusPackage != null then nexusPackage else self.packages.${system}.default;
      forwarded = builtins.removeAttrs args [ "pkgs" "nexusPackage" ];
    in
      (import ./mkRepo.nix { pkgs = resolvedPkgs; nexusPackage = resolvedNexusPackage; }) forwarded;
}
