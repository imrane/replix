export type CanonicalIdParts = {
  pack: string;
  imp: string;
  item: string;
};

export function formatId(parts: CanonicalIdParts): string {
  const { pack, imp, item } = parts;
  if (!pack || !imp || !item) throw new Error("invalid canonical id parts");
  if (pack.includes("/") || pack.includes(":")) throw new Error("invalid pack");
  if (imp.includes("/") || imp.includes(":")) throw new Error("invalid import");
  if (item.includes("/") || item.includes(":")) throw new Error("invalid item");
  return `${pack}/${imp}:${item}`;
}

export function parseId(id: string): CanonicalIdParts {
  // expected: <pack>/<import>:<item>
  const slash = id.indexOf("/");
  const colon = id.indexOf(":");
  if (slash <= 0) throw new Error(`invalid canonical id (missing '/'): ${id}`);
  if (colon <= slash + 1) throw new Error(`invalid canonical id (missing ':'): ${id}`);

  const pack = id.slice(0, slash);
  const imp = id.slice(slash + 1, colon);
  const item = id.slice(colon + 1);

  if (!pack || !imp || !item) throw new Error(`invalid canonical id: ${id}`);
  return { pack, imp, item };
}
