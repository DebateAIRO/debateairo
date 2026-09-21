import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { execFileSync,spawnSync } from "node:child_process";
import { access,readFile,writeFile } from "node:fs/promises";

const root="/Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine";
const product=`${root}/.worktrees/support-conversation-cp1/dialectical-engine`;
const report=`${root}/.hermes/reports/support-conversation-20260914`;
const evidence=`${report}/evidence`;
const logs=`${report}/logs`;
const revision="152eed4da1cd3e66b74d8301159ba76427552409";
const sha256=bytes => createHash("sha256").update(bytes).digest("hex");
const readJson=async path => JSON.parse(await readFile(path,"utf8"));
const run=(file,args,options={}) => execFileSync(file,args,{ encoding:"utf8",...options }).trim();
assert.equal(run("/usr/bin/git",["rev-parse","HEAD"],{ cwd:product }),revision);
assert.equal(run("/usr/bin/git",["status","--porcelain=v1"],{ cwd:product }),"");

const inputs=await readJson(`${evidence}/GUIDE_LIVE9-inputs.json`);
assert.equal(inputs.revision,revision);
for (const input of inputs.inputs) {
  const bytes=await readFile(input.path);
  assert.equal(bytes.length,input.bytes,input.path);
  assert.equal(sha256(bytes),input.sha256,input.path);
}

const contractBytes=await readFile(`${evidence}/GUIDE_LIVE9-command-contract.json`);
assert.equal(sha256(contractBytes),"13af120d0dec648adaad3e503b5f85a070ddd5002d7023628e201d302805191b");
const contract=JSON.parse(contractBytes);
assert.deepEqual(Object.keys(contract),["schemaVersion","revision","cwd","rowProof","capture","plannedRetainedRows","plannedFreshRows","plannedFreshSessions","executed"]);
assert.equal(contract.revision,revision);
assert.equal(contract.cwd,product);
assert.deepEqual([contract.plannedRetainedRows,contract.plannedFreshRows,contract.plannedFreshSessions],[15,39,3]);
assert.equal(contract.executed,false);
const expected={
  rowProof:{
    argv:["node","--import","tsx",`${report}/probes/GUIDE_ROW_PROOF_BIND17/replay-row-proofs.mjs`,`${evidence}/GUIDE_LIVE9-gate.json`,revision,`${evidence}/GUIDE_ROW_PROOF-run-LIVE9.json`],
    output:`${evidence}/GUIDE_ROW_PROOF-run-LIVE9.json`,log:`${logs}/GUIDE_ROW_PROOF-LIVE9.log`
  },
  capture:{
    argv:["node","--import","tsx",`${report}/probes/GUIDE_HARNESS_BIND17/capture-public-guide.mjs`,`${evidence}/GUIDE_LIVE9-gate.json`],
    output:`${evidence}/GUIDE_LIVE_GUIDE17-actual-receipt.json`,log:`${logs}/GUIDE_LIVE9-capture.log`
  }
};
for (const key of ["rowProof","capture"]) {
  assert.deepEqual(contract[key].argv,expected[key].argv);
  assert.equal(contract[key].output,expected[key].output);
  assert.equal(contract[key].log,expected[key].log);
  const bytes=await readFile(contract[key].script.path);
  assert.equal(bytes.length,contract[key].script.bytes);
  assert.equal(sha256(bytes),contract[key].script.sha256);
  assert.equal(contract[key].script.path,contract[key].argv[3]);
  const syntax=spawnSync(process.execPath,["--check",contract[key].script.path],{ encoding:"utf8" });
  assert.equal(syntax.status,0,syntax.stderr);
}
const templateBytes=await readFile(`${evidence}/GUIDE_LIVE9-gate-template.json`);
assert.equal(sha256(templateBytes),"8a3599482aa0f2fac9941f23e43f4e0731a3f9422d82ac8f6d51728fa241b855");
const template=JSON.parse(templateBytes);
assert.equal(Object.keys(template).length,16);
assert.equal(template.finalCommit,revision);
for (const [pathKey,shaKey] of [
  ["productInventoryPath","productInventorySha256"],["attestationPath","attestationSha256"],
  ["requiredSuiteReceiptPath","requiredSuiteReceiptSha256"],["controlProofPath","controlProofSha256"]
]) assert.equal(sha256(await readFile(template[pathKey])),template[shaKey]);
const proof=await readJson(template.controlProofPath);
assert.deepEqual([proof.controls,proof.passed],[151,151]);

const freshSequences=[3,10,14,18,22,26,30,34,38,40,46,50,44,4,8,12,16,20,24,28,32,36,42,48,45,5,9,13,17,21,25,29,33,37,53,49,52,54,6];
assert.equal(freshSequences.length,39);
const candidates=[
  contract.rowProof.output,contract.rowProof.log,contract.capture.output,contract.capture.log,
  `${evidence}/GUIDE_LIVE9-runtime-capacity.json`,`${evidence}/GUIDE_LIVE9-gate.json`,
  `${evidence}/GUIDE_LIVE9-readiness.json`,`${evidence}/GUIDE_LIVE9-row-proof-status.json`,
  `${evidence}/GUIDE_LIVE9-capture-status.json`,`${evidence}/GUIDE_LIVE9-coverage-manifest.json`,
  `${evidence}/GUIDE_LIVE9-owner-testability.json`,`${report}/probes/GUIDE_HARNESS_BIND17/browser-profile`,
  ...freshSequences.map(sequence => `${evidence}/GUIDE_LIVE_GUIDE17-row-${String(sequence).padStart(2,"0")}.png`)
];
const present=[];
for (const path of candidates) {
  try { await access(path); present.push(path); }
  catch (error) { if (error?.code !== "ENOENT") throw error; }
}
assert.deepEqual(present,[]);
const output={ schemaVersion:1,node:"GUIDE_LIVE9",phase:"PRETRAFFIC",observedAt:new Date().toISOString(),revision,
  inputs:inputs.inputs.length,contractSha256:sha256(contractBytes),templateSha256:sha256(templateBytes),
  controls:proof.controls,planned:{ retained:15,fresh:39,sessions:3 },checkedAbsent:candidates.length,present };
await writeFile(`${evidence}/GUIDE_LIVE9-pretraffic.json`,`${JSON.stringify(output,null,2)}\n`,{ flag:"wx",mode:0o600 });
process.stdout.write(`${JSON.stringify(output)}\n`);
