{ self, nixpkgs }:
{
  # mkRepo is curried so `replix.lib.mkRepo { ... }` works in project flakes.
  # pkgs + replixPackage can be provided explicitly, but default from this flake when omitted.
  mkRepo = { system, pkgs ? null, replixPackage ? null, ... }@args:
    let
      resolvedPkgs = if pkgs != null then pkgs else nixpkgs.legacyPackages.${system};
      resolvedReplixPackage = if replixPackage != null then replixPackage else self.packages.${system}.default;
      forwarded = builtins.removeAttrs args [ "pkgs" "replixPackage" ];
    in
      (import ./mkRepo.nix { pkgs = resolvedPkgs; replixPackage = resolvedReplixPackage; }) forwarded;
}
