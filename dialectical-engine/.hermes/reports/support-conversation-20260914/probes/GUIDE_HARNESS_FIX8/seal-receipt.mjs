import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readdir,readFile,writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

const reportRoot="/Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine/.hermes/reports/support-conversation-20260914";
const evidenceRoot=`${reportRoot}/evidence`;
const logsRoot=`${reportRoot}/logs`;
const harness=fileURLToPath(new URL("./",import.meta.url));
const adapter=fileURLToPath(new URL("../GUIDE_ROW_PROOF_FIX8/",import.meta.url));
const agentReport=`${reportRoot}/agent-reports/GUIDE_HARNESS_FIX8.md`;
const receiptPath=`${evidenceRoot}/GUIDE_HARNESS_FIX8-receipt.json`;
const sha256=bytes => createHash("sha256").update(bytes).digest("hex");
const readJson=async path => JSON.parse(await readFile(path,"utf8"));

const [proof,custody,delta,absence]=await Promise.all([
  readJson(`${evidenceRoot}/GUIDE_HARNESS_FIX8-control-proof.json`),
  readJson(`${evidenceRoot}/GUIDE_HARNESS_FIX8-custody.json`),
  readJson(`${evidenceRoot}/GUIDE_HARNESS_FIX8-control-delta.json`),
  readJson(`${evidenceRoot}/GUIDE_HARNESS_FIX8-output-absence.json`)
]);
assert.equal(proof.result,"PASS");
assert.equal(proof.controls,111);
assert.equal(proof.passed,111);
assert.equal(custody.harnessSha256,proof.harnessSha256);
assert.equal(delta.controls.retained,105);
assert.equal(delta.controls.added,6);
assert.deepEqual(absence.present,[]);

const artifactPaths=[];
for (const directory of [harness,adapter]) {
  for (const name of await readdir(directory)) {
    if (name !== "browser-profile") artifactPaths.push(resolve(directory,name));
  }
}
for (const name of [
  "GUIDE_HARNESS_FIX8-inputs.json","GUIDE_HARNESS_FIX8-control-proof.json",
  "GUIDE_HARNESS_FIX8-custody.json","GUIDE_HARNESS_FIX8-control-delta.json",
  "GUIDE_HARNESS_FIX8-output-absence.json","GUIDE_HARNESS_FIX8.md"
]) artifactPaths.push(`${evidenceRoot}/${name}`);
for (const name of [
  "GUIDE_HARNESS_FIX8-red.log","GUIDE_HARNESS_FIX8-controls-final.log",
  "GUIDE_HARNESS_FIX8-controls-final-r1.log"
]) artifactPaths.push(`${logsRoot}/${name}`);
artifactPaths.push(agentReport);
artifactPaths.sort();

const artifacts=[];
for (const absolute of artifactPaths) {
  const bytes=await readFile(absolute);
  artifacts.push({ absolute,sha256:sha256(bytes),bytes:bytes.length });
}
const receipt={
  schemaVersion:1,node:"GUIDE_HARNESS_FIX8",ticket:"t_37e21e94",session:"/root/preview",
  revision:"0b9320eae5a0ad8c9fcc9648ed85ebef1b289c13",
  kbVersion:proof.kbVersion,verdict:"PASS_BOUNDED_INERT_COMPATIBILITY_CORRECTION",
  finding:"LEGACY_DETERMINISTIC_DECORATION_OMISSION_REJECTED_BEFORE_SAFE_PROJECTION",
  resolution:{
    deterministicBranches:3,modelArraysRequired:true,presentMalformedArraysRejectedEveryBranch:true,
    safeCheckpoint:"API_RECEIVED",
    predicateCodes:[
      "GUIDE_HARNESS_API_BODY_INVALID","GUIDE_HARNESS_API_STATUS_INVALID",
      "GUIDE_HARNESS_API_OUTCOME_INVALID","GUIDE_HARNESS_API_TEXT_INVALID",
      "GUIDE_HARNESS_API_SOURCES_INVALID","GUIDE_HARNESS_API_ACTIONS_INVALID"
    ]
  },
  controls:{
    controls:proof.controls,passed:proof.passed,retainedPurposes:105,addedPurposes:6,
    adapterNegativeControls:3,adapterNegativePassed:3,syntaxFiles:10,
    harnessSha256:proof.harnessSha256
  },
  evidenceFrames:{
    red:{ result:"EXPECTED_FAIL",code:"GUIDE_HARNESS_API_PROJECTION_INVALID",log:`${logsRoot}/GUIDE_HARNESS_FIX8-red.log` },
    firstFinal:{
      result:"FAIL_TEST_FIXTURE",code:"GUIDE_HARNESS_API_DOM_MISMATCH",
      disposition:"New privacy fixture replaced valid model sources while preserving a visible source label; assertion retained and fixture corrected only to add extras to the valid baseline.",
      log:`${logsRoot}/GUIDE_HARNESS_FIX8-controls-final.log`
    },
    reworkFinal:{ result:"PASS",controls:111,passed:111,log:`${logsRoot}/GUIDE_HARNESS_FIX8-controls-final-r1.log` }
  },
  preserved:{
    matrixSha256:custody.matrixSha256,
    preRequestVerifierSha256:custody.preRequestVerifierSha256,
    live4ActualRow43Cause:"UNKNOWN_UNAVAILABLE_NOT_PERSISTED",
    productPatched:false,matrixChanged:false,sourcePolicyChanged:false,navigationChanged:false
  },
  futureOutputs:{ namespace:"GUIDE_LIVE_GUIDE8",checked:absence.checked,present:absence.present,captureExecuted:false },
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
