import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { parsePackJson } from "../../packSchema";

export type CanonicalPackValidation = {
  ok: boolean;
  errors: string[];
};

function matchAll(items: string[] | undefined, re: RegExp, name: string): string[] {
  const errs: string[] = [];
  for (const v of items ?? []) {
    if (!re.test(v)) errs.push(`${name} invalid ref: ${v}`);
  }
  return errs;
}

export async function validateCanonicalPackV1(packRoot: string): Promise<CanonicalPackValidation> {
  const raw = await readFile(join(packRoot, "pack.json"), "utf8");
  const parsed = parsePackJson(JSON.parse(raw));

  const errors: string[] = [];
  if (!parsed.specVersion?.startsWith("replix.canonical.v1")) {
    errors.push("specVersion must start with replix.canonical.v1");
  }
  if (!parsed.references) {
    errors.push("references required");
    return { ok: false, errors };
  }

  errors.push(...matchAll(parsed.references.skills, /^skills\/.+\/SKILL\.md$/, "skills"));
  errors.push(...matchAll(parsed.references.commands, /^commands\/.+\.md$/, "commands"));
  errors.push(...matchAll(parsed.references.agents, /^agents\/.+\.md$/, "agents"));
  errors.push(...matchAll(parsed.references.hooks, /^hooks\/.+/, "hooks"));
  errors.push(...matchAll(parsed.references.mcp, /^mcp\/.+\.json$/, "mcp"));

  return { ok: errors.length === 0, errors };
}
