import { test, expect } from "bun:test";
import { mkdtempSync, writeFileSync, mkdirSync, rmSync } from "node:fs";
import { join } from "node:path";
import { execFileSync } from "node:child_process";
import { runNexus } from "../src/runNexus";

function sh(cmd: string[], opts?: { cwd?: string }) {
  execFileSync(cmd[0]!, cmd.slice(1), { cwd: opts?.cwd, stdio: "inherit" });
}

test("config mode (v2) > resolves github: pinned dotfiles skill source", async () => {
  const tmp = mkdtempSync("/tmp/nexus-config-dotfiles-gh-");
  try {
    // Create a local 'github' bare repo at: <tmp>/gh/acme/humanizer.git
    const ghRoot = join(tmp, "gh", "acme");
    mkdirSync(ghRoot, { recursive: true });

    const bare = join(ghRoot, "humanizer.git");
    sh(["git", "init", "--bare", bare]);

    const work = join(tmp, "work");
    mkdirSync(work, { recursive: true });
    sh(["git", "init"], { cwd: work });

    const skillDir = join(work, "skills", "humanizer");
    mkdirSync(skillDir, { recursive: true });
    writeFileSync(join(skillDir, "SKILL.md"), "---\nname: humanizer\n---\n\n# hi from git\n");

    sh(["git", "add", "."], { cwd: work });
    sh(["git", "-c", "user.email=test@example.com", "-c", "user.name=test", "commit", "-m", "init"], { cwd: work });
    const rev = execFileSync("git", ["rev-parse", "HEAD"], { cwd: work }).toString().trim();
    sh(["git", "remote", "add", "origin", bare], { cwd: work });
    sh(["git", "push", "-u", "origin", "HEAD:main"], { cwd: work });

    const repoRoot = join(tmp, "repo");
    mkdirSync(repoRoot, { recursive: true });

    const dotfilesCfg = {
      skills: {
        humanizer: { source: `github:acme/humanizer@${rev}#skills/humanizer` },
      },
      mcp: {},
    };
    const dotfilesCfgPath = join(tmp, "dotfiles.json");
    writeFileSync(dotfilesCfgPath, JSON.stringify(dotfilesCfg));

    process.env.NEXUS_DOTFILES_CONFIG_JSON = dotfilesCfgPath;
    process.env.NEXUS_GITHUB_BASE_URL = `file://${join(tmp, "gh")}`;

    const nexusCfg = {
      version: 1,
      repoRoot,
      clients: ["claude"],
      enable: { skills: ["humanizer"], mcp: [] },
      overrides: { skills: {}, mcp: {} },
    };

    const nexusCfgPath = join(tmp, "nexus.json");
    writeFileSync(nexusCfgPath, JSON.stringify(nexusCfg));

    await runNexus({ cwd: repoRoot, configPath: nexusCfgPath });

    const t = await Bun.file(join(repoRoot, ".claude", "skills", "humanizer", "SKILL.md")).text();
    expect(t).toContain("hi from git");
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
});
