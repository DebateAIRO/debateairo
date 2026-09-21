import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import { access,mkdtemp,readFile,rm,writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

const reportRoot="/Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine/.hermes/reports/support-conversation-20260914";
const repositoryRoot="/Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine";
const productRoot="/Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine/.worktrees/support-conversation-cp1/dialectical-engine";
const revision="152eed4da1cd3e66b74d8301159ba76427552409";
const kbVersion="fd3c63e417a280493d61b6dd86de617957a5c1052f348dbfbb1c0acb24a48278";
const expectedHarnessSha256="1c46d0d55ed0e8f4f7900682a031ccec2b47e9e831d7357a426975f10e78391a";
const harnessDirectory=fileURLToPath(new URL("./",import.meta.url));
const rowProofDirectory=fileURLToPath(new URL("../GUIDE_ROW_PROOF_BIND12/",import.meta.url));
const evidenceRoot=`${reportRoot}/evidence`;
const proofPath=`${evidenceRoot}/GUIDE_HARNESS_BIND12-control-proof.json`;
const previousProofPath=`${evidenceRoot}/GUIDE_HARNESS_BIND11-control-proof.json`;
const productInventoryPath=`${evidenceRoot}/GATE_GUIDE_FINAL9-manifest.json`;
const attestationPath=`${evidenceRoot}/GUIDE_LOCK_HANDOFF_FIX-snapshot-receipt.json`;
const suiteReceiptPath=`${evidenceRoot}/GUIDE_LOCK_HANDOFF_FIX-required-suites.json`;
const sha256=bytes => createHash("sha256").update(bytes).digest("hex");

function run(argv) {
  const result=spawnSync(argv[0],argv.slice(1),{
    cwd:repositoryRoot,encoding:"utf8",maxBuffer:16_000_000,stdio:["ignore","pipe","pipe"]
  });
  if (result.status !== 0) {
    process.stderr.write(result.stderr);
    throw new Error(`GUIDE_HARNESS_BIND12_COMMAND_FAILED_${result.status}`);
  }
  return result.stdout;
}

async function requireAbsent(path) {
  try { await access(path); throw new Error("GUIDE_HARNESS_BIND12_OUTPUT_COLLISION"); }
  catch (error) { if (error?.code !== "ENOENT") throw error; }
}

assert.equal(run(["git","-C",productRoot,"rev-parse","HEAD"]).trim(),revision);
assert.equal(run(["git","-C",productRoot,"status","--short"]).trim(),"");

const [productInventory,attestation,suiteReceipt]=await Promise.all([
  readFile(productInventoryPath,"utf8").then(JSON.parse),
  readFile(attestationPath,"utf8").then(JSON.parse),
  readFile(suiteReceiptPath,"utf8").then(JSON.parse)
]);
assert.equal(productInventory.revision,revision);
assert.equal(attestation.finalCommit,revision);
assert.equal(attestation.snapshot.kbVersion,kbVersion);
assert.equal(attestation.snapshot.entryCount,44);
assert.equal(suiteReceipt.revision,revision);
assert.equal(suiteReceipt.kbVersion,kbVersion);
assert.equal(suiteReceipt.exitCode,0);
assert.equal(suiteReceipt.status,"PASSED");
assert.equal(suiteReceipt.files.length,34);
assert.equal(new Set(suiteReceipt.files).size,34);
assert.equal(suiteReceipt.files.includes("tests/integration/dev-database-principals.test.ts"),true);
assert.equal(suiteReceipt.files.every(path => suiteReceipt.argv.includes(path)),true);
assert.equal(suiteReceipt.argv.includes("--minWorkers"),false);
assert.deepEqual(suiteReceipt.testFiles,{ passed:34,failed:0,total:34 });
assert.equal(suiteReceipt.passed,1701);
assert.equal(suiteReceipt.failed,0);
assert.equal(suiteReceipt.TODO,1);

await requireAbsent(proofPath);
await requireAbsent(`${evidenceRoot}/GUIDE_LIVE_GUIDE12-actual-receipt.json`);
await requireAbsent(resolve(harnessDirectory,"browser-profile"));
for (let sequence=1;sequence<=54;sequence+=1) {
  await requireAbsent(`${evidenceRoot}/GUIDE_LIVE_GUIDE12-row-${String(sequence).padStart(2,"0")}.png`);
}

const unchangedFiles=[
  "gate-contract.json","matrix.mjs","runtime-capacity.mjs",
  "session-lifecycle.mjs","verify-final-branches.ts"
];
for (const path of unchangedFiles) {
  const [before,after]=await Promise.all([
    readFile(resolve(harnessDirectory,"../GUIDE_HARNESS_FIX9",path)),
    readFile(resolve(harnessDirectory,path))
  ]);
  assert.equal(sha256(after),sha256(before));
}

for (const path of [
  resolve(harnessDirectory,"build-final9-inventory.mjs"),
  resolve(harnessDirectory,"capture-public-guide.mjs"),
  resolve(harnessDirectory,"controls.mjs"),
  resolve(harnessDirectory,"matrix.mjs"),
  resolve(harnessDirectory,"runtime-capacity.mjs"),
  resolve(harnessDirectory,"session-lifecycle.mjs"),
  resolve(harnessDirectory,"verify-fix9-red.mjs"),
  resolve(harnessDirectory,"verify-guide-harness.mjs"),
  resolve(rowProofDirectory,"replay-row-proofs.mjs"),
  resolve(rowProofDirectory,"reviewed-harness-custody.mjs"),
  resolve(rowProofDirectory,"verify-negative-fixture.mjs")
]) run([process.execPath,"--check",path]);

const compatibility=JSON.parse(run([
  process.execPath,resolve(harnessDirectory,"verify-fix9-red.mjs")
]));
assert.equal(compatibility.result,"PASS");

const baseProof=JSON.parse(run([
  process.execPath,"--import","tsx",resolve(harnessDirectory,"verify-guide-harness.mjs"),
  productRoot,revision
]));
assert.deepEqual(Object.keys(baseProof),[
  "schemaVersion","result","revision","kbVersion","harnessSha256","controls","passed","names"
]);
assert.equal(baseProof.schemaVersion,2);
assert.equal(baseProof.result,"PASS");
assert.equal(baseProof.revision,revision);
assert.equal(baseProof.kbVersion,kbVersion);
assert.equal(baseProof.harnessSha256,expectedHarnessSha256);
assert.equal(baseProof.controls,baseProof.passed);
assert.equal(baseProof.controls,baseProof.names.length);
const previousProof=JSON.parse(await readFile(previousProofPath,"utf8"));
assert.equal(previousProof.controls,112);
assert.deepEqual(baseProof.names,previousProof.names);

const fixtureRoot=await mkdtemp(resolve(tmpdir(),"guide-bind12-inventory-"));
let actualBinding;
try {
  const rawProofPath=resolve(fixtureRoot,"base-proof.json");
  await writeFile(rawProofPath,`${JSON.stringify(baseProof,null,2)}\n`);
  const { validateGuideStaticBoundInputs }=await import("./pre-request-verifier.ts");
  const staticInput={
    productRoot,finalCommit:revision,expectedSnapshotVersion:kbVersion,expectedEntryCount:44,
    productInventoryPath,productInventorySha256:sha256(await readFile(productInventoryPath)),
    attestationPath,attestationSha256:sha256(await readFile(attestationPath)),
    requiredSuiteReceiptPath:suiteReceiptPath,requiredSuiteReceiptSha256:sha256(await readFile(suiteReceiptPath)),
    controlProofPath:rawProofPath,controlProofSha256:sha256(await readFile(rawProofPath))
  };
  actualBinding=validateGuideStaticBoundInputs(staticInput);
  assert.equal(actualBinding.inventory.productFiles.length,144);
  assert.equal(actualBinding.bound.controlCount,112);

  const oldInventoryPath=`${evidenceRoot}/GATE_GUIDE_FINAL8-manifest.json`;
  await assert.rejects(
    async () => validateGuideStaticBoundInputs({
      ...staticInput,productInventoryPath:oldInventoryPath,
      productInventorySha256:sha256(await readFile(oldInventoryPath))
    }),
    /GUIDE_HARNESS_BOUND_RECEIPT_INVALID/u
  );

  const missing={ ...productInventory,productFiles:productInventory.productFiles.filter(({ laneRelative }) =>
    laneRelative !== "apps/api/src/main.ts") };
  const missingPath=resolve(fixtureRoot,"missing-attested.json");
  await writeFile(missingPath,`${JSON.stringify(missing,null,2)}\n`);
  await assert.rejects(
    async () => validateGuideStaticBoundInputs({
      ...staticInput,productInventoryPath:missingPath,
      productInventorySha256:sha256(await readFile(missingPath))
    }),
    /GUIDE_HARNESS_ATTESTED_FILE_MISMATCH/u
  );

  const stale={ ...productInventory,productFiles:productInventory.productFiles.map(file =>
    file.laneRelative === "apps/api/src/main.ts" ? { ...file,sha256:"0".repeat(64) } : file) };
  const stalePath=resolve(fixtureRoot,"stale-attested.json");
  await writeFile(stalePath,`${JSON.stringify(stale,null,2)}\n`);
  await assert.rejects(
    async () => validateGuideStaticBoundInputs({
      ...staticInput,productInventoryPath:stalePath,
      productInventorySha256:sha256(await readFile(stalePath))
    }),
    /GUIDE_HARNESS_INVENTORY_FILE_MISMATCH/u
  );
} finally {
  await rm(fixtureRoot,{ recursive:true,force:true });
}

const addedNames=[
  "actual FINAL9 product inventory passes the shared pre request static binding",
  "old empty FINAL8 product inventory is rejected",
  "missing attested product member is rejected",
  "stale attested product member hash is rejected"
];
const proof={ ...baseProof,controls:baseProof.controls+addedNames.length,
  passed:baseProof.passed+addedNames.length,names:[...baseProof.names,...addedNames] };

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
  schemaVersion:1,node:"GUIDE_HARNESS_BIND12",result:"PASS",
  revision,kbVersion,harnessSha256:proof.harnessSha256,
  controls:proof.controls,passed:proof.passed,retainedControlPurposes:previousProof.controls,
  addedControlPurposes:proof.controls-previousProof.controls,
  actualBoundInput:{ productFiles:actualBinding.inventory.productFiles.length,attestedFiles:6 },
  adapterNegative:{ controls:negative.controls,passed:negative.passed,importerCalls:0,successfulRows:0 },
  syntaxFiles:11,unchangedFiles,
  boundInputs:{ productInventoryPath,attestationPath,suiteReceiptPath,suiteFiles:suiteReceipt.files.length },
  futureOutputs:{ receipt:"GUIDE_LIVE_GUIDE12-actual-receipt.json",screenshots:54,profileAbsent:true },
  traffic:{ browser:0,runtime:0,http:0,database:0,supportRequests:0,modelRequests:0 }
},null,2)}\n`);
