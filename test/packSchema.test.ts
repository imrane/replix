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

  it("parses vars contract with schema version", () => {
    const pack = parsePackJson({
      id: "core",
      version: "1.0.0",
      imports: [],
      varsSchemaVersion: 1,
      vars: {
        required: {
          API_TOKEN: { secret: true, source: "file|env" },
        },
        optional: {
          PROFILE: { default: "dev" },
        },
      },
    });

    expect(pack.varsSchemaVersion).toBe(1);
    expect(pack.vars?.required.API_TOKEN.secret).toBe(true);
    expect(pack.vars?.optional.PROFILE.default).toBe("dev");
  });

  it("rejects unsupported vars schema version", () => {
    expect(() =>
      parsePackJson({
        id: "core",
        version: "1.0.0",
        imports: [],
        varsSchemaVersion: 2,
      }),
    ).toThrow("pack.varsSchemaVersion must be 1 when present");
  });

  it("rejects duplicate var keys across required/optional", () => {
    expect(() =>
      parsePackJson({
        id: "core",
        version: "1.0.0",
        imports: [],
        varsSchemaVersion: 1,
        vars: {
          required: { API_TOKEN: {} },
          optional: { API_TOKEN: {} },
        },
      }),
    ).toThrow("duplicates key across required/optional");
  });
});
