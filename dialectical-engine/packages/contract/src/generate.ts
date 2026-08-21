import { mkdir, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { contractInventory } from "./index.js";

const generatedDirectory = fileURLToPath(new URL("../generated", import.meta.url));
await mkdir(generatedDirectory, { recursive: true });
const fieldInventory = {
  contractVersion: "v1",
  routes: contractInventory.routes,
  resources: Object.fromEntries(Object.entries(contractInventory.resources).map(([name, schema]) => [
    name,
    "shape" in schema ? Object.keys(schema.shape) : []
  ]))
};
await writeFile(
  new URL("../generated/field-inventory.json", import.meta.url),
  `${JSON.stringify(fieldInventory, null, 2)}\n`,
  "utf8"
);
await writeFile(
  new URL("../generated/openapi.json", import.meta.url),
  `${JSON.stringify({
    openapi: "3.1.0",
    info: { title: "DebateAI V3", version: "v1" },
    paths: Object.fromEntries(contractInventory.routes.map((route) => {
      const separator = route.indexOf(" ");
      const method = route.slice(0, separator).toLowerCase();
      const path = route.slice(separator + 1);
      return [path, { [method]: { operationId: route.replaceAll(/[^A-Za-z0-9]+/g, "_") } }];
    }))
  }, null, 2)}\n`,
  "utf8"
);
await writeFile(
  new URL("../generated/client.ts", import.meta.url),
  `// Generated from packages/contract/src/index.ts; do not edit.\n` +
  `export * from "../src/index.js";\n` +
  `export * from "../src/client.js";\n`,
  "utf8"
);
