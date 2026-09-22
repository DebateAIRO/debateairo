import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import { access,readFile,writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  GUIDE_FRESH_SEQUENCES,GUIDE_RETAINED_SEQUENCES,validateGuideAffectedPlan
} from "./matrix.mjs";
import { computeGuideHarnessSha256,GUIDE_HARNESS_EXECUTABLE_FILES } from "./controls.mjs";

const repositoryRoot="/Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine";
const productRoot=`${repositoryRoot}/.worktrees/support-conversation-cp1/dialectical-engine`;
const reportRoot=`${repositoryRoot}/.hermes/reports/support-conversation-20260914`;
const evidence=`${reportRoot}/evidence`;
const logs=`${reportRoot}/logs`;
const harnessDirectory=fileURLToPath(new URL("./",import.meta.url));
const rowProofDirectory=fileURLToPath(new URL("../GUIDE_ROW_PROOF_BIND17/",import.meta.url));
const revision="152eed4da1cd3e66b74d8301159ba76427552409";
const kbVersion="fd3c63e417a280493d61b6dd86de617957a5c1052f348dbfbb1c0acb24a48278";
const expectedHarnessSha256="b4880079137a603ffde919dd1f563162d3a1f93878a369ef16dbeba5912e577d";
const retentionPath=`${evidence}/GUIDE_HARNESS_BIND17-retention-manifest.json`;
const retentionSha256="55bd9d27e570dd8c8aa8a8c72044b9b33c132f0c9a919e2ef8abc4723c9debbc";
const proofPath=`${evidence}/GUIDE_HARNESS_BIND17-control-proof.json`;
const sha256=bytes => createHash("sha256").update(bytes).digest("hex");
const readJson=async path => JSON.parse(await readFile(path,"utf8"));
const requireAbsent=async path => {
  try { await access(path); throw new Error(`GUIDE_HARNESS_BIND17_OUTPUT_COLLISION:${path}`); }
  catch (error) { if (error?.code !== "ENOENT") throw error; }
};
const run=argv => {
  const result=spawnSync(argv[0],argv.slice(1),{
    cwd:repositoryRoot,encoding:"utf8",maxBuffer:16_000_000,stdio:["ignore","pipe","pipe"]
  });
  if (result.status !== 0) {
    process.stderr.write(result.stderr);
    throw new Error(`GUIDE_HARNESS_BIND17_COMMAND_FAILED_${result.status}`);
  }
  return result.stdout;
};

assert.equal(run(["git","-C",productRoot,"rev-parse","HEAD"]).trim(),revision);
assert.equal(run(["git","-C",productRoot,"status","--short"]).trim(),"");
const inputs=await readJson(`${evidence}/GUIDE_HARNESS_BIND17-inputs.json`);
assert.equal(inputs.revision,revision);
for (const input of inputs.inputs) {
  const bytes=await readFile(input.path);
  assert.equal(bytes.length,input.bytes,input.path);
  assert.equal(sha256(bytes),input.sha256,input.path);
}

await requireAbsent(proofPath);
await requireAbsent(`${evidence}/GUIDE_LIVE_GUIDE17-actual-receipt.json`);
await requireAbsent(resolve(harnessDirectory,"browser-profile"));
for (const sequence of GUIDE_FRESH_SEQUENCES) {
  await requireAbsent(`${evidence}/GUIDE_LIVE_GUIDE17-row-${String(sequence).padStart(2,"0")}.png`);
}

assert.equal(validateGuideAffectedPlan(),true);
const retentionBytes=await readFile(retentionPath);
assert.equal(sha256(retentionBytes),retentionSha256);
const retention=JSON.parse(retentionBytes.toString("utf8"));
assert.equal(retention.revision,revision);
assert.equal(retention.kbVersion,kbVersion);
assert.deepEqual(retention.dependencyBoundary.retainedSequences,[...GUIDE_RETAINED_SEQUENCES]);
assert.deepEqual(retention.dependencyBoundary.freshSequences,[...GUIDE_FRESH_SEQUENCES]);
assert.equal(retention.retainedRows.length,15);

const oldProof=await readJson(`${evidence}/GUIDE_HARNESS_BIND16-control-proof.json`);
const composedProof=await readJson(`${logs}/GUIDE_HARNESS_BIND17-controls-attempt1.log`);
assert.equal(oldProof.controls,136);
assert.equal(oldProof.passed,136);
assert.equal(composedProof.result,"PASS");
assert.equal(composedProof.revision,revision);
assert.equal(composedProof.kbVersion,kbVersion);
assert.equal(composedProof.harnessSha256,expectedHarnessSha256);
assert.equal(composedProof.controls,147);
assert.equal(composedProof.passed,147);
assert.equal(composedProof.names.length,147);
assert.equal(computeGuideHarnessSha256(harnessDirectory),expectedHarnessSha256);
const retainedInventoryNames=[
  "actual FINAL9 product inventory passes the shared pre request static binding",
  "old empty FINAL8 product inventory is rejected",
  "missing attested product member is rejected",
  "stale attested product member hash is rejected"
];
assert.deepEqual(oldProof.names.slice(112,116),retainedInventoryNames);
const currentRetainedNames=[...oldProof.names.slice(0,112),...oldProof.names.slice(116)]
  .map(name => name === "documented PROBE4 argv passes the extracted guard and stale forms reject"
    ? "documented PROBE6 argv passes the extracted guard and stale forms reject" : name);
assert.equal(currentRetainedNames.length,132);
assert.deepEqual(composedProof.names.slice(0,132),currentRetainedNames);
const addedNames=composedProof.names.slice(132);
assert.equal(addedNames.length,15);
const finalProof={ ...composedProof,controls:151,passed:151,names:[...oldProof.names,...addedNames] };
assert.deepEqual(finalProof.names.slice(0,136),oldProof.names);

const red=await readJson(`${logs}/GUIDE_HARNESS_BIND17-oracle-red.log`);
const green=await readJson(`${logs}/GUIDE_HARNESS_BIND17-oracle-green.log`);
assert.equal(red.result,"EXPECTED_RED");
assert.equal(red.sequence,26);
assert.equal(red.code,"GUIDE_HARNESS_EXPECTED_PRIMARY_SOURCE_MISSING");
assert.equal(green.result,"PASS");
assert.equal(green.controls,8);
assert.equal(green.passed,8);

for (const path of [
  ...GUIDE_HARNESS_EXECUTABLE_FILES.map(path => resolve(harnessDirectory,path)),
  resolve(rowProofDirectory,"replay-row-proofs.mjs"),
  resolve(rowProofDirectory,"reviewed-harness-custody.mjs"),
  resolve(rowProofDirectory,"verify-negative-fixture.mjs"),
  resolve(harnessDirectory,"build-retention-manifest.mjs"),
  resolve(harnessDirectory,"verify-oracle-red.mjs"),
  resolve(harnessDirectory,"verify-oracle-green.mjs"),
  resolve(harnessDirectory,"run-final-controls.mjs")
]) run([process.execPath,"--check",path]);

const negativeLogPath=`${logs}/GUIDE_HARNESS_BIND17-adapter-negative.log`;
let negativeText;
try { negativeText=await readFile(negativeLogPath,"utf8"); }
catch (error) {
  if (error?.code !== "ENOENT") throw error;
  negativeText=run([process.execPath,resolve(rowProofDirectory,"verify-negative-fixture.mjs")]);
  await writeFile(negativeLogPath,negativeText,{ mode:0o600,flag:"wx" });
}
const negative=JSON.parse(negativeText);
assert.equal(negative.result,"PASS");
assert.equal(negative.controls,3);
assert.equal(negative.passed,3);
assert.equal(negative.importerCalls,0);
assert.equal(negative.successfulRows,0);

for (const path of ["probe-zero-request-ui.mjs","checkpoint-writer.mjs","checkpoint-regression.mjs"]) {
  const [before,after]=await Promise.all([
    readFile(resolve(harnessDirectory,"../GUIDE_HARNESS_BIND16",path)),
    readFile(resolve(harnessDirectory,path))
  ]);
  assert.equal(sha256(after),sha256(before));
}
const [capture16,capture17]=await Promise.all([
  readFile(resolve(harnessDirectory,"../GUIDE_HARNESS_BIND16/capture-public-guide.mjs"),"utf8"),
  readFile(resolve(harnessDirectory,"capture-public-guide.mjs"),"utf8")
]);
function exactBlock(source,start,end) {
  const first=source.indexOf(start);
  const last=source.indexOf(end,first);
  assert.equal(first >= 0 && last > first,true);
  return source.slice(first,last);
}
assert.equal(
  sha256(exactBlock(capture17,"async function waitForHydratedClickHandler","async function readVisibleReply")),
  sha256(exactBlock(capture16,"async function waitForHydratedClickHandler","async function readVisibleReply"))
);
assert.equal(
  sha256(exactBlock(capture17,"async function readVisibleReply","async function send")),
  sha256(exactBlock(capture16,"async function readVisibleReply","async function send"))
);
const probe6ReceiptBytes=await readFile(`${evidence}/GUIDE_COMPACT_UI_PROBE6-receipt.json`);
const probe6OutputBytes=await readFile(`${evidence}/GUIDE_UI_TRANSITION_PROBE-run-LIVE8-PROBE6.json`);
const probe6Receipt=JSON.parse(probe6ReceiptBytes.toString("utf8"));
const probe6Output=JSON.parse(probe6OutputBytes.toString("utf8"));
assert.equal(sha256(probe6ReceiptBytes),"392e17e43ada7b00b915bc2f6b1967acc813a3c33f7179618e09a258de93c324");
assert.equal(probe6Receipt.verdict,"PASS_ZERO_SUPPORT_UI_TRANSITIONS");
assert.equal(probe6Output.completed,true);
assert.equal(probe6Output.transitions.length,5);
assert.equal(probe6Output.traffic.actualSupportRequestsForwarded,0);
assert.equal(probe6Output.traffic.guardedAttempts.createSession,0);
assert.equal(probe6Output.traffic.guardedAttempts.sendMessage,0);

const executableFiles=[];
for (const path of GUIDE_HARNESS_EXECUTABLE_FILES) {
  const bytes=await readFile(resolve(harnessDirectory,path));
  executableFiles.push({ path,bytes:bytes.length,sha256:sha256(bytes) });
}
assert.equal(sha256(JSON.stringify(executableFiles)),expectedHarnessSha256);
const digest={
  schemaVersion:1,node:"GUIDE_HARNESS_BIND17",revision,kbVersion,
  orderedEightSha256:expectedHarnessSha256,files:executableFiles,
  matrixRows:54,retainedRows:15,freshRows:39,modelCallCeiling:42,
  retentionManifest:{ absolute:retentionPath,sha256:retentionSha256,bytes:retentionBytes.length }
};
await writeFile(`${evidence}/GUIDE_HARNESS_BIND17-digest.json`,`${JSON.stringify(digest,null,2)}\n`,{ mode:0o600,flag:"wx" });

await writeFile(proofPath,`${JSON.stringify(finalProof,null,2)}\n`,{ mode:0o600,flag:"wx" });

const futureOutputs={
  schemaVersion:1,node:"GUIDE_HARNESS_BIND17",revision,
  receipt:`${evidence}/GUIDE_LIVE_GUIDE17-actual-receipt.json`,
  screenshots:GUIDE_FRESH_SEQUENCES.map(sequence =>
    `${evidence}/GUIDE_LIVE_GUIDE17-row-${String(sequence).padStart(2,"0")}.png`),
  browserProfile:resolve(harnessDirectory,"browser-profile"),
  rowProofPattern:`${evidence}/GUIDE_ROW_PROOF-run-[future-node].json`,
  retainedEvidence:{ path:retentionPath,sha256:retentionSha256,rows:15 },
  freshRows:39,combinedRows:54,allAbsentAtSeal:true
};
await writeFile(`${evidence}/GUIDE_HARNESS_BIND17-future-outputs.json`,`${JSON.stringify(futureOutputs,null,2)}\n`,{ mode:0o600,flag:"wx" });

const changed=[];
for (const path of GUIDE_HARNESS_EXECUTABLE_FILES) {
  const [before,after]=await Promise.all([
    readFile(resolve(harnessDirectory,"../GUIDE_HARNESS_BIND16",path)),
    readFile(resolve(harnessDirectory,path))
  ]);
  if (sha256(before) !== sha256(after)) changed.push(path);
}
assert.deepEqual(changed,[
  "capture-public-guide.mjs","controls.mjs","matrix.mjs","runtime-capacity.mjs",
  "session-lifecycle.mjs","verify-guide-harness.mjs"
]);
const delta={
  schemaVersion:1,node:"GUIDE_HARNESS_BIND17",revision,
  inheritedExecutableFiles:GUIDE_HARNESS_EXECUTABLE_FILES.filter(path => !changed.includes(path)),
  changedExecutableFiles:changed,
  retainedControlPurposes:136,addedControlPurposes:15,finalControlPurposes:151,
  oracleRowsChanged:[25,26],canonicalPromptsChanged:0,
  retainedRows:15,freshRows:39,freshSessions:3,
  browserHelperBlocksUnchanged:true,probe6Retained:true,
  productChanges:0,kbChanges:0,traffic:{ browser:false,runtime:false,http:false,supportRequests:0,modelRequests:0 }
};
await writeFile(`${evidence}/GUIDE_HARNESS_BIND17-delta.json`,`${JSON.stringify(delta,null,2)}\n`,{ mode:0o600,flag:"wx" });

process.stdout.write(`${JSON.stringify({
  result:"PASS",revision,kbVersion,controls:151,passed:151,
  retainedPrefix:136,added:15,harnessSha256:expectedHarnessSha256,
  retainedRows:15,freshRows:39,adapterNegative:negative.controls,
  retentionSha256,probe6Transitions:probe6Output.transitions.length
})}\n`);
