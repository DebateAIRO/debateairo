import { writeFile } from "node:fs/promises";
import { loadBootstrapRegister } from "./index.js";

const bootstrap = await loadBootstrapRegister();
await writeFile(
  new URL("../../../.env.compose", import.meta.url),
  `POSTGRES_MAJOR_VERSION=${bootstrap.values.postgresMajorVersion}\n`,
  "utf8"
);
