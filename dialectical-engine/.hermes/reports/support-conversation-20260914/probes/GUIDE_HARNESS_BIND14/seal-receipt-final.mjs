import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readdir,readFile,writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

const reportRoot="/Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine/.hermes/reports/support-conversation-20260914";
const evidenceRoot=`${reportRoot}/evidence`;
const logsRoot=`${reportRoot}/logs`;
const harness=fileURLToPath(new URL("./",import.meta.url));
const adapter=fileURLToPath(new URL("../GUIDE_ROW_PROOF_BIND14/",import.meta.url));
const receiptPath=`${evidenceRoot}/GUIDE_HARNESS_BIND14-receipt.json`;
const revision="152eed4da1cd3e66b74d8301159ba76427552409";
const sha256=bytes => createHash("sha256").update(bytes).digest("hex");
const readJson=async path => JSON.parse(await readFile(path,"utf8"));

const [proof,previous,custody,delta,absence,probe,diagnosis]=await Promise.all([
  readJson(`${evidenceRoot}/GUIDE_HARNESS_BIND14-control-proof.json`),
  readJson(`${evidenceRoot}/GUIDE_HARNESS_BIND13-control-proof.json`),
  readJson(`${evidenceRoot}/GUIDE_HARNESS_BIND14-custody.json`),
  readJson(`${evidenceRoot}/GUIDE_HARNESS_BIND14-control-delta.json`),
  readJson(`${evidenceRoot}/GUIDE_HARNESS_BIND14-output-absence.json`),
  readJson(`${evidenceRoot}/GUIDE_HARNESS_BIND14-probe-contract.json`),
  readJson(`${evidenceRoot}/GUIDE_HARNESS_BIND14-diagnosis.json`)
]);
assert.equal(proof.schemaVersion,2);
assert.equal(proof.result,"PASS");
assert.equal(proof.revision,revision);
assert.equal(proof.controls,127);
assert.equal(proof.passed,127);
assert.equal(previous.controls,120);
assert.deepEqual(proof.names.slice(0,120),previous.names);
assert.equal(custody.harnessSha256,proof.harnessSha256);
assert.equal(custody.harnessSha256,"ba72808c15fe611c1999e440c206cb41d637d064884dde856a82ee7865f6f0d6");
assert.equal(delta.controls.retained,120);
assert.equal(delta.controls.added,7);
assert.deepEqual(absence.present,[]);
assert.equal(absence.checked,57);
assert.equal(probe.executed,false);
assert.equal(diagnosis.established.length,2);

const artifactPaths=[];
for (const directory of [harness,adapter]) {
  for (const name of (await readdir(directory)).filter(name => name !== "browser-profile").sort()) {
    artifactPaths.push(resolve(directory,name));
  }
}
for (const name of [
  "GUIDE_HARNESS_BIND14-inputs.json","GUIDE_HARNESS_BIND14-control-proof.json",
  "GUIDE_HARNESS_BIND14-custody.json","GUIDE_HARNESS_BIND14-control-delta.json",
  "GUIDE_HARNESS_BIND14-output-absence.json","GUIDE_HARNESS_BIND14-probe-contract.json",
  "GUIDE_HARNESS_BIND14-diagnosis.json","GUIDE_HARNESS_BIND14.md"
]) artifactPaths.push(`${evidenceRoot}/${name}`);
for (const name of ["GUIDE_HARNESS_BIND14-controls-final.log","GUIDE_HARNESS_BIND14-package.log"]) {
  artifactPaths.push(`${logsRoot}/${name}`);
}
artifactPaths.push(`${reportRoot}/agent-reports/GUIDE_HARNESS_BIND14.md`);
artifactPaths.sort();

const artifacts=[];
for (const absolute of artifactPaths) {
  const bytes=await readFile(absolute);
  artifacts.push({ absolute,sha256:sha256(bytes),bytes:bytes.length });
}
const receipt={
  schemaVersion:1,node:"GUIDE_HARNESS_BIND14",ticket:"t_f14d341e",session:"/root/preview",
  revision,kbVersion:proof.kbVersion,verdict:"PASS_BOUNDED_FULL_READINESS_AND_ROUTE_GUARD",
  controls:{
    controls:127,passed:127,retainedPurposes:120,addedPurposes:7,
    adapterNegativeControls:3,adapterNegativePassed:3,syntaxFiles:12,finalProductRows:54,
    harnessSha256:proof.harnessSha256,matrixSha256:custody.matrixSha256,
    preRequestVerifierSha256:custody.preRequestVerifierSha256
  },
  correction:{
    fullReadiness:"REVERSIBLE_PUBLIC_MODE_TRANSITION_WITH_SESSION_PRESERVING_LOCALE_SELECTION",
    blockedPageRead:{ method:"GET",path:"/api/v1/support/cases",counter:"pageCaseListRead",forwarded:false },
    compactOneClickPreserved:true,productPatch:false
  },
  supplementalInputs:[diagnosis.supplementalScope],
  preparedProbe:{
    path:probe.script.path,sha256:probe.script.sha256,executed:false,
    transitions:probe.transitions.length,actualForwardedSupportRequests:0,
    outputPath:probe.outputPath,logPath:probe.logPath,
    childStatusPreservedBy:probe.childStatusPreservedBy
  },
  futureOutputs:{
    namespace:"GUIDE_LIVE_GUIDE14",checked:absence.checked,present:absence.present,
    captureExecuted:false,uiProbeExecuted:false
  },
  productClean:true,heavyLeaseReleased:true,gitLeaseUsed:false,
  traffic:{ browser:0,runtime:0,http:0,database:0,status:0,capacity:0,supportRequests:0,modelRequests:0 },
  receiptExcludesItself:true,artifacts,
  limits:[
    "The corrected zero-Support real-UI probe is prepared but was not executed.",
    "The old otherSupport count retained no URL or method, so its three attempts cannot be retrospectively classified.",
    "Separate REVIEW13 and a successful one-shot UI_PROBE2 are required before any later live capture.",
    "Forgot remains unresolved and actionless; CP2 remains gated; no readiness or acceptance is claimed."
  ]
};
await writeFile(receiptPath,`${JSON.stringify(receipt,null,2)}\n`,{ flag:"wx",mode:0o600 });
const receiptBytes=await readFile(receiptPath);
process.stdout.write(`${JSON.stringify({
  receiptPath,sha256:sha256(receiptBytes),bytes:receiptBytes.length,
  artifacts:artifacts.length,verdict:receipt.verdict
},null,2)}\n`);
