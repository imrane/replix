{ pkgs, nexusPackage }:

# Minimal mkRepo implementation (v2 direction):
# - No local pack.json required
# - Skills are defined by source strings (github:, path:)
# - Enabled skills are resolved by Nix (fetchGit for github) and passed to nexus via --config JSON

{ system
, clients ? [ "claude" "mcp" "codex" "opencode" ]
, enable ? { skills = []; mcp = []; }
, skills ? {}            # attrset: { humanizer.source = "github:blader/humanizer"; }
, repoRoot ? null        # optional; defaults to $PWD at runtime
}:

let
  lib = pkgs.lib;

  parseGithub = src:
    let
      m = builtins.match "github:([^/]+)/([^#]+)(#(.*))?" src;
    in
      if m == null then null else {
        owner = builtins.elemAt m 0;
        repo = builtins.elemAt m 1;
        subpath = builtins.elemAt m 3; # may be null
      };

  resolveSource = src:
    if lib.hasPrefix "path:" src then
      lib.removePrefix "path:" src
    else if lib.hasPrefix "github:" src then
      let g = parseGithub src; in
      if g == null then throw "nexus.mkRepo: invalid github source: ${src}" else
      let
        fetched = builtins.fetchGit {
          url = "https://github.com/${g.owner}/${g.repo}.git";
        };
      in
        if g.subpath == null then fetched else "${fetched}/${g.subpath}"
    else
      throw "nexus.mkRepo: unsupported source scheme (expected path: or github:): ${src}";

  enabledSkills = enable.skills or [];

  resolvedSkills = lib.listToAttrs (map (name:
    let
      entry = skills.${name} or null;
      src = if entry == null then null else (entry.source or null);
    in
      if src == null then throw "nexus.mkRepo: enabled skill '${name}' has no definition in skills.*.source" else {
        inherit name;
        value = {
          path = resolveSource src;
        };
      }
  ) enabledSkills);

  configJson = builtins.toJSON {
    version = 1;
    repoRoot = repoRoot; # if null, nexus uses cwd
    clients = clients;
    enable = enable;
    sources = {
      skills = resolvedSkills;
      mcp = {};
    };
  };

  configFile = pkgs.writeText "nexus-config.json" configJson;

in
pkgs.mkShell {
  packages = [ nexusPackage ];

  shellHook = ''
    export NEXUS_REPO_ROOT="${if repoRoot == null then "" else repoRoot}"
    ${nexusPackage}/bin/nexus --config ${configFile}
  '';
}
