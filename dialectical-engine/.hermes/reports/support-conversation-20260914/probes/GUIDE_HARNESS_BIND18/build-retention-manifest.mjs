import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { readFile,stat,writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import {
  GUIDE_FRESH_SEQUENCES,GUIDE_MATRIX,GUIDE_RETAINED_SEQUENCES,GUIDE_SESSION_GROUPS,
  validateGuideAffectedPlan
} from "./matrix.mjs";

const repositoryRoot="/Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine";
const productRoot=`${repositoryRoot}/.worktrees/support-conversation-cp1/dialectical-engine`;
const reportRoot=`${repositoryRoot}/.hermes/reports/support-conversation-20260914`;
const evidence=`${reportRoot}/evidence`;
const revision="152eed4da1cd3e66b74d8301159ba76427552409";
const kbVersion="fd3c63e417a280493d61b6dd86de617957a5c1052f348dbfbb1c0acb24a48278";
const expectedActualSha="37da5284f1614d26fe445d2b5c177db94763217aeaa66c2cf116321eba75a738";
const expectedReceiptSha="c83366391969de5ec01b50707317895b46e27c6c014a7c636d723ef19cbe3d2b";
const outputPath=`${evidence}/GUIDE_HARNESS_BIND17-retention-manifest.json`;
const sha256=bytes => createHash("sha256").update(bytes).digest("hex");
const readJson=async path => JSON.parse(await readFile(path,"utf8"));
const hashFile=async absolute => {
  const bytes=await readFile(absolute);
  return Object.freeze({ absolute,sha256:sha256(bytes),bytes:bytes.length });
};

validateGuideAffectedPlan();
assert.equal(execFileSync("git",["-C",productRoot,"rev-parse","HEAD"],{ encoding:"utf8" }).trim(),revision);
assert.equal(execFileSync("git",["-C",productRoot,"status","--short"],{ encoding:"utf8" }).trim(),"");

const actualPath=`${evidence}/GUIDE_LIVE_GUIDE16-actual-receipt.json`;
const liveReceiptPath=`${evidence}/GUIDE_LIVE8-receipt.json`;
const actualBytes=await readFile(actualPath);
const liveReceiptBytes=await readFile(liveReceiptPath);
assert.equal(sha256(actualBytes),expectedActualSha);
assert.equal(sha256(liveReceiptBytes),expectedReceiptSha);
const actual=JSON.parse(actualBytes.toString("utf8"));
const liveReceipt=JSON.parse(liveReceiptBytes.toString("utf8"));
const capacity=await readJson(`${evidence}/GUIDE_LIVE8-runtime-capacity.json`);
const oldMatrixModule=await import(`${pathToFileURL(resolve(reportRoot,"probes/GUIDE_HARNESS_BIND16/matrix.mjs")).href}?retention=1`);
const oldMatrix=oldMatrixModule.GUIDE_MATRIX;
const oldRows=new Map(oldMatrix.map(row => [row.sequence,row]));
const newRows=new Map(GUIDE_MATRIX.map(row => [row.sequence,row]));

assert.equal(actual.finalCommit,revision);
assert.equal(actual.kbVersion,kbVersion);
assert.equal(actual.preRequestControlProof.revision,revision);
assert.equal(actual.preRequestControlProof.kbVersion,kbVersion);
assert.equal(capacity.finalCommit,revision);
assert.equal(capacity.kbVersion,kbVersion);
assert.equal(capacity.supportModelRef,"development:hermes-glm-5.3-flash");
assert.deepEqual(actual.rows.slice(0,15).map(row => row.sequence),[...GUIDE_RETAINED_SEQUENCES]);
assert.deepEqual(actual.attemptedRows.slice(0,15),[...GUIDE_RETAINED_SEQUENCES]);
assert.deepEqual(actual.sessionGroups.slice(0,2),GUIDE_SESSION_GROUPS.slice(0,2));
assert.deepEqual(actual.groupSessionEvidence.slice(0,2).map(item => item.groupId),["lifecycle-full-en","full-ro"]);
assert.equal(actual.groupSessionEvidence[1].createdAfter,2);
assert.equal(actual.groupSessionEvidence[2].createdBefore,2);
assert.equal(actual.groupSessionEvidence[2].createdAfter,3);
assert.notEqual(actual.groupSessionEvidence[1].sessionIdentitySha256,actual.groupSessionEvidence[2].sessionIdentitySha256);
assert.equal(GUIDE_RETAINED_SEQUENCES.includes(43),true);
assert.equal(GUIDE_RETAINED_SEQUENCES.some(sequence => [25,26].includes(sequence)),false);
assert.equal(GUIDE_FRESH_SEQUENCES.includes(25)&&GUIDE_FRESH_SEQUENCES.includes(26),true);

const artifactByPath=new Map(liveReceipt.artifacts.map(item => [item.absolute,item]));
const retained=[];
for (const row of actual.rows.slice(0,15)) {
  assert.equal(row.api.status,200);
  assert.equal(row.attribution.apiDomTextEqual,true);
  assert.equal(row.attribution.apiDomSourcesEqual,true);
  assert.equal(row.attribution.apiDomActionsEqual,true);
  assert.equal(row.selectedLanguage,row.language);
  assert.deepEqual(newRows.get(row.sequence),oldRows.get(row.sequence));
  const screenshot=actual.screenshots.find(path => path.endsWith(`row-${String(row.sequence).padStart(2,"0")}.png`));
  assert.equal(typeof screenshot,"string");
  const indexed=artifactByPath.get(screenshot);
  assert.ok(indexed);
  const measured=await hashFile(screenshot);
  assert.equal(measured.sha256,indexed.sha256);
  assert.equal(measured.bytes,indexed.bytes);
  retained.push(Object.freeze({
    provenance:"RETAINED_LIVE8_COMPLETE_GROUP",
    sequence:row.sequence,kind:row.kind,family:row.family,mode:row.mode,language:row.language,
    prompt:row.prompt,branch:row.branch,expectedSourceIds:row.expectedSourceIds,
    actionPolicy:row.actionPolicy,navigation:row.navigation,lifecycleRole:row.lifecycleRole,
    recoveryClass:row.recoveryClass,proof:row.proof,api:row.api,visible:row.visible,
    diagnostic:row.diagnostic,attribution:row.attribution,selectedLanguage:row.selectedLanguage,
    sessionCreateCount:row.sessionCreateCount,screenshot:measured
  }));
}

const answerPath=`${productRoot}/apps/api/src/support/answer.ts`;
const contextPath=`${productRoot}/packages/support-kb/src/context.ts`;
const answerSource=await readFile(answerPath,"utf8");
const contextSource=await readFile(contextPath,"utf8");
assert.match(answerSource,/historyText:\s*""/u);
assert.match(contextSource,/input\.historyText !== ""/u);

const definingPaths=[
  answerPath,contextPath,
  `${reportRoot}/probes/GUIDE_HARNESS_BIND16/capture-public-guide.mjs`,
  `${reportRoot}/probes/GUIDE_HARNESS_BIND16/session-lifecycle.mjs`,
  `${reportRoot}/probes/GUIDE_HARNESS_BIND16/matrix.mjs`,
  `${reportRoot}/probes/GUIDE_HARNESS_BIND16/controls.mjs`,
  `${reportRoot}/probes/GUIDE_HARNESS_BIND16/pre-request-verifier.ts`,
  `${reportRoot}/evidence/GUIDE_COMPACT_UI_PROBE6-receipt.json`,
  `${reportRoot}/evidence/GUIDE_UI_TRANSITION_PROBE-run-LIVE8-PROBE6.json`,
  `${reportRoot}/evidence/GUIDE_HARNESS_BIND16-control-proof.json`,
  `${reportRoot}/evidence/GATE_GUIDE_FINAL9-manifest.json`,
  `${reportRoot}/evidence/GUIDE_LOCK_HANDOFF_FIX-snapshot-receipt.json`
];
const definingBindings=[];
for (const path of definingPaths) definingBindings.push(await hashFile(path));

const manifest={
  schemaVersion:1,node:"GUIDE_HARNESS_BIND17",revision,kbVersion,
  verdict:"PASS_RETAINED_COMPLETE_GROUPS_BOUND",
  sourceRun:{
    node:"GUIDE_LIVE8",verdict:liveReceipt.verdict,completed:false,
    actualReceipt:{ absolute:actualPath,sha256:expectedActualSha,bytes:actualBytes.length },
    liveReceipt:{ absolute:liveReceiptPath,sha256:expectedReceiptSha,bytes:liveReceiptBytes.length },
    failedSequence:actual.failureObservation.canonicalRow.sequence,
    failedPartialGroupExcluded:true
  },
  runtimeBinding:{
    finalCommit:actual.finalCommit,kbVersion:actual.kbVersion,
    modelRef:capacity.supportModelRef,browser:actual.browser,
    supportApi:actual.supportApi,relay:actual.relay,identity:actual.identity,
    syntheticSupportOverrides:actual.syntheticSupportOverrides,
    privateRecordsUsed:actual.privateRecordsUsed,
    credentialOrRecoveryOperations:actual.credentialOrRecoveryOperations
  },
  dependencyBoundary:{
    retainedGroupIds:["lifecycle-full-en","full-ro"],retainedSequences:[...GUIDE_RETAINED_SEQUENCES],
    freshGroupIds:["compact-ro","full-en","compact-en"],freshSequences:[...GUIDE_FRESH_SEQUENCES],
    retainedRows:15,freshRows:39,combinedRows:54,
    affectedBroadGuideSequences:[25,26],affectedRowsFresh:true,
    failedPartialCompactRoRowsExcluded:true,
    modelHistoryContract:{ answerServiceHistoryTextEmpty:true,kbRejectsNonemptyHistory:true },
    freshGroup3StartsWithFreshProfile:true,
    freshGroups4And5UseStorageResetBeforeRemount:true
  },
  retainedRows:retained,
  definingBindings,
  limits:[
    "LIVE8 remains a failed 20-of-54 capture; this manifest retains only two complete groups totaling 15 rows.",
    "The five completed rows from partial group3 and failed row26 are not retained.",
    "Any change to a retained row, screenshot, defining binding, product revision, KB version, model reference, or group boundary invalidates retention.",
    "Actual future coverage must report 15 retained plus 39 fresh, never a fresh single54 run."
  ]
};
await writeFile(outputPath,`${JSON.stringify(manifest,null,2)}\n`,{ mode:0o600,flag:"wx" });
const output=await readFile(outputPath);
process.stdout.write(`${JSON.stringify({ result:manifest.verdict,retainedRows:retained.length,freshRows:39,sha256:sha256(output),bytes:output.length,outputPath })}\n`);
