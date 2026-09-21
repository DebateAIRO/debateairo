import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readdir,readFile,writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

const reportRoot="/Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine/.hermes/reports/support-conversation-20260914";
const evidenceRoot=`${reportRoot}/evidence`;
const logsRoot=`${reportRoot}/logs`;
const harness=fileURLToPath(new URL("./",import.meta.url));
const adapter=fileURLToPath(new URL("../GUIDE_ROW_PROOF_BIND13/",import.meta.url));
const receiptPath=`${evidenceRoot}/GUIDE_HARNESS_BIND13-receipt.json`;
const revision="152eed4da1cd3e66b74d8301159ba76427552409";
const sha256=bytes => createHash("sha256").update(bytes).digest("hex");
const readJson=async path => JSON.parse(await readFile(path,"utf8"));

const [proof,previousProof,custody,delta,absence,probe,capacityPlan]=await Promise.all([
  readJson(`${evidenceRoot}/GUIDE_HARNESS_BIND13-control-proof.json`),
  readJson(`${evidenceRoot}/GUIDE_HARNESS_BIND12-control-proof.json`),
  readJson(`${evidenceRoot}/GUIDE_HARNESS_BIND13-custody.json`),
  readJson(`${evidenceRoot}/GUIDE_HARNESS_BIND13-control-delta.json`),
  readJson(`${evidenceRoot}/GUIDE_HARNESS_BIND13-output-absence.json`),
  readJson(`${evidenceRoot}/GUIDE_HARNESS_BIND13-probe-contract.json`),
  readJson(`${evidenceRoot}/GUIDE_HARNESS_BIND13-natural-capacity-plan.json`)
]);
assert.equal(proof.schemaVersion,2);
assert.equal(proof.result,"PASS");
assert.equal(proof.revision,revision);
assert.equal(proof.controls,120);
assert.equal(proof.passed,120);
assert.equal(previousProof.controls,116);
assert.deepEqual(proof.names.slice(0,116),previousProof.names);
assert.equal(custody.harnessSha256,proof.harnessSha256);
assert.equal(custody.harnessSha256,"4a73ade641ff12f9772aed1d858bf3694224b256d43babed528fa85120a58646");
assert.equal(delta.controls.retained,116);
assert.equal(delta.controls.added,4);
assert.deepEqual(absence.present,[]);
assert.equal(absence.checked,57);
assert.equal(probe.executed,false);
assert.equal(capacityPlan.futureMeasuredCapacityStillRequired,true);

const artifactPaths=[];
for (const directory of [harness,adapter]) {
  for (const name of (await readdir(directory)).sort()) {
    if (name !== "browser-profile") artifactPaths.push(resolve(directory,name));
  }
}
for (const name of [
  "GUIDE_HARNESS_BIND13-inputs.json","GUIDE_HARNESS_BIND13-control-proof.json",
  "GUIDE_HARNESS_BIND13-custody.json","GUIDE_HARNESS_BIND13-control-delta.json",
  "GUIDE_HARNESS_BIND13-output-absence.json","GUIDE_HARNESS_BIND13-probe-contract.json",
  "GUIDE_HARNESS_BIND13-natural-capacity-plan.json","GUIDE_HARNESS_BIND13.md"
]) artifactPaths.push(`${evidenceRoot}/${name}`);
for (const name of [
  "GUIDE_HARNESS_BIND13-base-controls.log","GUIDE_HARNESS_BIND13-base-controls-r2.log",
  "GUIDE_HARNESS_BIND13-base-controls-r3.log","GUIDE_HARNESS_BIND13-controls-final.log",
  "GUIDE_HARNESS_BIND13-package.log"
]) artifactPaths.push(`${logsRoot}/${name}`);
artifactPaths.push(`${reportRoot}/agent-reports/GUIDE_HARNESS_BIND13.md`);
artifactPaths.sort();

const artifacts=[];
for (const absolute of artifactPaths) {
  const bytes=await readFile(absolute);
  artifacts.push({ absolute,sha256:sha256(bytes),bytes:bytes.length });
}
const receipt={
  schemaVersion:1,node:"GUIDE_HARNESS_BIND13",ticket:"t_1c75df2b",session:"/root/preview",
  revision,kbVersion:proof.kbVersion,verdict:"PASS_BOUNDED_COMPACT_PRECONDITION_REPAIR",
  controls:{
    controls:120,passed:120,retainedPurposes:116,addedPurposes:4,
    adapterNegativeControls:3,adapterNegativePassed:3,syntaxFiles:12,finalProductRows:54,
    harnessSha256:proof.harnessSha256,matrixSha256:custody.matrixSha256,
    preRequestVerifierSha256:custody.preRequestVerifierSha256
  },
  preparedProbe:{
    path:probe.script.path,sha256:probe.script.sha256,executed:false,
    transitions:probe.transitions.length,actualForwardedSupportRequests:0,
    outputPath:probe.outputPath,childStatusPreservedBy:probe.childStatusPreservedBy
  },
  futureOutputs:{
    namespace:"GUIDE_LIVE_GUIDE13",checked:absence.checked,present:absence.present,
    captureExecuted:false,uiProbeExecuted:false
  },
  naturalCapacityPlanning:{
    fiveFreeSlotsCalculatedNotBeforeUtc:capacityPlan.fiveFreeSlotsCalculatedNotBeforeUtc,
    kind:capacityPlan.availabilityKind,futureMeasuredCapacityStillRequired:true
  },
  operatorCorrections:[{
    stage:"base inert invocation",result:"ARGUMENT_VALIDATION_FAILED_BEFORE_CONTROLS",
    cause:"relative product path supplied where absolute path is required",
    preservedLog:`${logsRoot}/GUIDE_HARNESS_BIND13-base-controls.log`,
    correctedLogs:[
      `${logsRoot}/GUIDE_HARNESS_BIND13-base-controls-r2.log`,
      `${logsRoot}/GUIDE_HARNESS_BIND13-base-controls-r3.log`
    ]
  }],
  productClean:true,heavyLeaseReleased:true,gitLeaseUsed:false,
  traffic:{ browser:0,runtime:0,http:0,database:0,status:0,capacity:0,supportRequests:0,modelRequests:0 },
  receiptExcludesItself:true,artifacts,
  limits:[
    "The zero-Support real-UI probe is prepared but was not executed.",
    "LIVE7 exact historical UI state and cause remain unresolved; no product defect is claimed.",
    "A future capture still requires separate baseline review, successful operational UI probe, supported runtime readiness and one fresh measured capacity gate.",
    "The natural not-before is a calculation from sealed upper bounds, not a current capacity measurement.",
    "Forgot remains unresolved and actionless; CP2 remains gated; no readiness or acceptance is claimed."
  ]
};
await writeFile(receiptPath,`${JSON.stringify(receipt,null,2)}\n`,{ flag:"wx",mode:0o600 });
const receiptBytes=await readFile(receiptPath);
process.stdout.write(`${JSON.stringify({
  receiptPath,sha256:sha256(receiptBytes),bytes:receiptBytes.length,
  artifacts:artifacts.length,verdict:receipt.verdict
},null,2)}\n`);
