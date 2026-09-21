import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { access,readFile,writeFile } from "node:fs/promises";
import { readFinalContract,requireAbsoluteCommand } from "../GUIDE_HARNESS_BIND21/phase-contract.mjs";

const ROOT="/Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine/.hermes/reports/support-conversation-20260914";
const E=`${ROOT}/evidence`;
const P=`${ROOT}/probes`;
const contractPath=`${E}/GUIDE_HARNESS_FIX25-command-contract.json`;
const proofPath=`${E}/GUIDE_HARNESS_FIX25-binding-proof.json`;
const sha256=bytes => createHash("sha256").update(bytes).digest("hex");
try { await access(proofPath); throw new Error("GUIDE_FIX25_BINDING_PROOF_COLLISION"); }
catch (error) { if (error?.code !== "ENOENT") throw error; }

const contractBytes=await readFile(contractPath);
const contract=await readFinalContract(contractPath);
assert.equal(contract.node,"GUIDE_HARNESS_FIX25");
assert.deepEqual(Object.keys(contract.phases),[
  "preflight","readiness","capacity","gate","rowProof","capture","idle"
]);
for (const [name,phase] of Object.entries(contract.phases)) {
  requireAbsoluteCommand(phase);
  assert.equal(phase.argv[2],contractPath,`${name} argv[2]`);
  assert.match(phase.output,/GUIDE_LIVE25-/u);
  assert.match(phase.log,/(GUIDE_LIVE25-|GUIDE_UI_TRANSITION_PROBE-LIVE25)/u);
}
assert.equal(contract.browserProfile,`${P}/GUIDE_HARNESS_FIX25/browser-profile`);
assert.equal(contract.actualReceipt,`${E}/GUIDE_LIVE_GUIDE21-actual-receipt.json`);
assert.equal(contract.ownerCapacity.contractPath,`${E}/GUIDE_HARNESS_FIX22-owner-capacity-contract.json`);
assert.equal(contract.ownerCapacity.contractSha256,"df5580ba8dd47e354a74aa04b8308d7b626564bd116076b682b1f6d0037d03fc");
assert.equal(contract.ownerCapacity.output,`${E}/GUIDE_LIVE21-owner-capacity.json`);
assert.equal(contract.runtimeCustodyPath,`${E}/GUIDE_RUNTIME7-stack-custody.json`);
assert.equal(contract.runtimeLogPath,`${ROOT}/logs/GUIDE_LIVE20-stack.log`);
assert.equal(contract.phases.rowProof.childArgv[3],`${P}/GUIDE_HARNESS_FIX25/replay-row-proofs.mjs`);
assert.equal(contract.phases.rowProof.childArgv[4],contract.phases.gate.output);
assert.equal(contract.phases.rowProof.childArgv[6],`${E}/GUIDE_ROW_PROOF-run-LIVE25.json`);
assert.equal(contract.phases.rowProof.result,contract.phases.rowProof.childArgv[6]);
assert.equal(contract.phases.capture.childArgv[3],`${P}/GUIDE_HARNESS_FIX25/capture-public-guide.mjs`);
assert.equal(contract.phases.capture.childArgv[4],contract.phases.gate.output);

const templateBytes=await readFile(contract.gateTemplatePath);
assert.equal(sha256(templateBytes),contract.gateTemplateSha256);
const template=JSON.parse(templateBytes);
assert.equal(Object.keys(template).length,16);
assert.equal(Object.hasOwn(template,"runtimeCapacityPath"),false);
assert.equal(Object.hasOwn(template,"runtimeCapacitySha256"),false);
const controlBytes=await readFile(template.controlProofPath);
assert.equal(sha256(controlBytes),template.controlProofSha256);
const control=JSON.parse(controlBytes);
assert.deepEqual(Object.keys(control),[
  "schemaVersion","result","revision","kbVersion","harnessSha256","controls","passed","names"
]);
assert.equal(control.result,"PASS");
assert.equal(control.passed,control.controls);
assert.equal(control.names.length,control.controls);
assert.equal(control.names.some(name => name.includes("GUIDE18")),false);
assert.equal(control.names.some(name => name.includes("GUIDE21")),true);

const redStatus=JSON.parse(await readFile(`${E}/GUIDE_HARNESS_FIX25-inert-red-status.json`,"utf8"));
assert.equal(redStatus.status,1);
assert.match(await readFile(`${ROOT}/logs/GUIDE_HARNESS_FIX25-gated-red.log`,"utf8"),/GUIDE_ROW_PROOF_MATRIX_COUNT_MISMATCH/u);
const failedGreen=JSON.parse(await readFile(`${E}/GUIDE_ROW_PROOF-run-FIX25-GREEN.json`,"utf8"));
assert.equal(failedGreen.resultCode,"GUIDE_HARNESS_BOUND_RECEIPT_INVALID");
const finalStatus=JSON.parse(await readFile(`${E}/GUIDE_HARNESS_FIX25-final-gate-status.json`,"utf8"));
assert.equal(finalStatus.status,0);
const gated=JSON.parse(await readFile(`${E}/GUIDE_ROW_PROOF-run-FIX25-FINAL-GATE.json`,"utf8"));
assert.equal(gated.verdict,"PASS");
assert.equal(gated.resultCode,"GUIDE_ROW_PROOF_ALL_ROWS_PASS");
assert.equal(gated.rows.length,58);
assert.deepEqual(gated.traffic,{ browser:false,sessions:0,supportRequests:0,modelRequests:0 });
assert.deepEqual(gated.rows.slice(54).map(row => ({
  sequence:row.sequence,sources:row.expected.sourceIds,requiredActionId:row.expected.requiredActionId,
  allowedActionIds:row.derived.allowedActionIds
})),[
  { sequence:55,sources:["product-identity"],requiredActionId:null,allowedActionIds:[] },
  { sequence:56,sources:["product-identity"],requiredActionId:null,allowedActionIds:[] },
  { sequence:57,sources:["account-access"],requiredActionId:"sign-in",allowedActionIds:["sign-in"] },
  { sequence:58,sources:["account-access"],requiredActionId:"sign-up",allowedActionIds:["sign-up"] }
]);

const captureBytes=await readFile(`${P}/GUIDE_HARNESS_FIX25/capture-public-guide.mjs`);
assert.match(captureBytes.toString("utf8"),/FRESH_GUIDE21_FIXED31/u);
assert.match(captureBytes.toString("utf8"),/GUIDE_LIVE_GUIDE21-actual-receipt\.json/u);
assert.match(captureBytes.toString("utf8"),/GUIDE_HARNESS_FIX25\/browser-profile/u);
const screenshotBytes=await readFile(`${P}/GUIDE_HARNESS_BIND21/screenshot-evidence-successor.mjs`);
assert.equal(sha256(screenshotBytes),"696dc176b7a6e1bbd6f5c8b5714bbf2519c7be7809af5fda8f45ca3f085a0b7c");

const expectedAbsent=[
  ...Object.values(contract.phases).flatMap(phase => [phase.output,phase.log]),
  contract.phases.preflight.ui.output,contract.phases.preflight.ui.log,
  contract.phases.rowProof.result,contract.actualReceipt,contract.browserProfile,
  contract.ownerCapacity.output
];
const present=[];
for (const path of expectedAbsent) {
  try { await access(path); present.push(path); }
  catch (error) { if (error?.code !== "ENOENT") throw error; }
}
assert.deepEqual(present,[]);

const result={ schemaVersion:1,node:"GUIDE_HARNESS_FIX25",result:"PASS",
  contractPath,contractSha256:sha256(contractBytes),actualByteParserProof:true,
  phaseCount:7,selfBoundPhaseCount:7,gateTemplateSha256:sha256(templateBytes),
  controlProofSha256:sha256(controlBytes),controls:control.controls,
  staleGatedFailure:"GUIDE_ROW_PROOF_MATRIX_COUNT_MISMATCH",
  necessaryGateReferenceFailure:"GUIDE_HARNESS_BOUND_RECEIPT_INVALID",
  finalGatedRows:gated.rows.length,canonicalRows:54,ownerRows:4,
  focusedNegativeCases:["missing","extra","duplicate","mutated-owner-action"],
  traffic:gated.traffic,freshOperationalOutputsCheckedAbsent:expectedAbsent.length,
  actualNamespace:"GUIDE_LIVE_GUIDE21",provenance:"FRESH_GUIDE21_FIXED31",
  runtimeCustody:"GUIDE_RUNTIME7",ownerCapacityContractSha256:contract.ownerCapacity.contractSha256,
  retainedScreenshotSha256:sha256(screenshotBytes),captureSha256:sha256(captureBytes)
};
await writeFile(proofPath,`${JSON.stringify(result,null,2)}\n`,{ flag:"wx",mode:0o600 });
process.stdout.write(`${JSON.stringify(result)}\n`);
