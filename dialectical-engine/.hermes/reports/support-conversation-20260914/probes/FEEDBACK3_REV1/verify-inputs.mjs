import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";

const ROOT = "/Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine";
const PRODUCT = `${ROOT}/.worktrees/support-cp1-p3-correctness/dialectical-engine`;
const manifestPath = `${ROOT}/.hermes/reports/support-conversation-20260914/evidence/GATE_FEEDBACK3-manifest.json`;
const manifest = JSON.parse(readFileSync(manifestPath,"utf8"));
const sha256 = (path) => createHash("sha256").update(readFileSync(path)).digest("hex");
const mismatches = [];

for (const item of manifest.immutableInputs) {
  const bytes = readFileSync(item.path).byteLength;
  const digest = sha256(item.path);
  if (bytes !== item.bytes || digest !== item.sha256) {
    mismatches.push({ kind:"immutable",path:item.path,expected:{ bytes:item.bytes,sha256:item.sha256 },actual:{ bytes,sha256:digest } });
  }
}
for (const item of manifest.productFiles) {
  const path = `${PRODUCT}/${item.laneRelative}`;
  const bytes = readFileSync(path).byteLength;
  const digest = sha256(path);
  if (bytes !== item.bytes || digest !== item.sha256) {
    mismatches.push({ kind:"product",path,expected:{ bytes:item.bytes,sha256:item.sha256 },actual:{ bytes,sha256:digest } });
  }
}

const output = {
  status:mismatches.length === 0 ? "PASS" : "FAIL",
  revision:manifest.revision,base:manifest.base,
  counts:{ immutableInputs:manifest.immutableInputs.length,productFiles:manifest.productFiles.length,changedPaths:manifest.changedPaths.length },
  mismatches
};
process.stdout.write(`${JSON.stringify(output)}\n`);
if (mismatches.length > 0) process.exitCode = 1;
