import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { access,readdir,readFile,writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

const reportRoot="/Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine/.hermes/reports/support-conversation-20260914";
const evidenceRoot=`${reportRoot}/evidence`;
const harness=fileURLToPath(new URL("./",import.meta.url));
const harnessPrevious=fileURLToPath(new URL("../GUIDE_HARNESS_BIND11/",import.meta.url));
const adapter=fileURLToPath(new URL("../GUIDE_ROW_PROOF_BIND12/",import.meta.url));
const adapterPrevious=fileURLToPath(new URL("../GUIDE_ROW_PROOF_BIND11/",import.meta.url));
const revision="152eed4da1cd3e66b74d8301159ba76427552409";
const expectedHarnessSha256="1c46d0d55ed0e8f4f7900682a031ccec2b47e9e831d7357a426975f10e78391a";
const orderedEight=[
  "capture-public-guide.mjs","controls.mjs","matrix.mjs","pre-request-verifier.ts",
  "runtime-capacity.mjs","session-lifecycle.mjs","verify-final-branches.ts","verify-guide-harness.mjs"
];
const sha256=bytes => createHash("sha256").update(bytes).digest("hex");
const fileRecord=async (directory,path) => {
  const bytes=await readFile(resolve(directory,path));
  return { path,bytes:bytes.length,sha256:sha256(bytes) };
};
const writeNew=(path,value) => writeFile(path,`${JSON.stringify(value,null,2)}\n`,{ mode:0o600,flag:"wx" });
const productInventoryPath=`${evidenceRoot}/GATE_GUIDE_FINAL9-manifest.json`;
const attestationPath=`${evidenceRoot}/GUIDE_LOCK_HANDOFF_FIX-snapshot-receipt.json`;
const suiteReceiptPath=`${evidenceRoot}/GUIDE_LOCK_HANDOFF_FIX-required-suites.json`;

const proof=JSON.parse(await readFile(`${evidenceRoot}/GUIDE_HARNESS_BIND12-control-proof.json`,"utf8"));
const previousProof=JSON.parse(await readFile(`${evidenceRoot}/GUIDE_HARNESS_BIND11-control-proof.json`,"utf8"));
assert.equal(proof.result,"PASS");
assert.equal(proof.revision,revision);
assert.equal(proof.harnessSha256,expectedHarnessSha256);
assert.equal(proof.controls,116);
assert.equal(proof.passed,116);
assert.deepEqual(proof.names.slice(0,previousProof.names.length),previousProof.names);
assert.deepEqual(proof.names.slice(previousProof.names.length),[
  "actual FINAL9 product inventory passes the shared pre request static binding",
  "old empty FINAL8 product inventory is rejected",
  "missing attested product member is rejected",
  "stale attested product member hash is rejected"
]);

const [productInventoryBytes,attestationBytes,suiteReceiptBytes]=await Promise.all([
  readFile(productInventoryPath),readFile(attestationPath),readFile(suiteReceiptPath)
]);
const productInventory=JSON.parse(productInventoryBytes);
const attestation=JSON.parse(attestationBytes);
const suiteReceipt=JSON.parse(suiteReceiptBytes);
assert.equal(productInventory.revision,revision);
assert.equal(productInventory.productFiles.length,144);
assert.equal(new Set(productInventory.productFiles.map(({ laneRelative }) => laneRelative)).size,144);
assert.equal(attestation.finalCommit,revision);
assert.equal(attestation.snapshot.kbVersion,proof.kbVersion);
assert.equal(attestation.snapshot.entryCount,44);
assert.equal(suiteReceipt.revision,revision);
assert.equal(suiteReceipt.kbVersion,proof.kbVersion);
assert.equal(suiteReceipt.files.length,34);
assert.equal(new Set(suiteReceipt.files).size,34);
assert.equal(suiteReceipt.files.includes("tests/integration/dev-database-principals.test.ts"),true);

const orderedFiles=[];
for (const path of orderedEight) orderedFiles.push(await fileRecord(harness,path));
const computedHarnessSha256=sha256(JSON.stringify(orderedFiles));
assert.equal(computedHarnessSha256,expectedHarnessSha256);

const harnessNames=(await readdir(harness)).filter(name => name !== "browser-profile").sort();
const adapterNames=(await readdir(adapter)).sort();
async function delta(directory,previousDirectory,names) {
  const records=[];
  for (const path of names) {
    const current=await fileRecord(directory,path);
    let previous=null;
    try { previous=await fileRecord(previousDirectory,path); } catch (error) {
      if (error?.code !== "ENOENT") throw error;
    }
    records.push({
      path,status:previous === null ? "NEW" : previous.sha256 === current.sha256 ? "UNCHANGED" : "CHANGED",
      sha256:current.sha256,bytes:current.bytes,
      ...(previous === null ? {} : { previousSha256:previous.sha256,previousBytes:previous.bytes })
    });
  }
  return records;
}
const harnessDelta=await delta(harness,harnessPrevious,harnessNames);
const adapterDelta=await delta(adapter,adapterPrevious,adapterNames);
const unchangedHarness=harnessDelta.filter(({ status }) => status === "UNCHANGED").map(({ path }) => path);
assert.deepEqual(unchangedHarness,[
  "controls.mjs","gate-contract.json","matrix.mjs","runtime-capacity.mjs",
  "session-lifecycle.mjs","verify-final-branches.ts","verify-fix9-red.mjs"
]);

const outputPaths=[`${evidenceRoot}/GUIDE_LIVE_GUIDE12-actual-receipt.json`];
for (let sequence=1;sequence<=54;sequence+=1) {
  outputPaths.push(`${evidenceRoot}/GUIDE_LIVE_GUIDE12-row-${String(sequence).padStart(2,"0")}.png`);
}
outputPaths.push(resolve(harness,"browser-profile"));
const present=[];
for (const path of outputPaths) {
  try { await access(path); present.push(path); }
  catch (error) { if (error?.code !== "ENOENT") throw error; }
}
assert.deepEqual(present,[]);

await writeNew(`${evidenceRoot}/GUIDE_HARNESS_BIND12-custody.json`,{
  schemaVersion:1,node:"GUIDE_HARNESS_BIND12",revision,
  productClean:true,orderedEightDigestAlgorithm:"sha256(JSON.stringify(ordered file records))",
  harnessSha256:computedHarnessSha256,orderedFiles,
  controlProof:{
    path:`${evidenceRoot}/GUIDE_HARNESS_BIND12-control-proof.json`,
    sha256:sha256(await readFile(`${evidenceRoot}/GUIDE_HARNESS_BIND12-control-proof.json`)),
    controls:proof.controls,passed:proof.passed
  },
  retainedControlPurposes:previousProof.controls,addedControlPurposes:proof.controls-previousProof.controls,
  matrixSha256:orderedFiles.find(({ path }) => path === "matrix.mjs").sha256,
  preRequestVerifierSha256:orderedFiles.find(({ path }) => path === "pre-request-verifier.ts").sha256,
  boundInputs:{
    productInventory:{ path:productInventoryPath,sha256:sha256(productInventoryBytes),revision:productInventory.revision,files:productInventory.productFiles.length,attestedFiles:6 },
    attestation:{ path:attestationPath,sha256:sha256(attestationBytes),kbVersion:attestation.snapshot.kbVersion,entryCount:attestation.snapshot.entryCount },
    requiredSuite:{ path:suiteReceiptPath,sha256:sha256(suiteReceiptBytes),files:suiteReceipt.files.length,passed:suiteReceipt.passed,TODO:suiteReceipt.TODO }
  },
  traffic:{ browser:0,runtime:0,http:0,database:0,supportRequests:0,modelRequests:0 }
});

await writeNew(`${evidenceRoot}/GUIDE_HARNESS_BIND12-control-delta.json`,{
  schemaVersion:1,node:"GUIDE_HARNESS_BIND12",revision,
  finding:"GH10_R1_EMPTY_FINAL8_PRODUCT_INVENTORY",
  resolvedBy:[
    "derive FINAL9 from the complete cumulative Git delta and rehash all 144 present files",
    "exercise the actual FINAL9 object through shared pre-request membership, file-hash and six-attested-file validation",
    "reject the retained empty FINAL8 plus missing-member and stale-hash fixtures",
    "bind future outputs to unused GUIDE_LIVE_GUIDE12 namespace",
    "retain all 112 reviewed control purposes and all 54 matrix rows"
  ],
  controls:{ previous:previousProof.controls,current:proof.controls,retained:previousProof.controls,added:4 },
  inventory:{
    previousFinal8ProductFiles:0,currentFinal9ProductFiles:144,deletedProductPaths:3,
    attestedFiles:6,producerInvariant:"lane-relative cumulative members equal the baseline-to-final Git delta; every present member is rehashed from the clean final checkout"
  },
  harnessDelta,adapterDelta,
  dispositions:{
    live6ActualRow43Cause:"PRODUCT_CORRECTION_CONSUMED_SEPARATELY",
    productPatch:false,matrixChanged:false,sourcePolicyChanged:false,navigationChanged:false,
    actualTraffic:false,liveRetry:false
  }
});

await writeNew(`${evidenceRoot}/GUIDE_HARNESS_BIND12-output-absence.json`,{
  schemaVersion:1,node:"GUIDE_HARNESS_BIND12",checked:outputPaths.length,present,
  futureReceipt:"GUIDE_LIVE_GUIDE12-actual-receipt.json",futureScreenshots:54,
  browserProfile:"ABSENT",captureExecuted:false
});

process.stdout.write(`${JSON.stringify({
  result:"PASS",revision,harnessSha256:computedHarnessSha256,
  controls:proof.controls,retained:previousProof.controls,added:4,
  harnessFiles:harnessDelta.length,adapterFiles:adapterDelta.length,
  futureOutputsChecked:outputPaths.length,traffic:0
},null,2)}\n`);
