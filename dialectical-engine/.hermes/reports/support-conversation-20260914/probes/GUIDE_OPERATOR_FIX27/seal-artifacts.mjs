import { createHash } from "node:crypto";
import { readdir, readFile, stat, writeFile } from "node:fs/promises";
import { join } from "node:path";

const ROOT = "/Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine/.hermes/reports/support-conversation-20260914";
const E = `${ROOT}/evidence`;
const MANIFEST = `${E}/GUIDE_OPERATOR_FIX27-manifest.json`;
const RECEIPT = `${E}/GUIDE_OPERATOR_FIX27-receipt.json`;
const sha256 = bytes => createHash("sha256").update(bytes).digest("hex");
async function filesUnder(path) {
  const result = [];
  for (const entry of await readdir(path, { withFileTypes: true })) {
    const absolute = join(path, entry.name);
    if (entry.isDirectory()) result.push(...await filesUnder(absolute));
    else if (entry.isFile()) result.push(absolute);
  }
  return result;
}
async function record(absolute) {
  const bytes = await readFile(absolute);
  return { absolute, sha256: sha256(bytes), bytes: bytes.byteLength };
}

const candidates = (await filesUnder(ROOT)).filter(path => {
  if (path === MANIFEST || path === RECEIPT) return false;
  if (path.startsWith(`${ROOT}/probes/GUIDE_OPERATOR_FIX27/`)) return true;
  return path.split("/").at(-1).startsWith("GUIDE_OPERATOR_FIX27");
}).sort();
const artifacts = [];
for (const path of candidates) {
  if ((await stat(path)).isFile()) artifacts.push(await record(path));
}
const base = {
  schemaVersion: 1,
  node: "GUIDE_OPERATOR_FIX27",
  ticket: "t_c68906dd",
  revision: "456cafb9e56a737de550570b5736ec52d79ddf48",
  verdict: "PASS_OPERATOR_LOG_OWNERSHIP"
};
const manifest = { ...base, artifactCount: artifacts.length, artifacts };
await writeFile(MANIFEST, `${JSON.stringify(manifest, null, 2)}\n`, { flag: "wx", mode: 0o600 });
const receiptArtifacts = [...artifacts, await record(MANIFEST)];
const receipt = { ...base, artifacts: receiptArtifacts };
await writeFile(RECEIPT, `${JSON.stringify(receipt, null, 2)}\n`, { flag: "wx", mode: 0o600 });
process.stdout.write(`${JSON.stringify({ manifest: await record(MANIFEST), receipt: await record(RECEIPT), artifactCount: artifacts.length })}\n`);

