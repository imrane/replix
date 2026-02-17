export type PackImportPointer = {
  id: string;
  src: string;
  rev: string;
  path: string;
};

export type PackVarSpec = {
  secret?: boolean;
  source?: string;
  default?: string;
  description?: string;
};

export type PackVarsContract = {
  required: Record<string, PackVarSpec>;
  optional: Record<string, PackVarSpec>;
};

export type PackReferences = {
  skills?: string[];
  commands?: string[];
  agents?: string[];
  hooks?: string[];
  mcp?: string[];
};

export type PackJson = {
  id: string;
  version: string;
  imports: PackImportPointer[];
  specVersion?: string;
  enable?: unknown;
  varsSchemaVersion?: number;
  vars?: PackVarsContract;
  references?: PackReferences;
};

function isRecord(x: unknown): x is Record<string, unknown> {
  return typeof x === "object" && x !== null && !Array.isArray(x);
}

function parseVarSpec(input: unknown, name: string): PackVarSpec {
  if (!isRecord(input)) throw new Error(`${name} must be an object`);

  const secret = input.secret;
  if (!(secret === undefined || typeof secret === "boolean")) {
    throw new Error(`${name}.secret must be a boolean`);
  }

  const source = input.source;
  if (!(source === undefined || typeof source === "string")) {
    throw new Error(`${name}.source must be a string`);
  }

  const def = input.default;
  if (!(def === undefined || typeof def === "string")) {
    throw new Error(`${name}.default must be a string`);
  }

  const description = input.description;
  if (!(description === undefined || typeof description === "string")) {
    throw new Error(`${name}.description must be a string`);
  }

  return { secret, source, default: def, description };
}

function parseVarMap(input: unknown, name: string): Record<string, PackVarSpec> {
  if (!isRecord(input)) throw new Error(`${name} must be an object`);
  const out: Record<string, PackVarSpec> = {};
  for (const [k, v] of Object.entries(input)) {
    if (!k) throw new Error(`${name} contains empty variable key`);
    out[k] = parseVarSpec(v, `${name}.${k}`);
  }
  return out;
}

function parseStringArray(input: unknown, name: string): string[] {
  if (input === undefined) return [];
  if (!Array.isArray(input) || !input.every((x) => typeof x === "string" && x.length > 0)) {
    throw new Error(`${name} must be string[]`);
  }
  return input as string[];
}

export function parsePackJson(input: unknown): PackJson {
  if (!isRecord(input)) throw new Error("pack.json must be an object");

  const id = input.id;
  const version = input.version;
  const imports = input.imports ?? [];

  if (typeof id !== "string" || id.length === 0) throw new Error("pack.id required");
  if (typeof version !== "string" || version.length === 0)
    throw new Error("pack.version required");

  const specVersion = input.specVersion;
  if (!(specVersion === undefined || typeof specVersion === "string")) {
    throw new Error("pack.specVersion must be a string when present");
  }

  const varsSchemaVersion = input.varsSchemaVersion;
  if (!(varsSchemaVersion === undefined || varsSchemaVersion === 1)) {
    throw new Error("pack.varsSchemaVersion must be 1 when present");
  }

  if (!Array.isArray(imports)) throw new Error("pack.imports must be an array");

  const parsedImports: PackImportPointer[] = imports.map((imp, i) => {
    if (!isRecord(imp)) throw new Error(`pack.imports[${i}] must be an object`);
    const pid = imp.id;
    const src = imp.src;
    const rev = imp.rev;
    const path = imp.path;
    if (typeof pid !== "string" || pid.length === 0)
      throw new Error(`pack.imports[${i}].id required`);
    if (typeof src !== "string" || src.length === 0)
      throw new Error(`pack.imports[${i}].src required`);
    if (typeof rev !== "string" || rev.length === 0)
      throw new Error(`pack.imports[${i}].rev required`);
    if (typeof path !== "string" || path.length === 0)
      throw new Error(`pack.imports[${i}].path required`);
    return { id: pid, src, rev, path };
  });

  const varsRaw = input.vars;
  if (!(varsRaw === undefined || isRecord(varsRaw))) {
    throw new Error("pack.vars must be an object");
  }

  let vars: PackVarsContract | undefined = undefined;
  if (varsRaw) {
    const required = parseVarMap(varsRaw.required ?? {}, "pack.vars.required");
    const optional = parseVarMap(varsRaw.optional ?? {}, "pack.vars.optional");

    for (const k of Object.keys(required)) {
      if (Object.prototype.hasOwnProperty.call(optional, k)) {
        throw new Error(`pack.vars duplicates key across required/optional: ${k}`);
      }
    }

    vars = { required, optional };
  }

  const refsRaw = input.references;
  if (!(refsRaw === undefined || isRecord(refsRaw))) {
    throw new Error("pack.references must be an object");
  }

  const references: PackReferences | undefined = refsRaw
    ? {
        skills: parseStringArray(refsRaw.skills, "pack.references.skills"),
        commands: parseStringArray(refsRaw.commands, "pack.references.commands"),
        agents: parseStringArray(refsRaw.agents, "pack.references.agents"),
        hooks: parseStringArray(refsRaw.hooks, "pack.references.hooks"),
        mcp: parseStringArray(refsRaw.mcp, "pack.references.mcp"),
      }
    : undefined;

  if (specVersion?.startsWith("replix.canonical.v1") && !references) {
    throw new Error("pack.references required for replix.canonical.v1 packs");
  }

  return { id, version, imports: parsedImports, specVersion, enable: input.enable, varsSchemaVersion, vars, references };
}
