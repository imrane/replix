export type AiFixResult = {
  ok: boolean;
  stdout: string;
  stderr: string;
  exitCode: number;
};

type AiFixPayload = {
  issueClass: string;
  notes: string[];
  configPath: string;
  client?: string;
};

function runWithEnv(params: { cwd: string; cmd: string[]; payload: AiFixPayload }): AiFixResult {
  const out = Bun.spawnSync({
    cmd: params.cmd,
    cwd: params.cwd,
    env: {
      ...process.env,
      NEXUS_SELF_HEAL_PAYLOAD: JSON.stringify(params.payload),
    },
    stdout: "pipe",
    stderr: "pipe",
  });

  return {
    ok: out.exitCode === 0,
    stdout: out.stdout.toString(),
    stderr: out.stderr.toString(),
    exitCode: out.exitCode,
  };
}

export function runAiFixCommand(params: {
  cwd: string;
  command: string;
  payload: AiFixPayload;
}): AiFixResult {
  return runWithEnv({ cwd: params.cwd, cmd: ["bash", "-lc", params.command], payload: params.payload });
}

export function runAiFixTsScript(params: {
  cwd: string;
  scriptPath: string;
  payload: AiFixPayload;
}): AiFixResult {
  return runWithEnv({ cwd: params.cwd, cmd: ["bun", params.scriptPath], payload: params.payload });
}
