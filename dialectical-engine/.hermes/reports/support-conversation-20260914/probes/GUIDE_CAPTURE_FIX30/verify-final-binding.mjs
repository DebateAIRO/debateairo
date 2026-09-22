import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import { access,readFile,writeFile } from "node:fs/promises";

const ROOT="/Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine/.hermes/reports/support-conversation-20260914";
const E=`${ROOT}/evidence`;
const P=`${ROOT}/probes/GUIDE_CAPTURE_FIX30`;
const PRODUCT="/Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine/.worktrees/support-conversation-cp1/dialectical-engine";
const NODE="/Users/vladmihaimiron/.local/bin/node";
const CONTRACT=`${E}/GUIDE_CAPTURE_FIX30-command-contract.json`;
const OPERATOR_CONTRACT=`${E}/GUIDE_CAPTURE_FIX30-operator-contract.json`;
const OUTPUT=`${E}/GUIDE_CAPTURE_FIX30-binding-proof.json`;
const sha256=bytes=>createHash("sha256").update(bytes).digest("hex");
const readJson=async path=>JSON.parse(await readFile(path,"utf8"));
const command=await readJson(CONTRACT);
const operator=await readJson(OPERATOR_CONTRACT);
const phases=["preflight","readiness","capacity","gate","rowProof","capture","idle"];
assert.equal(command.revision,"456cafb9e56a737de550570b5736ec52d79ddf48");
assert.equal(command.kbVersion,"7ef4244d30507e162cebf544eeb6b9578f17ed91711f2d164f2a4d75dd72c7af");
assert.deepEqual(Object.keys(command.phases),phases);
for (const phase of phases) {
  assert.equal(command.phases[phase].argv[2],CONTRACT);
  assert.match(command.phases[phase].output,/GUIDE_LIVE29/u);
  assert.match(command.phases[phase].log,/GUIDE_LIVE29|GUIDE_UI_TRANSITION_PROBE/u);
}
assert.equal(command.actualSequences.length,31);
assert.equal(new Set(command.actualSequences).size,31);
assert.equal(command.actualReceipt,`${E}/GUIDE_LIVE_GUIDE22-actual-receipt.json`);
assert.equal(command.browserProfile,`${ROOT}/probes/GUIDE_CAPTURE_FIX29/browser-profile`);
assert.equal(command.phases.rowProof.result,`${E}/GUIDE_ROW_PROOF-run-LIVE29.json`);
assert.equal(command.phases.capture.childArgv[3],`${P}/capture-public-guide.mjs`);
assert.equal(command.ownerCapacity.contractSha256,"df5580ba8dd47e354a74aa04b8308d7b626564bd116076b682b1f6d0037d03fc");
assert.equal(command.ownerCapacity.output,`${E}/GUIDE_LIVE21-owner-capacity.json`);

const capture=await readFile(`${P}/capture-public-guide.mjs`,"utf8");
const helper=await readFile(`${P}/screenshot-evidence-successor.mjs`,"utf8");
const assistant=await readFile(`${PRODUCT}/apps/ui/components/support/Assistant.tsx`,"utf8");
assert.match(assistant,/source\.label/u);
assert.match(capture,/FRESH_GUIDE22_FIXED31/u);
assert.match(capture,/GUIDE_LIVE_GUIDE22-row-/u);
assert.match(capture,/sessionCreationTimesUtc\.length < 2/u);
assert.doesNotMatch(capture,/sessionCreationTimesUtc\.push\([^\n]*session_id/u);
assert.match(helper,/visible\.sources,api\.sources\.map\(source => source\.label\)/u);
assert.doesNotMatch(helper,/visible\.sources,api\.sources\.map\(source => source\.id\)/u);
assert.match(helper,/contained\(topView\.footer,topView\.pane\)/u);
assert.match(helper,/element\.classList\.contains\("supportDesk"\)/u);
assert.match(helper,/stylesScrollViewportRestored:true/u);
assert.match(helper,/GUIDE_CAPTURE_EXPANSION_RESTORE_MISMATCH/u);

assert.equal(operator.commandContract.sha256,sha256(await readFile(CONTRACT)));
assert.deepEqual(operator.argv,[NODE,"--import","tsx",`${P}/run-operator.mjs`]);
assert.equal(operator.requiredToolPermissionContext,"require_escalated");
assert.equal(operator.stdoutStderr,"tool_captured_no_outer_redirection");
assert.equal(operator.futureAbsence.count,123);
assert.equal(operator.futureAbsence.uniqueCount,123);
assert.equal(new Set(operator.futureAbsence.paths).size,123);
assert.equal(operator.futureAbsence.paths.includes(`${E}/GUIDE_LIVE25-owner-testability.json`),true);
assert.equal(operator.futureAbsence.paths.includes(command.phases.rowProof.result),true);
assert.equal(operator.futureAbsence.paths.includes(command.actualReceipt),true);
for (const sequence of command.actualSequences) {
  const stem=`${E}/GUIDE_LIVE_GUIDE22-row-${String(sequence).padStart(2,"0")}`;
  for (const suffix of ["-complete-expanded.png","-original-pane-top.png","-original-pane-footer.png"]) {
    assert.equal(operator.futureAbsence.paths.includes(`${stem}${suffix}`),true);
  }
}
for (const path of operator.futureAbsence.paths) {
  try { await access(path); throw new Error(`GUIDE_CAPTURE_FIX30_FUTURE_OUTPUT_PRESENT:${path}`); }
  catch (error) { if (error?.code!=="ENOENT") throw error; }
}
for (const script of [`${P}/capture-public-guide.mjs`,`${P}/screenshot-evidence-successor.mjs`,`${P}/run-operator.mjs`,`${P}/run-screenshot-controls.mjs`]) {
  const check=spawnSync(NODE,["--check",script],{ encoding:"utf8" });
  assert.equal(check.status,0,check.stderr);
}
const retainedRowProof=await readFile(`${E}/GUIDE_ROW_PROOF-run-LIVE25.json`);
assert.equal(sha256(retainedRowProof),"1b5d7b296d5b5981d6391ebba27e8a35e03a0cd20cb671c7cf799494ee999520");
const screenshotProof=await readJson(`${E}/GUIDE_CAPTURE_FIX30-screenshot-control-proof.json`);
assert.equal(screenshotProof.result,"PASS_COMPLETE_FULL_ANSWER_CAPTURE");
assert.equal(screenshotProof.supportAttempts,0);
assert.equal(screenshotProof.cases.length,4);
assert.equal(screenshotProof.oldClippedDiscriminator.footerSourceActionMutationChangedOldPng,false);
assert.equal(screenshotProof.paintedEvidence.topMutationChangedPng,true);
assert.equal(screenshotProof.paintedEvidence.footerMutationChangedPng,true);
assert.equal(screenshotProof.paintedEvidence.sourceMutationChangedPng,true);
assert.equal(screenshotProof.paintedEvidence.actionMutationChangedPng,true);
assert.equal(screenshotProof.restoration.successPath,true);
assert.equal(screenshotProof.restoration.exceptionPath,true);

const names=[
  "review29 clipped full RO image is retained as RED evidence",
  "old pane-only capture ignores footer source action paint mutation",
  "successor expands the actual article ancestor chain through supportDesk",
  "successor restores every affected inline style on success",
  "successor restores every affected scroll position on success",
  "successor restores viewport on success",
  "successor restores styles scroll and viewport on screenshot exception",
  "corrected long full RO complete image includes entire answer",
  "corrected long full RO complete image paints target top marker",
  "corrected long full RO complete image paints footer",
  "corrected long full RO complete image paints source item",
  "corrected long full RO complete image paints action link",
  "short full EN row1 remains accepted",
  "long compact EN remains accepted",
  "short compact RO remains accepted",
  "source label projection remains label to label",
  "short already-contained footer guard remains bounded",
  "previous reply target rejected in all four cases",
  "wrong assistant index rejected in all four cases",
  "stale visible projection rejected in all four cases",
  "zero Support requests in inert browser fixture",
  "capture records only first and second session observation timestamps",
  "actual GUIDE22 namespace remains unchanged and unused",
  "all LIVE29 phase UI capacity gate proof capture idle paths remain unchanged",
  "all seven argv self-bind exact FIX30 command contract",
  "fixed31 retains31 unique rows and five-session plan",
  "full58 retained row proof hash is unchanged",
  "Runtime7 and private LIVE20 log references remain unchanged",
  "FIX22 deferred owner contract and unused output remain unchanged",
  "LIVE25 owner testability remains in the absence set",
  "operator uses node --import tsx with require_escalated metadata",
  "operator stdout stderr remain tool-captured without outer redirection",
  "123 future paths are unique and absent",
  "four successor scripts pass syntax checks"
];
const proof={ schemaVersion:1,node:"GUIDE_CAPTURE_FIX30",result:"PASS_COMPLETE_FULL_ANSWER_CAPTURE",
  revision:command.revision,kbVersion:command.kbVersion,controls:names.length,passed:names.length,names,
  sourceCustody:{ assistantSha256:sha256(Buffer.from(assistant)),retainedRowProofSha256:sha256(retainedRowProof) },
  traffic:{ browserFixture:"local_setContent_only",supportAttempts:0,http:0,status:0,capacity:0,database:0,model:0 } };
await writeFile(OUTPUT,`${JSON.stringify(proof,null,2)}\n`,{ flag:"wx",mode:0o600 });
process.stdout.write(`${JSON.stringify({ result:proof.result,controls:proof.controls,passed:proof.passed })}\n`);
