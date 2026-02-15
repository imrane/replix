import { test, expect } from "bun:test";
import { mkdtempSync, writeFileSync, mkdirSync, rmSync } from "node:fs";
import { join } from "node:path";
import { runNexus } from "../src/runNexus";

test("config mode (v2) > mcp templating merges process < dotfiles < project vars", async () => {
  const tmp = mkdtempSync("/tmp/nexus-config-template-");
  try {
    const repoRoot = join(tmp, "repo");
    mkdirSync(repoRoot, { recursive: true });

    process.env.NEXUS_TEMPLATE_TEST = "from-process";

    const dotfilesCfg = {
      vars: {
        NEXUS_TEMPLATE_TEST: "from-dotfiles",
        ONLY_DOTFILES: "dot",
      },
      strictEnv: true,
      skills: {},
      mcp: {
        filesystem: {
          command: "npx",
          args: ["${PROJECT_ROOT}", "${ENV:NEXUS_TEMPLATE_TEST}", "${ONLY_DOTFILES}"],
          env: {
            ROOT: "${PROJECT_ROOT}",
            VALUE: "${NEXUS_TEMPLATE_TEST}",
          },
        },
      },
    };
    const dotfilesCfgPath = join(tmp, "dotfiles.json");
    writeFileSync(dotfilesCfgPath, JSON.stringify(dotfilesCfg));
    process.env.NEXUS_DOTFILES_CONFIG_JSON = dotfilesCfgPath;

    const nexusCfg = {
      version: 1,
      repoRoot,
      clients: [],
      enable: { skills: [], mcp: ["filesystem"] },
      vars: {
        NEXUS_TEMPLATE_TEST: "from-project",
      },
      overrides: { skills: {}, mcp: {} },
    };

    const nexusCfgPath = join(tmp, "nexus.json");
    writeFileSync(nexusCfgPath, JSON.stringify(nexusCfg));

    await runNexus({ cwd: repoRoot, configPath: nexusCfgPath });

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
  const tmp = mkdtempSync("/tmp/nexus-config-template-missing-");
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
    process.env.NEXUS_DOTFILES_CONFIG_JSON = dotfilesCfgPath;

    const nexusCfg = {
      version: 1,
      repoRoot,
      clients: [],
      enable: { skills: [], mcp: ["filesystem"] },
      overrides: { skills: {}, mcp: {} },
    };

    const nexusCfgPath = join(tmp, "nexus.json");
    writeFileSync(nexusCfgPath, JSON.stringify(nexusCfg));

    await runNexus({ cwd: repoRoot, configPath: nexusCfgPath });

    const m = JSON.parse(await Bun.file(join(repoRoot, ".mcp.json")).text());
    expect(m.mcpServers.filesystem.args[0]).toBe("");
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
});

test("config mode (v2) > strictEnv true errors on missing vars", async () => {
  const tmp = mkdtempSync("/tmp/nexus-config-template-strict-");
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
    process.env.NEXUS_DOTFILES_CONFIG_JSON = dotfilesCfgPath;

    const nexusCfg = {
      version: 1,
      repoRoot,
      clients: [],
      enable: { skills: [], mcp: ["filesystem"] },
      overrides: { skills: {}, mcp: {} },
    };

    const nexusCfgPath = join(tmp, "nexus.json");
    writeFileSync(nexusCfgPath, JSON.stringify(nexusCfg));

    await expect(runNexus({ cwd: repoRoot, configPath: nexusCfgPath })).rejects.toThrow(
      "missing template variable: MISSING_VAR",
    );
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
});
