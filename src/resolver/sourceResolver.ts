import { existsSync, mkdirSync, rmSync, cpSync } from "node:fs";
import { createHash } from "node:crypto";
import { dirname, join } from "node:path";
import { execFileSync } from "node:child_process";

export type ParsedGithubSource = {
  owner: string;
  repo: string;
  ref: string | null;
  subpath: string | null;
  include: string[];
  packs: string[];
  floating: boolean;
};

// Supported forms:
// - github:owner/repo@<rev>[#sub/dir]                      (legacy pinned)
// - github:owner/repo?rev=<rev>[#sub/dir]                  (pinned)
// - github:owner/repo?rev=<rev>&include=a,b[#sub/dir]      (pinned + selective include)
// - github:owner/repo?rev=<rev>&pack=starter[#sub/dir]     (pinned + alias from replix.index.json)
// - github:owner/repo?rev=<rev>&packs=a,b[#sub/dir]        (pinned + many aliases)
// - github:owner/repo/<branch>[#sub/dir]                   (floating branch)
// - github:owner/repo[#sub/dir]                            (floating default branch)
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
  const include = (query.get("include") ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean)
    .map((s) => s.replace(/^\.\//, "").replace(/^\/+/, ""));

  const packs = [
    ...query
      .getAll("pack")
      .flatMap((v) => v.split(","))
      .map((s) => s.trim())
      .filter(Boolean),
    ...(query.get("packs") ?? "")
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean),
  ];

  const legacyPinned = /^([^/]+)\/([^@/]+)@([0-9a-f]+)$/.exec(pathPart);
  if (legacyPinned) {
    return {
      owner: legacyPinned[1]!,
      repo: legacyPinned[2]!,
      ref: legacyPinned[3]!,
      subpath,
      include,
      packs,
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
    return { owner: owner!, repo: repo!, ref: revFromQuery, subpath, include, packs, floating: false };
  }

  if (branchRef) {
    return { owner: owner!, repo: repo!, ref: branchRef, subpath, include, packs, floating: true };
  }

  return { owner: owner!, repo: repo!, ref: null, subpath, include, packs, floating: true };
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

function includeCacheKey(include: string[]): string {
  if (include.length === 0) return "all";
  const hash = createHash("sha1");
  hash.update(include.join("\n"));
  return hash.digest("hex").slice(0, 12);
}

function materializeSelectiveInclude(root: string, include: string[]): string {
  const out = join(root, ".replix-includes", includeCacheKey(include));
  rmSync(out, { recursive: true, force: true });
  mkdirSync(out, { recursive: true });

  for (const rel of include) {
    const src = join(root, rel);
    if (!existsSync(src)) {
      throw new Error(`github source include path does not exist: ${rel}`);
    }
    const dst = join(out, rel);
    mkdirSync(dirname(dst), { recursive: true });
    cpSync(src, dst, { recursive: true, force: true });
  }

  return out;
}

async function resolvePackAliases(root: string, aliases: string[]): Promise<string[]> {
  if (aliases.length === 0) return [];

  const indexPath = join(root, "replix.index.json");
  if (!existsSync(indexPath)) {
    throw new Error(
      `github source uses pack alias but replix.index.json not found at repo root (aliases: ${aliases.join(", ")})`,
    );
  }

  let parsed: any;
  try {
    parsed = JSON.parse(await Bun.file(indexPath).text());
  } catch {
    throw new Error("invalid replix.index.json (must be valid JSON with a packs map)");
  }

  const packMap = parsed?.packs;
  if (!packMap || typeof packMap !== "object") {
    throw new Error("invalid replix.index.json (expected: { \"packs\": { \"name\": \"path\" } })");
  }

  const paths: string[] = [];
  for (const alias of aliases) {
    const rel = packMap[alias];
    if (typeof rel !== "string" || rel.trim() === "") {
      throw new Error(`pack alias not found in replix.index.json: ${alias}`);
    }
    paths.push(rel.trim().replace(/^\.\//, "").replace(/^\/+/, ""));
  }

  return paths;
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
          "  github:owner/repo?rev=<rev>&include=path1,path2#sub/dir",
          "  github:owner/repo?rev=<rev>&pack=starter",
          "  github:owner/repo?rev=<rev>&packs=starter,security",
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

    const base = (process.env.REPLIX_GITHUB_BASE_URL ?? "https://github.com").replace(/\/$/, "");
    const url = `${base}/${g.owner}/${g.repo}.git`;

    const root = join(cacheRoot(), "replix", "github", g.owner, g.repo, sourceCacheKey(g));
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

    const aliasIncludes = await resolvePackAliases(root, g.packs);
    const includes = [...new Set([...g.include, ...aliasIncludes])];
    const sourceRoot = includes.length > 0 ? materializeSelectiveInclude(root, includes) : root;
    const resolved = g.subpath ? join(sourceRoot, g.subpath) : sourceRoot;
    if (!existsSync(resolved)) {
      throw new Error(`resolved github source path does not exist: ${resolved}`);
    }
    return resolved;
  }

  throw new Error(`unsupported dotfiles source scheme: ${source} (expected path: or github:)`);
}
