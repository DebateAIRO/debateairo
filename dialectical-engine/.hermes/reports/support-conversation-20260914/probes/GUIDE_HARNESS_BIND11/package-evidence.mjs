import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { access,readdir,readFile,writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

const reportRoot="/Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine/.hermes/reports/support-conversation-20260914";
const evidenceRoot=`${reportRoot}/evidence`;
const harness=fileURLToPath(new URL("./",import.meta.url));
const harnessPrevious=fileURLToPath(new URL("../GUIDE_HARNESS_FIX9/",import.meta.url));
const adapter=fileURLToPath(new URL("../GUIDE_ROW_PROOF_BIND11/",import.meta.url));
const adapterPrevious=fileURLToPath(new URL("../GUIDE_ROW_PROOF_FIX9/",import.meta.url));
const revision="152eed4da1cd3e66b74d8301159ba76427552409";
const expectedHarnessSha256="9b4391fd3e828da6224d9c27600259b2d44be0135c4f5e86c922abc25278303f";
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
const productInventoryPath=`${evidenceRoot}/GATE_GUIDE_FINAL8-manifest.json`;
const attestationPath=`${evidenceRoot}/GUIDE_LOCK_HANDOFF_FIX-snapshot-receipt.json`;
const suiteReceiptPath=`${evidenceRoot}/GUIDE_LOCK_HANDOFF_FIX-required-suites.json`;

const proof=JSON.parse(await readFile(`${evidenceRoot}/GUIDE_HARNESS_BIND11-control-proof.json`,"utf8"));
const previousProof=JSON.parse(await readFile(`${evidenceRoot}/GUIDE_HARNESS_FIX9-control-proof.json`,"utf8"));
assert.equal(proof.result,"PASS");
assert.equal(proof.revision,revision);
assert.equal(proof.harnessSha256,expectedHarnessSha256);
assert.equal(proof.controls,112);
assert.equal(proof.passed,112);
assert.deepEqual(proof.names,previousProof.names);

const [productInventoryBytes,attestationBytes,suiteReceiptBytes]=await Promise.all([
  readFile(productInventoryPath),readFile(attestationPath),readFile(suiteReceiptPath)
]);
const productInventory=JSON.parse(productInventoryBytes);
const attestation=JSON.parse(attestationBytes);
const suiteReceipt=JSON.parse(suiteReceiptBytes);
assert.equal(productInventory.revision,revision);
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
  "gate-contract.json","matrix.mjs","pre-request-verifier.ts","runtime-capacity.mjs",
  "session-lifecycle.mjs","verify-final-branches.ts","verify-fix9-red.mjs"
]);

const outputPaths=[`${evidenceRoot}/GUIDE_LIVE_GUIDE11-actual-receipt.json`];
for (let sequence=1;sequence<=54;sequence+=1) {
  outputPaths.push(`${evidenceRoot}/GUIDE_LIVE_GUIDE11-row-${String(sequence).padStart(2,"0")}.png`);
}
outputPaths.push(resolve(harness,"browser-profile"));
const present=[];
for (const path of outputPaths) {
  try { await access(path); present.push(path); }
  catch (error) { if (error?.code !== "ENOENT") throw error; }
}
assert.deepEqual(present,[]);

await writeNew(`${evidenceRoot}/GUIDE_HARNESS_BIND11-custody.json`,{
  schemaVersion:1,node:"GUIDE_HARNESS_BIND11",revision,
  productClean:true,orderedEightDigestAlgorithm:"sha256(JSON.stringify(ordered file records))",
  harnessSha256:computedHarnessSha256,orderedFiles,
  controlProof:{
    path:`${evidenceRoot}/GUIDE_HARNESS_BIND11-control-proof.json`,
    sha256:sha256(await readFile(`${evidenceRoot}/GUIDE_HARNESS_BIND11-control-proof.json`)),
    controls:proof.controls,passed:proof.passed
  },
  retainedControlPurposes:previousProof.controls,addedControlPurposes:proof.controls-previousProof.controls,
  matrixSha256:orderedFiles.find(({ path }) => path === "matrix.mjs").sha256,
  preRequestVerifierSha256:orderedFiles.find(({ path }) => path === "pre-request-verifier.ts").sha256,
  boundInputs:{
    productInventory:{ path:productInventoryPath,sha256:sha256(productInventoryBytes),revision:productInventory.revision },
    attestation:{ path:attestationPath,sha256:sha256(attestationBytes),kbVersion:attestation.snapshot.kbVersion,entryCount:attestation.snapshot.entryCount },
    requiredSuite:{ path:suiteReceiptPath,sha256:sha256(suiteReceiptBytes),files:suiteReceipt.files.length,passed:suiteReceipt.passed,TODO:suiteReceipt.TODO }
  },
  traffic:{ browser:0,runtime:0,http:0,database:0,supportRequests:0,modelRequests:0 }
});

await writeNew(`${evidenceRoot}/GUIDE_HARNESS_BIND11-control-delta.json`,{
  schemaVersion:1,node:"GUIDE_HARNESS_BIND11",revision,
  finding:"MECHANICAL_BINDING_TO_CORRECTED_PRODUCT",
  resolvedBy:[
    "bind exact clean product revision 152eed4da1cd3e66b74d8301159ba76427552409",
    "bind required suite membership to the producer's exact 34 files",
    "bind future outputs to unused GUIDE_LIVE_GUIDE11 namespace",
    "retain all 112 reviewed control purposes and all 54 matrix rows"
  ],
  controls:{ previous:previousProof.controls,current:proof.controls,retained:previousProof.controls,added:0 },
  harnessDelta,adapterDelta,
  dispositions:{
    live6ActualRow43Cause:"PRODUCT_CORRECTION_CONSUMED_SEPARATELY",
    productPatch:false,matrixChanged:false,sourcePolicyChanged:false,navigationChanged:false,
    actualTraffic:false,liveRetry:false
  }
});

await writeNew(`${evidenceRoot}/GUIDE_HARNESS_BIND11-output-absence.json`,{
  schemaVersion:1,node:"GUIDE_HARNESS_BIND11",checked:outputPaths.length,present,
  futureReceipt:"GUIDE_LIVE_GUIDE11-actual-receipt.json",futureScreenshots:54,
  browserProfile:"ABSENT",captureExecuted:false
});

process.stdout.write(`${JSON.stringify({
  result:"PASS",revision,harnessSha256:computedHarnessSha256,
  controls:proof.controls,retained:previousProof.controls,added:0,
  harnessFiles:harnessDelta.length,adapterFiles:adapterDelta.length,
  futureOutputsChecked:outputPaths.length,traffic:0
},null,2)}\n`);
