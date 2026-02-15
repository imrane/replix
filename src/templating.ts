import type { McpServerDef } from "./emitters/mcp";

export type TemplateOptions = {
  vars: Record<string, string>;
  strictEnv: boolean;
  projectRoot: string;
};

function resolveVar(name: string, options: TemplateOptions): string {
  if (name === "PROJECT_ROOT") return options.projectRoot;
  const value = options.vars[name];
  if (value !== undefined) return value;
  if (options.strictEnv) {
    throw new Error(`missing template variable: ${name}`);
  }
  return "";
}

export function templateString(input: string, options: TemplateOptions): string {
  return input.replace(/\$\{([^}]+)\}/g, (_match, exprRaw: string) => {
    const expr = exprRaw.trim();
    if (expr.startsWith("ENV:")) {
      return resolveVar(expr.slice(4), options);
    }
    return resolveVar(expr, options);
  });
}

export function templateMcpServer(server: McpServerDef, options: TemplateOptions): McpServerDef {
  const args = server.args?.map((a) => templateString(a, options));
  const env = server.env
    ? Object.fromEntries(Object.entries(server.env).map(([k, v]) => [k, templateString(v, options)]))
    : undefined;

  return {
    command: templateString(server.command, options),
    args,
    env,
  };
}
