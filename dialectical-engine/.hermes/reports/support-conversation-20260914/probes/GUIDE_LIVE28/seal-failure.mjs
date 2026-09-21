import { createHash } from "node:crypto";
import { readdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";

const ROOT = "/Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine/.hermes/reports/support-conversation-20260914";
const E = `${ROOT}/evidence`;
const MANIFEST = `${E}/GUIDE_LIVE28-manifest.json`;
const RECEIPT = `${E}/GUIDE_LIVE28-receipt.json`;
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
const explicit = [
  `${E}/GUIDE_LIVE27-prerequisites.json`, `${E}/GUIDE_LIVE27-stop.json`,
  ...["preflight", "readiness", "capacity", "gate", "rowProof", "capture"]
    .map(phase => `${ROOT}/logs/GUIDE_OPERATOR_FIX27-operator-${phase}.log`),
  `${E}/GUIDE_LIVE25-preflight.json`, `${E}/GUIDE_LIVE25-readiness.json`,
  `${E}/GUIDE_LIVE25-capacity.json`, `${E}/GUIDE_LIVE25-gate.json`,
  `${E}/GUIDE_LIVE25-row-proof-status.json`, `${ROOT}/logs/GUIDE_LIVE25-row-proof.log`,
  `${E}/GUIDE_ROW_PROOF-run-LIVE25.json`, `${E}/GUIDE_LIVE25-capture.json`,
  `${ROOT}/logs/GUIDE_LIVE25-capture.log`, `${E}/GUIDE_UI_TRANSITION_PROBE-run-LIVE25.json`,
  `${ROOT}/logs/GUIDE_UI_TRANSITION_PROBE-LIVE25.log`, `${E}/GUIDE_LIVE_GUIDE21-actual-receipt.json`
];
const prefixed = (await walk(ROOT)).filter(path => {
  if (path === MANIFEST || path === RECEIPT) return false;
  if (path.startsWith(`${ROOT}/probes/GUIDE_LIVE28/`)) return true;
  return path.split("/").at(-1).startsWith("GUIDE_LIVE28");
});
const paths = [...new Set([...prefixed, ...explicit])].sort();
const artifacts = [];
for (const path of paths) artifacts.push(await record(path));
const base = {
  schemaVersion: 1,
  node: "GUIDE_LIVE28",
  ticket: "t_0874e640",
  revision: "456cafb9e56a737de550570b5736ec52d79ddf48",
  verdict: "STOPPED_CAPTURE_SCREENSHOT_TARGET_MISMATCH"
};
await writeFile(MANIFEST, `${JSON.stringify({ ...base, artifactCount: artifacts.length, artifacts }, null, 2)}\n`, { flag: "wx", mode: 0o600 });
await writeFile(RECEIPT, `${JSON.stringify({ ...base, artifacts: [...artifacts, await record(MANIFEST)] }, null, 2)}\n`, { flag: "wx", mode: 0o600 });
process.stdout.write(`${JSON.stringify({ manifest: await record(MANIFEST), receipt: await record(RECEIPT), artifactCount: artifacts.length })}\n`);

