import { mkdir, writeFile } from "node:fs/promises";
import { PUBLISHED_JSON_SCHEMA_FILES, publishedJsonSchemaFileText } from "../src/json-schema.js";

// `pnpm --filter @debateai/scorecard run schema:write`. The folder is found from this file's
// own location — never a machine path, never the working directory.
const schemaDirectory = new URL("../schema/", import.meta.url);
await mkdir(schemaDirectory, { recursive: true });
for (const [name, schema] of Object.entries(PUBLISHED_JSON_SCHEMA_FILES)) {
  await writeFile(new URL(name, schemaDirectory), publishedJsonSchemaFileText(schema), "utf8");
}
