import { existsSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { execFileSync } from "node:child_process";

export type ParsedGithubSource = {
  owner: string;
  repo: string;
  ref: string | null;
  subpath: string | null;
  floating: boolean;
};

// Supported forms:
// - github:owner/repo@<rev>[#sub/dir]           (legacy pinned)
// - github:owner/repo?rev=<rev>[#sub/dir]       (pinned)
// - github:owner/repo/<branch>[#sub/dir]        (floating branch)
// - github:owner/repo[#sub/dir]                 (floating default branch)
export function parseGithubSource(src: string): ParsedGithubSource | null {
  if (!src.startsWith("github:")) return null;

  const body = src.slice("github:".length);
  const [withoutHash, hashPart] = body.split("#", 2);
  const subpath = hashPart ?? null;

  const qIdx = withoutHash.indexOf("?");
  const pathPart = qIdx === -1 ? withoutHash : withoutHash.slice(0, qIdx);
  const queryPart = qIdx === -1 ? "" : withoutHash.slice(qIdx + 1);

  const query = new URLSearchParams(queryPart);
  const revFromQuery = query.get("rev");

  const legacyPinned = /^([^/]+)\/([^@/]+)@([0-9a-f]+)$/.exec(pathPart);
  if (legacyPinned) {
    return {
      owner: legacyPinned[1]!,
      repo: legacyPinned[2]!,
      ref: legacyPinned[3]!,
      subpath,
      floating: false,
    };
  }

  const parts = pathPart.split("/").filter(Boolean);
  if (parts.length < 2) return null;

  const [owner, repo, ...rest] = parts;
  const branchRef = rest.length > 0 ? rest.join("/") : null;

  if (revFromQuery && branchRef) {
    throw new Error(`invalid github source (cannot combine /branch and ?rev=): ${src}`);
  }

  if (revFromQuery) {
    return { owner: owner!, repo: repo!, ref: revFromQuery, subpath, floating: false };
  }

  if (branchRef) {
    return { owner: owner!, repo: repo!, ref: branchRef, subpath, floating: true };
  }

  return { owner: owner!, repo: repo!, ref: null, subpath, floating: true };
}

function cacheRoot(): string {
  const xdg = process.env.XDG_CACHE_HOME;
  if (xdg && xdg.trim()) return xdg;
  const home = process.env.HOME;
  if (!home) throw new Error("HOME is not set (needed to locate cache dir)");
  return join(home, ".cache");
}

function git(args: string[], opts?: { cwd?: string }) {
  execFileSync("git", args, {
    cwd: opts?.cwd,
    stdio: ["ignore", "ignore", "pipe"],
    env: process.env,
  });
}

function gitTry(args: string[], opts?: { cwd?: string }): boolean {
  try {
    git(args, opts);
    return true;
  } catch {
    return false;
  }
}

function sourceCacheKey(g: ParsedGithubSource): string {
  if (g.ref === null) return "default";
  return g.ref.replace(/[^a-zA-Z0-9._-]/g, "_");
}

export async function resolveDotfilesSourceToPath(
  source: string,
  opts?: { allowUnpinned?: boolean },
): Promise<string> {
  if (source.startsWith("path:")) {
    return source.slice("path:".length);
  }

  if (source.startsWith("github:")) {
    const g = parseGithubSource(source);
    if (!g) {
      throw new Error(
        [
          `invalid github source: ${source}`,
          "Expected one of:",
          "  github:owner/repo@<rev>",
          "  github:owner/repo@<rev>#sub/dir",
          "  github:owner/repo?rev=<rev>",
          "  github:owner/repo?rev=<rev>#sub/dir",
          "  github:owner/repo/<branch>",
          "  github:owner/repo/<branch>#sub/dir",
          "  github:owner/repo",
          "  github:owner/repo#sub/dir",
        ].join("\n"),
      );
    }

    if (g.floating && !opts?.allowUnpinned) {
      throw new Error(
        `github source requires pinning by default: ${source}\n` +
          "Set allowUnpinned=true for this skill to permit floating default/branch refs.",
      );
    }

    const base = (process.env.NEXUS_GITHUB_BASE_URL ?? "https://github.com").replace(/\/$/, "");
    const url = `${base}/${g.owner}/${g.repo}.git`;

    const root = join(cacheRoot(), "nexus", "github", g.owner, g.repo, sourceCacheKey(g));
    mkdirSync(root, { recursive: true });

    if (!existsSync(join(root, ".git"))) {
      git(["clone", "--no-checkout", "--filter=blob:none", url, root]);
    } else {
      gitTry(["remote", "set-url", "origin", url], { cwd: root });
    }

    if (g.ref) {
      try {
        git(["fetch", "--depth", "1", "origin", g.ref], { cwd: root });
      } catch {
        // offline cache is acceptable
      }
      git(["checkout", g.ref], { cwd: root });
    } else {
      if (
        gitTry(["fetch", "--depth", "1", "origin", "HEAD"], { cwd: root }) ||
        gitTry(["fetch", "--depth", "1", "origin", "main"], { cwd: root }) ||
        gitTry(["fetch", "--depth", "1", "origin", "master"], { cwd: root })
      ) {
        git(["checkout", "FETCH_HEAD"], { cwd: root });
      }
    }

    const resolved = g.subpath ? join(root, g.subpath) : root;
    if (!existsSync(resolved)) {
      throw new Error(`resolved github source path does not exist: ${resolved}`);
    }
    return resolved;
  }

  throw new Error(`unsupported dotfiles source scheme: ${source} (expected path: or github:)`);
}
