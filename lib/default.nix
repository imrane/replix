{
  # mkRepo is curried so `nexus.lib.mkRepo { ... }` works in project flakes.
  # Caller must provide pkgs + nexusPackage.
  mkRepo = { pkgs, nexusPackage, ... }@args:
    let
      forwarded = builtins.removeAttrs args [ "pkgs" "nexusPackage" ];
    in
      (import ./mkRepo.nix { inherit pkgs nexusPackage; }) forwarded;
}
