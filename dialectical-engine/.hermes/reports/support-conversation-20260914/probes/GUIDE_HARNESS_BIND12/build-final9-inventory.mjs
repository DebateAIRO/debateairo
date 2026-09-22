import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { readFile, stat, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

const productRoot = "/Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine/.worktrees/support-conversation-cp1/dialectical-engine";
const evidenceRoot = "/Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine/.hermes/reports/support-conversation-20260914/evidence";
const baseline = "b7ca2c413bf3242ce18e29a397dc9a3aa9228893";
const revision = "152eed4da1cd3e66b74d8301159ba76427552409";
const priorPath = `${evidenceRoot}/GATE_GUIDE_FINAL7-manifest.json`;
const brokenPath = `${evidenceRoot}/GATE_GUIDE_FINAL8-manifest.json`;
const attestationPath = `${evidenceRoot}/GUIDE_LOCK_HANDOFF_FIX-snapshot-receipt.json`;
const outputPath = `${evidenceRoot}/GATE_GUIDE_FINAL9-manifest.json`;
const sha256 = (bytes) => createHash("sha256").update(bytes).digest("hex");
const run = (file, args, options = {}) => execFileSync(file, args, { encoding: "utf8", ...options }).trim();
const stripPrefix = (path) => {
  const prefix = "dialectical-engine/";
  assert.equal(path.startsWith(prefix), true);
  return path.slice(prefix.length);
};

assert.equal(run("git", ["-C", productRoot, "rev-parse", "HEAD"]), revision);
assert.equal(run("git", ["-C", productRoot, "status", "--short"]), "");
const [prior, broken, attestation] = await Promise.all([
  readFile(priorPath, "utf8").then(JSON.parse),
  readFile(brokenPath, "utf8").then(JSON.parse),
  readFile(attestationPath, "utf8").then(JSON.parse),
]);
assert.equal(prior.revision, "78988fc2e5e24595bd9cd6ec0a3965c6039dc718");
assert.equal(prior.productFiles.length, 144);
assert.equal(broken.revision, revision);
assert.equal(broken.productFiles.length, 0);
assert.equal(attestation.finalCommit, revision);

const changed = [];
const deleted = [];
for (const line of run("git", ["-C", productRoot, "diff", "--name-status", "--find-renames", `${baseline}..${revision}`]).split("\n")) {
  const fields = line.split("\t");
  const statusCode = fields[0];
  if (statusCode === "D") deleted.push(stripPrefix(fields[1]));
  else if (statusCode === "A" || statusCode === "M") changed.push(stripPrefix(fields[1]));
  else if (statusCode.startsWith("R")) {
    deleted.push(stripPrefix(fields[1]));
    changed.push(stripPrefix(fields[2]));
  } else throw new Error(`GUIDE_HARNESS_BIND12_UNSUPPORTED_GIT_STATUS_${statusCode}`);
}
changed.sort();
deleted.sort();
const priorMembers = prior.productFiles.map(({ laneRelative }) => laneRelative).sort();
assert.deepEqual(changed, priorMembers);
assert.deepEqual(deleted, [...prior.deletedProductPaths].sort());
assert.deepEqual(broken.changedPaths.map(stripPrefix).sort(), changed);
assert.deepEqual(broken.deletedProductPaths.map(stripPrefix).sort(), deleted);

const productFiles = [];
for (const laneRelative of changed) {
  const absolute = resolve(productRoot, laneRelative);
  assert.equal(absolute.startsWith(`${resolve(productRoot)}/`), true);
  const bytes = await readFile(absolute);
  productFiles.push({ laneRelative, absolute, sha256: sha256(bytes), bytes: bytes.byteLength });
}
assert.equal(productFiles.length, 144);
assert.equal(new Set(productFiles.map(({ laneRelative }) => laneRelative)).size, productFiles.length);
const byPath = new Map(productFiles.map((file) => [file.laneRelative, file]));
const attestedFiles = Object.values(attestation.files);
for (const attested of attestedFiles) {
  const current = byPath.get(attested.laneRelative);
  assert.notEqual(current, undefined);
  assert.equal(current.sha256, attested.sha256);
  assert.equal(current.bytes, attested.bytes);
}

for (const input of broken.immutableInputs) {
  const bytes = await readFile(input.path);
  const details = await stat(input.path);
  assert.equal(sha256(bytes), input.sha256);
  assert.equal(details.size, input.bytes);
}

const manifest = {
  revision,
  base: broken.base,
  originalBaseline: baseline,
  changedPaths: changed,
  productFiles,
  deletedProductPaths: deleted,
  immutableInputs: broken.immutableInputs,
};
await writeFile(outputPath, `${JSON.stringify(manifest, null, 2)}\n`, { mode: 0o600, flag: "wx" });
process.stdout.write(`${JSON.stringify({
  schemaVersion: 1,
  result: "PASS",
  revision,
  cumulativeGitDelta: { present: changed.length, deleted: deleted.length },
  productFiles: productFiles.length,
  productInventorySha256: sha256(await readFile(outputPath)),
  attestedFileReferences: attestedFiles.length,
  uniqueAttestedFiles: new Set(attestedFiles.map(({ laneRelative }) => laneRelative)).size,
  immutableInputs: broken.immutableInputs.length,
  priorFinal7MembersRetained: priorMembers.length,
  brokenFinal8ProductFiles: broken.productFiles.length,
}, null, 2)}\n`);
