import { writeFile } from "node:fs/promises";

const marker=process.env.GUIDE_FIX26_SENTINEL_PATH;
if (typeof marker !== "string" || !marker.startsWith("/")) {
  throw new Error("GUIDE_FIX26_SENTINEL_PATH_MISSING");
}
await writeFile(marker,"capture-child-spawned\n",{ flag:"wx",mode:0o600 });
