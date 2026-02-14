{ pkgs, nexusPackage }:

# Minimal mkRepo implementation (v2 direction):
# - No local pack.json required
# - Skills are defined by source strings (github:, path:)
# - Enabled skills are resolved by Nix (fetchGit for github) and passed to nexus via --config JSON

{ system
, clients ? [ "claude" "mcp" "codex" "opencode" ]
, enable ? { skills = []; mcp = []; }
, skills ? {}            # Optional overrides for skills. If omitted, skills resolve from dotfiles registry at runtime.
, repoRoot ? null        # optional; defaults to $PWD at runtime
}:

let
  lib = pkgs.lib;

  # Supported forms:
  # - github:owner/repo@<rev>
  # - github:owner/repo@<rev>#sub/dir
  parseGithub = src:
    let
      m = builtins.match "github:([^/]+)/([^@#]+)@([0-9a-f]+)(#(.*))?" src;
    in
      if m == null then null else {
        owner = builtins.elemAt m 0;
        repo = builtins.elemAt m 1;
        rev = builtins.elemAt m 2;
        subpath = builtins.elemAt m 4; # may be null
      };

  resolveSource = src:
    if lib.hasPrefix "path:" src then
      lib.removePrefix "path:" src
    else if lib.hasPrefix "github:" src then
      let g = parseGithub src; in
      if g == null then
        throw ''
          nexus.mkRepo: invalid github source: ${src}

          Expected pinned form (required in pure evaluation):
            github:owner/repo@<rev>
            github:owner/repo@<rev>#sub/dir

          Example:
            github:blader/humanizer@c78047bd4300e5a995d37ae8c7684aa2d53326cd
        ''
      else
      let
        fetched = builtins.fetchGit {
          url = "https://github.com/${g.owner}/${g.repo}.git";
          rev = g.rev;
        };
      in
        if g.subpath == null then fetched else "${fetched}/${g.subpath}"
    else
      throw "nexus.mkRepo: unsupported source scheme (expected path: or github:): ${src}";

  enabledSkills = enable.skills or [];

  # Only include skills that have explicit overrides in this repo.
  # Anything missing here can still resolve from the user's dotfiles registry (runtime).
  resolvedSkills = lib.listToAttrs (
    lib.filter (x: x != null) (map (name:
      let
        entry = skills.${name} or null;
        src = if entry == null then null else (entry.source or null);
      in
        if src == null then null else {
          inherit name;
          value = { path = resolveSource src; };
        }
    ) enabledSkills)
  );

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
