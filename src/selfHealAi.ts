export type AiFixResult = {
  ok: boolean;
  stdout: string;
  stderr: string;
  exitCode: number;
};

export function runAiFixCommand(params: {
  cwd: string;
  command: string;
  payload: {
    issueClass: string;
    notes: string[];
    configPath: string;
    client?: string;
  };
}): AiFixResult {
  const out2 = Bun.spawnSync({
    cmd: ["bash", "-lc", params.command],
    cwd: params.cwd,
    env: {
      ...process.env,
      NEXUS_SELF_HEAL_PAYLOAD: JSON.stringify(params.payload),
    },
    stdout: "pipe",
    stderr: "pipe",
  });

  return {
    ok: out2.exitCode === 0,
    stdout: out2.stdout.toString(),
    stderr: out2.stderr.toString(),
    exitCode: out2.exitCode,
  };
}
