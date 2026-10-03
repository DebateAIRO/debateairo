import { readFileSync, readdirSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { PUBLISHED_JSON_SCHEMA_FILES, SCORECARD_JSON_SCHEMA, publishedJsonSchemaFileText } from "@debateai/scorecard";

const SCHEMA_DIRECTORY = new URL("../../packages/scorecard/schema/", import.meta.url);

describe("the published JSON Schemas are rendered from the zod schemas, never hand-edited", () => {
  it.each(Object.keys(PUBLISHED_JSON_SCHEMA_FILES))("%s on disk is exactly what schema:write writes", (name) => {
    const schema = PUBLISHED_JSON_SCHEMA_FILES[name];
    if (schema === undefined) throw new Error(`no rendered schema named ${name}`);
    expect(readFileSync(new URL(name, SCHEMA_DIRECTORY), "utf8")).toBe(publishedJsonSchemaFileText(schema));
  });

  it("ships no schema file the generator does not write", () => {
    // Only *.schema.json files count: an editor or Finder file (.DS_Store) is not a shipped schema.
    const shipped = readdirSync(SCHEMA_DIRECTORY).filter((name) => name.endsWith(".schema.json"));
    expect(shipped.sort()).toEqual(Object.keys(PUBLISHED_JSON_SCHEMA_FILES).sort());
  });

  it("describes the file an author writes: every field required, unknown future fields allowed", () => {
    expect(SCORECARD_JSON_SCHEMA.$schema).toBe("https://json-schema.org/draft/2020-12/schema");
    expect(SCORECARD_JSON_SCHEMA.required).toEqual(expect.arrayContaining([
      "kind", "formatVersion", "scorecardVersion", "createdAt", "testSetVersion",
      "engineCompatibility", "languages", "candidates", "roles", "pickerSettings"
    ]));
    expect(SCORECARD_JSON_SCHEMA).not.toHaveProperty("additionalProperties");
  });
});
