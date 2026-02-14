import { existsSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { execFileSync } from "node:child_process";

export type ParsedGithubSource = {
  owner: string;
  repo: string;
  rev: string;
  subpath: string | null;
};

// Supported forms:
// - github:owner/repo@<rev>
// - github:owner/repo@<rev>#sub/dir
export function parseGithubSource(src: string): ParsedGithubSource | null {
  const m = /^github:([^/]+)\/([^@#]+)@([0-9a-f]+)(?:#(.+))?$/.exec(src);
  if (!m) return null;
  return { owner: m[1]!, repo: m[2]!, rev: m[3]!, subpath: m[4] ?? null };
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

export async function resolveDotfilesSourceToPath(source: string): Promise<string> {
  if (source.startsWith("path:")) {
    return source.slice("path:".length);
  }

  if (source.startsWith("github:")) {
    const g = parseGithubSource(source);
    if (!g) {
      throw new Error(
        [
          `invalid github source: ${source}`,
          "Expected pinned form:",
          "  github:owner/repo@<rev>",
          "  github:owner/repo@<rev>#sub/dir",
        ].join("\n"),
      );
    }

    const base = (process.env.NEXUS_GITHUB_BASE_URL ?? "https://github.com").replace(/\/$/, "");
    const url = `${base}/${g.owner}/${g.repo}.git`;

    const root = join(cacheRoot(), "nexus", "github", g.owner, g.repo, g.rev);
    mkdirSync(root, { recursive: true });

    // If not a git repo yet, clone and checkout.
    if (!existsSync(join(root, ".git"))) {
      // root exists (mkdir), but may be empty.
      git(["clone", "--no-checkout", "--filter=blob:none", url, root]);
      git(["checkout", g.rev], { cwd: root });
    } else {
      // Ensure we're on the desired rev (best-effort).
      try {
        git(["fetch", "--depth", "1", "origin", g.rev], { cwd: root });
      } catch {
        // ignore; offline cache is acceptable
      }
      git(["checkout", g.rev], { cwd: root });
    }

    return g.subpath ? join(root, g.subpath) : root;
  }

  throw new Error(`unsupported dotfiles source scheme: ${source} (expected path: or github:)`);
}
