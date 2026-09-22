import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import { access,readFile,writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

const reportRoot="/Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine/.hermes/reports/support-conversation-20260914";
const repositoryRoot="/Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine";
const productRoot="/Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine/.worktrees/support-conversation-cp1/dialectical-engine";
const revision="0b9320eae5a0ad8c9fcc9648ed85ebef1b289c13";
const kbVersion="fd3c63e417a280493d61b6dd86de617957a5c1052f348dbfbb1c0acb24a48278";
const expectedHarnessSha256="be7a0ca7f0b4f768ac40a2ecb020a7f17f96df5a8f32100b43e3b85e3752047c";
const harnessDirectory=fileURLToPath(new URL("./",import.meta.url));
const rowProofDirectory=fileURLToPath(new URL("../GUIDE_ROW_PROOF_FIX8/",import.meta.url));
const evidenceRoot=`${reportRoot}/evidence`;
const proofPath=`${evidenceRoot}/GUIDE_HARNESS_FIX8-control-proof.json`;
const previousProofPath=`${evidenceRoot}/GUIDE_HARNESS_FIX7-control-proof.json`;
const sha256=bytes => createHash("sha256").update(bytes).digest("hex");

function run(argv) {
  const result=spawnSync(argv[0],argv.slice(1),{
    cwd:repositoryRoot,encoding:"utf8",maxBuffer:16_000_000,stdio:["ignore","pipe","pipe"]
  });
  if (result.status !== 0) {
    process.stderr.write(result.stderr);
    throw new Error(`GUIDE_HARNESS_FIX8_COMMAND_FAILED_${result.status}`);
  }
  return result.stdout;
}

async function requireAbsent(path) {
  try { await access(path); throw new Error("GUIDE_HARNESS_FIX8_OUTPUT_COLLISION"); }
  catch (error) { if (error?.code !== "ENOENT") throw error; }
}

assert.equal(run(["git","-C",productRoot,"rev-parse","HEAD"]).trim(),revision);
assert.equal(run(["git","-C",productRoot,"status","--short"]).trim(),"");

await requireAbsent(proofPath);
await requireAbsent(`${evidenceRoot}/GUIDE_LIVE_GUIDE8-actual-receipt.json`);
await requireAbsent(resolve(harnessDirectory,"browser-profile"));
for (let sequence=1;sequence<=54;sequence+=1) {
  await requireAbsent(`${evidenceRoot}/GUIDE_LIVE_GUIDE8-row-${String(sequence).padStart(2,"0")}.png`);
}

const unchangedFiles=[
  "gate-contract.json","matrix.mjs","pre-request-verifier.ts","runtime-capacity.mjs",
  "session-lifecycle.mjs","verify-final-branches.ts"
];
for (const path of unchangedFiles) {
  const [before,after]=await Promise.all([
    readFile(resolve(harnessDirectory,"../GUIDE_HARNESS_FIX7",path)),
    readFile(resolve(harnessDirectory,path))
  ]);
  assert.equal(sha256(after),sha256(before));
}

for (const path of [
  resolve(harnessDirectory,"capture-public-guide.mjs"),
  resolve(harnessDirectory,"controls.mjs"),
  resolve(harnessDirectory,"matrix.mjs"),
  resolve(harnessDirectory,"runtime-capacity.mjs"),
  resolve(harnessDirectory,"session-lifecycle.mjs"),
  resolve(harnessDirectory,"verify-fix8-red.mjs"),
  resolve(harnessDirectory,"verify-guide-harness.mjs"),
  resolve(rowProofDirectory,"replay-row-proofs.mjs"),
  resolve(rowProofDirectory,"reviewed-harness-custody.mjs"),
  resolve(rowProofDirectory,"verify-negative-fixture.mjs")
]) run([process.execPath,"--check",path]);

const compatibility=JSON.parse(run([
  process.execPath,resolve(harnessDirectory,"verify-fix8-red.mjs")
]));
assert.equal(compatibility.result,"PASS");

const proof=JSON.parse(run([
  process.execPath,"--import","tsx",resolve(harnessDirectory,"verify-guide-harness.mjs"),
  productRoot,revision
]));
assert.deepEqual(Object.keys(proof),[
  "schemaVersion","result","revision","kbVersion","harnessSha256","controls","passed","names"
]);
assert.equal(proof.schemaVersion,2);
assert.equal(proof.result,"PASS");
assert.equal(proof.revision,revision);
assert.equal(proof.kbVersion,kbVersion);
assert.equal(proof.harnessSha256,expectedHarnessSha256);
assert.equal(proof.controls,proof.passed);
assert.equal(proof.controls,proof.names.length);
const previousProof=JSON.parse(await readFile(previousProofPath,"utf8"));
assert.equal(previousProof.controls,105);
assert.equal(previousProof.names.every(name => proof.names.includes(name)),true);

const negative=JSON.parse(run([
  process.execPath,resolve(rowProofDirectory,"verify-negative-fixture.mjs")
]));
assert.equal(negative.result,"PASS");
assert.equal(negative.controls,3);
assert.equal(negative.passed,3);
assert.equal(negative.importerCalls,0);
assert.equal(negative.successfulRows,0);
await writeFile(proofPath,`${JSON.stringify(proof,null,2)}\n`,{ flag:"wx",mode:0o600 });

process.stdout.write(`${JSON.stringify({
  schemaVersion:1,node:"GUIDE_HARNESS_FIX8",result:"PASS",
  revision,kbVersion,harnessSha256:proof.harnessSha256,
  controls:proof.controls,passed:proof.passed,retainedControlPurposes:previousProof.controls,
  addedControlPurposes:proof.controls-previousProof.controls,
  adapterNegative:{ controls:negative.controls,passed:negative.passed,importerCalls:0,successfulRows:0 },
  syntaxFiles:10,unchangedFiles,
  futureOutputs:{ receipt:"GUIDE_LIVE_GUIDE8-actual-receipt.json",screenshots:54,profileAbsent:true },
  traffic:{ browser:0,runtime:0,http:0,database:0,supportRequests:0,modelRequests:0 }
},null,2)}\n`);
