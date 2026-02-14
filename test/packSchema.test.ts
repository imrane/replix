import { describe, expect, it } from "bun:test";
import { parsePackJson } from "../src/packSchema";

describe("pack schema", () => {
  it("parses minimal pack.json", () => {
    const pack = parsePackJson({ id: "core", version: "1.0.0", imports: [] });
    expect(pack.id).toBe("core");
    expect(pack.version).toBe("1.0.0");
    expect(pack.imports).toEqual([]);
  });

  it("rejects missing id", () => {
    // @ts-expect-error
    expect(() => parsePackJson({ version: "1.0.0" })).toThrow();
  });

  it("rejects non-string version", () => {
    // @ts-expect-error
    expect(() => parsePackJson({ id: "core", version: 1 })).toThrow();
  });
});
