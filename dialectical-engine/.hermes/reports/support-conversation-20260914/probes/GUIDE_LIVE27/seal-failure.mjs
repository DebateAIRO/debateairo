import { createHash } from "node:crypto";
import { readdir, readFile, stat, writeFile } from "node:fs/promises";
import { join } from "node:path";

const ROOT = "/Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine/.hermes/reports/support-conversation-20260914";
const E = `${ROOT}/evidence`;
const MANIFEST = `${E}/GUIDE_LIVE27-manifest.json`;
const RECEIPT = `${E}/GUIDE_LIVE27-receipt.json`;
const sha256 = bytes => createHash("sha256").update(bytes).digest("hex");
async function walk(path) {
  const result = [];
  for (const entry of await readdir(path, { withFileTypes: true })) {
    const absolute = join(path, entry.name);
    if (entry.isDirectory()) result.push(...await walk(absolute));
    else if (entry.isFile()) result.push(absolute);
  }
  return result;
}
async function record(absolute) {
  const bytes = await readFile(absolute);
  return { absolute, sha256: sha256(bytes), bytes: bytes.byteLength };
}
const candidates = (await walk(ROOT)).filter(path => {
  if (path === MANIFEST || path === RECEIPT) return false;
  if (path.startsWith(`${ROOT}/probes/GUIDE_LIVE27/`)) return true;
  return path.split("/").at(-1).startsWith("GUIDE_LIVE27");
}).sort();
const artifacts = [];
for (const path of candidates) if ((await stat(path)).isFile()) artifacts.push(await record(path));
const base = {
  schemaVersion: 1,
  node: "GUIDE_LIVE27",
  ticket: "t_0d922a12",
  revision: "456cafb9e56a737de550570b5736ec52d79ddf48",
  verdict: "STOPPED_PREFLIGHT_RUNTIME_PROCESS_CHECK"
};
await writeFile(MANIFEST, `${JSON.stringify({ ...base, artifactCount: artifacts.length, artifacts }, null, 2)}\n`, { flag: "wx", mode: 0o600 });
await writeFile(RECEIPT, `${JSON.stringify({ ...base, artifacts: [...artifacts, await record(MANIFEST)] }, null, 2)}\n`, { flag: "wx", mode: 0o600 });
process.stdout.write(`${JSON.stringify({ manifest: await record(MANIFEST), receipt: await record(RECEIPT), artifactCount: artifacts.length })}\n`);

