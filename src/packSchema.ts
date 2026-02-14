export type PackImportPointer = {
  id: string;
  src: string;
  rev: string;
  path: string;
};

export type PackJson = {
  id: string;
  version: string;
  imports: PackImportPointer[];
  enable?: unknown;
};

function isRecord(x: unknown): x is Record<string, unknown> {
  return typeof x === "object" && x !== null && !Array.isArray(x);
}

export function parsePackJson(input: unknown): PackJson {
  if (!isRecord(input)) throw new Error("pack.json must be an object");

  const id = input.id;
  const version = input.version;
  const imports = input.imports ?? [];

  if (typeof id !== "string" || id.length === 0) throw new Error("pack.id required");
  if (typeof version !== "string" || version.length === 0)
    throw new Error("pack.version required");

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

  return { id, version, imports: parsedImports, enable: input.enable };
}
