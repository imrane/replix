import { test, expect } from "bun:test";
import { mkdtempSync, writeFileSync, mkdirSync, rmSync } from "node:fs";
import { join } from "node:path";
import { runReplix } from "../src/runReplix";

test("config mode (v2) > mcp templating merges process < dotfiles < project vars", async () => {
  const tmp = mkdtempSync("/tmp/replix-config-template-");
  try {
    const repoRoot = join(tmp, "repo");
    mkdirSync(repoRoot, { recursive: true });

    process.env.REPLIX_TEMPLATE_TEST = "from-process";

    const dotfilesCfg = {
      vars: {
        REPLIX_TEMPLATE_TEST: "from-dotfiles",
        ONLY_DOTFILES: "dot",
      },
      strictEnv: true,
      skills: {},
      mcp: {
        filesystem: {
          command: "npx",
          args: ["${PROJECT_ROOT}", "${ENV:REPLIX_TEMPLATE_TEST}", "${ONLY_DOTFILES}"],
          env: {
            ROOT: "${PROJECT_ROOT}",
            VALUE: "${REPLIX_TEMPLATE_TEST}",
          },
        },
      },
    };
    const dotfilesCfgPath = join(tmp, "dotfiles.json");
    writeFileSync(dotfilesCfgPath, JSON.stringify(dotfilesCfg));
    process.env.REPLIX_DOTFILES_CONFIG_JSON = dotfilesCfgPath;

    const replixCfg = {
      version: 1,
      repoRoot,
      clients: [],
      enable: { skills: [], mcp: ["filesystem"] },
      vars: {
        REPLIX_TEMPLATE_TEST: "from-project",
      },
      overrides: { skills: {}, mcp: {} },
    };

    const replixCfgPath = join(tmp, "replix.json");
    writeFileSync(replixCfgPath, JSON.stringify(replixCfg));

    await runReplix({ cwd: repoRoot, configPath: replixCfgPath });

    const m = JSON.parse(await Bun.file(join(repoRoot, ".mcp.json")).text());
    const fsServer = m.mcpServers.filesystem;

    expect(fsServer.args[0]).toBe(repoRoot);
    expect(fsServer.args[1]).toBe("from-project");
    expect(fsServer.args[2]).toBe("dot");
    expect(fsServer.env.ROOT).toBe(repoRoot);
    expect(fsServer.env.VALUE).toBe("from-project");
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
});

test("config mode (v2) > strictEnv false allows missing vars", async () => {
  const tmp = mkdtempSync("/tmp/replix-config-template-missing-");
  try {
    const repoRoot = join(tmp, "repo");
    mkdirSync(repoRoot, { recursive: true });

    const dotfilesCfg = {
      strictEnv: false,
      skills: {},
      mcp: {
        filesystem: {
          command: "npx",
          args: ["${MISSING_VAR}"],
        },
      },
    };
    const dotfilesCfgPath = join(tmp, "dotfiles.json");
    writeFileSync(dotfilesCfgPath, JSON.stringify(dotfilesCfg));
    process.env.REPLIX_DOTFILES_CONFIG_JSON = dotfilesCfgPath;

    const replixCfg = {
      version: 1,
      repoRoot,
      clients: [],
      enable: { skills: [], mcp: ["filesystem"] },
      overrides: { skills: {}, mcp: {} },
    };

    const replixCfgPath = join(tmp, "replix.json");
    writeFileSync(replixCfgPath, JSON.stringify(replixCfg));

    await runReplix({ cwd: repoRoot, configPath: replixCfgPath });

    const m = JSON.parse(await Bun.file(join(repoRoot, ".mcp.json")).text());
    expect(m.mcpServers.filesystem.args[0]).toBe("");
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
});

test("config mode (v2) > strictEnv true errors on missing vars", async () => {
  const tmp = mkdtempSync("/tmp/replix-config-template-strict-");
  try {
    const repoRoot = join(tmp, "repo");
    mkdirSync(repoRoot, { recursive: true });

    const dotfilesCfg = {
      strictEnv: true,
      skills: {},
      mcp: {
        filesystem: {
          command: "npx",
          args: ["${MISSING_VAR}"],
        },
      },
    };
    const dotfilesCfgPath = join(tmp, "dotfiles.json");
    writeFileSync(dotfilesCfgPath, JSON.stringify(dotfilesCfg));
    process.env.REPLIX_DOTFILES_CONFIG_JSON = dotfilesCfgPath;

    const replixCfg = {
      version: 1,
      repoRoot,
      clients: [],
      enable: { skills: [], mcp: ["filesystem"] },
      overrides: { skills: {}, mcp: {} },
    };

    const replixCfgPath = join(tmp, "replix.json");
    writeFileSync(replixCfgPath, JSON.stringify(replixCfg));

    await expect(runReplix({ cwd: repoRoot, configPath: replixCfgPath })).rejects.toThrow(
      "missing template variable: MISSING_VAR",
    );
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
});

test("config mode (v2) > file vars are default and override process env", async () => {
  const tmp = mkdtempSync("/tmp/replix-config-template-file-default-");
  try {
    const repoRoot = join(tmp, "repo");
    const varsDir = join(repoRoot, ".replix", "vars");
    mkdirSync(varsDir, { recursive: true });
    writeFileSync(join(varsDir, "API_TOKEN"), "from-file\n");

    process.env.API_TOKEN = "from-process";

    const dotfilesCfg = {
      strictEnv: true,
      skills: {},
      mcp: {
        filesystem: {
          command: "echo",
          args: ["${API_TOKEN}"],
        },
      },
    };
    const dotfilesCfgPath = join(tmp, "dotfiles.json");
    writeFileSync(dotfilesCfgPath, JSON.stringify(dotfilesCfg));
    process.env.REPLIX_DOTFILES_CONFIG_JSON = dotfilesCfgPath;

    const replixCfg = {
      version: 1,
      repoRoot,
      clients: [],
      enable: { skills: [], mcp: ["filesystem"] },
      overrides: { skills: {}, mcp: {} },
    };

    const replixCfgPath = join(tmp, "replix.json");
    writeFileSync(replixCfgPath, JSON.stringify(replixCfg));

    await runReplix({ cwd: repoRoot, configPath: replixCfgPath });

    const m = JSON.parse(await Bun.file(join(repoRoot, ".mcp.json")).text());
    expect(m.mcpServers.filesystem.args[0]).toBe("from-file");
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
});
