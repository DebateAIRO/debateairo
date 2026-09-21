import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readdir,readFile,writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

const reportRoot="/Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine/.hermes/reports/support-conversation-20260914";
const evidenceRoot=`${reportRoot}/evidence`;
const logsRoot=`${reportRoot}/logs`;
const harness=fileURLToPath(new URL("./",import.meta.url));
const adapter=fileURLToPath(new URL("../GUIDE_ROW_PROOF_FIX9/",import.meta.url));
const agentReport=`${reportRoot}/agent-reports/GUIDE_HARNESS_FIX9.md`;
const receiptPath=`${evidenceRoot}/GUIDE_HARNESS_FIX9-receipt.json`;
const sha256=bytes => createHash("sha256").update(bytes).digest("hex");
const readJson=async path => JSON.parse(await readFile(path,"utf8"));

const [proof,custody,delta,absence]=await Promise.all([
  readJson(`${evidenceRoot}/GUIDE_HARNESS_FIX9-control-proof.json`),
  readJson(`${evidenceRoot}/GUIDE_HARNESS_FIX9-custody.json`),
  readJson(`${evidenceRoot}/GUIDE_HARNESS_FIX9-control-delta.json`),
  readJson(`${evidenceRoot}/GUIDE_HARNESS_FIX9-output-absence.json`)
]);
assert.equal(proof.result,"PASS");
assert.equal(proof.controls,112);
assert.equal(proof.passed,112);
assert.equal(custody.harnessSha256,proof.harnessSha256);
assert.equal(delta.controls.retained,111);
assert.equal(delta.controls.added,1);
assert.deepEqual(absence.present,[]);

const artifactPaths=[];
for (const directory of [harness,adapter]) {
  for (const name of await readdir(directory)) {
    if (name !== "browser-profile") artifactPaths.push(resolve(directory,name));
  }
}
for (const name of [
  "GUIDE_HARNESS_FIX9-inputs.json","GUIDE_HARNESS_FIX9-control-proof.json",
  "GUIDE_HARNESS_FIX9-custody.json","GUIDE_HARNESS_FIX9-control-delta.json",
  "GUIDE_HARNESS_FIX9-output-absence.json","GUIDE_HARNESS_FIX9.md"
]) artifactPaths.push(`${evidenceRoot}/${name}`);
for (const name of [
  "GUIDE_HARNESS_FIX9-red.log","GUIDE_HARNESS_FIX9-controls-final.log",
  "GUIDE_HARNESS_FIX9-package.log"
]) artifactPaths.push(`${logsRoot}/${name}`);
artifactPaths.push(agentReport);
artifactPaths.sort();

const artifacts=[];
for (const absolute of artifactPaths) {
  const bytes=await readFile(absolute);
  artifacts.push({ absolute,sha256:sha256(bytes),bytes:bytes.length });
}
const receipt={
  schemaVersion:1,node:"GUIDE_HARNESS_FIX9",ticket:"t_6fce3fbf",session:"/root/preview",
  revision:"0b9320eae5a0ad8c9fcc9648ed85ebef1b289c13",
  kbVersion:proof.kbVersion,verdict:"PASS_BOUNDED_PARSE_CLASSIFICATION_CORRECTION",
  finding:"JSON_PARSE_FAILURE_COLLAPSED_TO_OBJECT",
  resolution:{
    responseReadParseFailureSentinel:null,numericStatusRetained:true,
    safeCheckpoint:"API_RECEIVED",failureCode:"GUIDE_HARNESS_API_BODY_INVALID",
    rawResponseRetained:false,parseExceptionRetained:false,headersRetained:false,cookiesRetained:false
  },
  controls:{
    controls:proof.controls,passed:proof.passed,retainedPurposes:111,addedPurposes:1,
    adapterNegativeControls:3,adapterNegativePassed:3,syntaxFiles:10,
    harnessSha256:proof.harnessSha256
  },
  evidenceFrames:{
    red:{ result:"EXPECTED_FAIL",code:"GUIDE_HARNESS_RESPONSE_READ_BOUNDARY_MISSING",log:`${logsRoot}/GUIDE_HARNESS_FIX9-red.log` },
    final:{ result:"PASS",controls:112,passed:112,log:`${logsRoot}/GUIDE_HARNESS_FIX9-controls-final.log` }
  },
  preserved:{
    matrixSha256:custody.matrixSha256,
    preRequestVerifierSha256:custody.preRequestVerifierSha256,
    live4ActualRow43Cause:"UNKNOWN_UNAVAILABLE_NOT_PERSISTED",
    productPatched:false,matrixChanged:false,sourcePolicyChanged:false,navigationChanged:false
  },
  futureOutputs:{ namespace:"GUIDE_LIVE_GUIDE9",checked:absence.checked,present:absence.present,captureExecuted:false },
  productClean:true,heavyLeaseReleased:true,gitLeaseUsed:false,
  traffic:{ browser:0,runtime:0,http:0,database:0,supportRequests:0,modelRequests:0 },
  receiptExcludesItself:true,artifacts,
  limits:[
    "The actual LIVE4 row43 response and exact cause remain unknown and are not relabeled.",
    "No live retry or product behavior change occurred.",
    "Forgot remains unresolved and actionless; CP2 remains gated.",
    "No preview readiness, checkpoint acceptance, or owner acceptance is claimed."
  ]
};
await writeFile(receiptPath,`${JSON.stringify(receipt,null,2)}\n`,{ flag:"wx",mode:0o600 });
const receiptBytes=await readFile(receiptPath);
process.stdout.write(`${JSON.stringify({
  receiptPath,sha256:sha256(receiptBytes),bytes:receiptBytes.length,
  artifacts:artifacts.length,verdict:receipt.verdict
},null,2)}\n`);
