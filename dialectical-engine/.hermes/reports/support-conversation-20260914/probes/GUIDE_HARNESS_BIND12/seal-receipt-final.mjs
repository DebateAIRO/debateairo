import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readdir, readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

const reportRoot="/Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine/.hermes/reports/support-conversation-20260914";
const evidenceRoot=`${reportRoot}/evidence`;
const logsRoot=`${reportRoot}/logs`;
const harness=fileURLToPath(new URL("./",import.meta.url));
const adapter=fileURLToPath(new URL("../GUIDE_ROW_PROOF_BIND12/",import.meta.url));
const receiptPath=`${evidenceRoot}/GUIDE_HARNESS_BIND12-receipt.json`;
const revision="152eed4da1cd3e66b74d8301159ba76427552409";
const sha256=bytes=>createHash("sha256").update(bytes).digest("hex");
const readJson=async path=>JSON.parse(await readFile(path,"utf8"));

const [proof,previousProof,custody,delta,absence,inventory]=await Promise.all([
  readJson(`${evidenceRoot}/GUIDE_HARNESS_BIND12-control-proof.json`),
  readJson(`${evidenceRoot}/GUIDE_HARNESS_BIND11-control-proof.json`),
  readJson(`${evidenceRoot}/GUIDE_HARNESS_BIND12-custody.json`),
  readJson(`${evidenceRoot}/GUIDE_HARNESS_BIND12-control-delta.json`),
  readJson(`${evidenceRoot}/GUIDE_HARNESS_BIND12-output-absence.json`),
  readJson(`${evidenceRoot}/GATE_GUIDE_FINAL9-manifest.json`),
]);
assert.equal(proof.schemaVersion,2);
assert.equal(proof.result,"PASS");
assert.equal(proof.revision,revision);
assert.equal(proof.controls,116);
assert.equal(proof.passed,116);
assert.deepEqual(proof.names.slice(0,112),previousProof.names);
assert.equal(custody.harnessSha256,proof.harnessSha256);
assert.equal(delta.controls.retained,112);
assert.equal(delta.controls.added,4);
assert.equal(inventory.productFiles.length,144);
assert.equal(inventory.deletedProductPaths.length,3);
assert.deepEqual(absence.present,[]);

const artifactPaths=[];
for (const directory of [harness,adapter]) {
  for (const name of (await readdir(directory)).sort()) {
    if (name !== "browser-profile") artifactPaths.push(resolve(directory,name));
  }
}
for (const name of [
  "GUIDE_HARNESS_BIND12-inputs.json","GUIDE_HARNESS_BIND12-control-proof.json",
  "GUIDE_HARNESS_BIND12-custody.json","GUIDE_HARNESS_BIND12-control-delta.json",
  "GUIDE_HARNESS_BIND12-output-absence.json","GUIDE_HARNESS_BIND12.md",
  "GATE_GUIDE_FINAL9-manifest.json","GUIDE_LOCK_HANDOFF_FIX-snapshot-receipt.json",
  "GUIDE_LOCK_HANDOFF_FIX-required-suites.json"
]) artifactPaths.push(`${evidenceRoot}/${name}`);
for (const name of [
  "GUIDE_HARNESS_BIND12-inventory.log","GUIDE_HARNESS_BIND12-inventory-r2.log",
  "GUIDE_HARNESS_BIND12-inventory-r3.log","GUIDE_HARNESS_BIND12-controls-final.log",
  "GUIDE_HARNESS_BIND12-package.log"
]) artifactPaths.push(`${logsRoot}/${name}`);
artifactPaths.push(`${reportRoot}/agent-reports/GUIDE_HARNESS_BIND12.md`);
artifactPaths.sort();

const artifacts=[];
for (const absolute of artifactPaths) {
  const bytes=await readFile(absolute);
  artifacts.push({ absolute,sha256:sha256(bytes),bytes:bytes.length });
}
const receipt={
  schemaVersion:1,node:"GUIDE_HARNESS_BIND12",ticket:"t_c804f2f1",session:"/root/preview",
  revision,kbVersion:proof.kbVersion,verdict:"PASS_BOUNDED_FINAL_INVENTORY_BINDING",
  inventory:{
    path:`${evidenceRoot}/GATE_GUIDE_FINAL9-manifest.json`,
    sha256:sha256(await readFile(`${evidenceRoot}/GATE_GUIDE_FINAL9-manifest.json`)),
    presentFiles:144,deletedPaths:3,attestedFiles:6,priorFinal8PresentFiles:0,
  },
  controls:{
    controls:116,passed:116,retainedPurposes:112,addedPurposes:4,
    adapterNegativeControls:3,adapterNegativePassed:3,syntaxFiles:11,finalProductRows:54,
    harnessSha256:proof.harnessSha256,matrixSha256:custody.matrixSha256,
    preRequestVerifierSha256:custody.preRequestVerifierSha256,
  },
  futureOutputs:{ namespace:"GUIDE_LIVE_GUIDE12",checked:absence.checked,present:absence.present,captureExecuted:false },
  productClean:true,heavyLeaseReleased:true,gitLeaseUsed:false,
  traffic:{ browser:0,runtime:0,http:0,database:0,status:0,capacity:0,supportRequests:0,modelRequests:0 },
  receiptExcludesItself:true,artifacts,
  limits:[
    "No live gate, runtime capacity record, browser capture, or actual row response was produced.",
    "The all-54 adapter projection requires a genuine later fresh gate.",
    "The healthy GUIDE_RUNTIME6 stack remained untouched.",
    "Forgot remains unresolved and actionless; CP2 remains gated; no readiness or acceptance is claimed."
  ]
};
await writeFile(receiptPath,`${JSON.stringify(receipt,null,2)}\n`,{flag:"wx",mode:0o600});
const receiptBytes=await readFile(receiptPath);
process.stdout.write(`${JSON.stringify({ receiptPath,sha256:sha256(receiptBytes),bytes:receiptBytes.length,artifacts:artifacts.length,verdict:receipt.verdict },null,2)}\n`);
