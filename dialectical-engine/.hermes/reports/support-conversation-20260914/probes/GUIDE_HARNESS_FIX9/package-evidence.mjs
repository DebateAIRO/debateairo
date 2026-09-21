import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { access,readdir,readFile,writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

const reportRoot="/Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine/.hermes/reports/support-conversation-20260914";
const evidenceRoot=`${reportRoot}/evidence`;
const harness=fileURLToPath(new URL("./",import.meta.url));
const harnessPrevious=fileURLToPath(new URL("../GUIDE_HARNESS_FIX8/",import.meta.url));
const adapter=fileURLToPath(new URL("../GUIDE_ROW_PROOF_FIX9/",import.meta.url));
const adapterPrevious=fileURLToPath(new URL("../GUIDE_ROW_PROOF_FIX8/",import.meta.url));
const revision="0b9320eae5a0ad8c9fcc9648ed85ebef1b289c13";
const expectedHarnessSha256="acc2c2cdf503f185ce8a43fcc6b262d144314708085a80e79ac262d99fed6fbc";
const orderedEight=[
  "capture-public-guide.mjs","controls.mjs","matrix.mjs","pre-request-verifier.ts",
  "runtime-capacity.mjs","session-lifecycle.mjs","verify-final-branches.ts","verify-guide-harness.mjs"
];
const sha256=bytes => createHash("sha256").update(bytes).digest("hex");
const fileRecord=async (directory,path) => {
  const bytes=await readFile(resolve(directory,path));
  return { path,bytes:bytes.length,sha256:sha256(bytes) };
};
const writeNew=(path,value) => writeFile(path,`${JSON.stringify(value,null,2)}\n`,{ mode:0o600 });

const proof=JSON.parse(await readFile(`${evidenceRoot}/GUIDE_HARNESS_FIX9-control-proof.json`,"utf8"));
const previousProof=JSON.parse(await readFile(`${evidenceRoot}/GUIDE_HARNESS_FIX8-control-proof.json`,"utf8"));
assert.equal(proof.result,"PASS");
assert.equal(proof.revision,revision);
assert.equal(proof.harnessSha256,expectedHarnessSha256);
assert.equal(proof.controls,112);
assert.equal(proof.passed,112);
assert.equal(previousProof.names.every(name => proof.names.includes(name)),true);

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
  "session-lifecycle.mjs","verify-final-branches.ts"
]);

const outputPaths=[`${evidenceRoot}/GUIDE_LIVE_GUIDE9-actual-receipt.json`];
for (let sequence=1;sequence<=54;sequence+=1) {
  outputPaths.push(`${evidenceRoot}/GUIDE_LIVE_GUIDE9-row-${String(sequence).padStart(2,"0")}.png`);
}
outputPaths.push(resolve(harness,"browser-profile"));
const present=[];
for (const path of outputPaths) {
  try { await access(path); present.push(path); }
  catch (error) { if (error?.code !== "ENOENT") throw error; }
}
assert.deepEqual(present,[]);

await writeNew(`${evidenceRoot}/GUIDE_HARNESS_FIX9-custody.json`,{
  schemaVersion:1,node:"GUIDE_HARNESS_FIX9",revision,
  productClean:true,orderedEightDigestAlgorithm:"sha256(JSON.stringify(ordered file records))",
  harnessSha256:computedHarnessSha256,orderedFiles,
  controlProof:{
    path:`${evidenceRoot}/GUIDE_HARNESS_FIX9-control-proof.json`,
    sha256:sha256(await readFile(`${evidenceRoot}/GUIDE_HARNESS_FIX9-control-proof.json`)),
    controls:proof.controls,passed:proof.passed
  },
  retainedControlPurposes:previousProof.controls,addedControlPurposes:proof.controls-previousProof.controls,
  matrixSha256:orderedFiles.find(({ path }) => path === "matrix.mjs").sha256,
  preRequestVerifierSha256:orderedFiles.find(({ path }) => path === "pre-request-verifier.ts").sha256,
  traffic:{ browser:0,runtime:0,http:0,database:0,supportRequests:0,modelRequests:0 }
});

await writeNew(`${evidenceRoot}/GUIDE_HARNESS_FIX9-control-delta.json`,{
  schemaVersion:1,node:"GUIDE_HARNESS_FIX9",revision,
  finding:"JSON_PARSE_FAILURE_COLLAPSED_TO_OBJECT",
  resolvedBy:[
    "actual response-read helper retains rejected JSON parsing as null",
    "staged consumer records body INVALID with GUIDE_HARNESS_API_BODY_INVALID",
    "numeric status is retained without response bytes or exception data",
    "legitimate parsed public bodies remain unchanged"
  ],
  controls:{ previous:previousProof.controls,current:proof.controls,retained:previousProof.controls,added:1 },
  harnessDelta,adapterDelta,
  dispositions:{
    live4ActualRow43Cause:"UNKNOWN_UNAVAILABLE_NOT_PERSISTED",
    productPatch:false,matrixChanged:false,sourcePolicyChanged:false,navigationChanged:false,
    actualTraffic:false,liveRetry:false
  }
});

await writeNew(`${evidenceRoot}/GUIDE_HARNESS_FIX9-output-absence.json`,{
  schemaVersion:1,node:"GUIDE_HARNESS_FIX9",checked:outputPaths.length,present,
  futureReceipt:"GUIDE_LIVE_GUIDE9-actual-receipt.json",futureScreenshots:54,
  browserProfile:"ABSENT",captureExecuted:false
});

process.stdout.write(`${JSON.stringify({
  result:"PASS",revision,harnessSha256:computedHarnessSha256,
  controls:proof.controls,retained:previousProof.controls,added:1,
  harnessFiles:harnessDelta.length,adapterFiles:adapterDelta.length,
  futureOutputsChecked:outputPaths.length,traffic:0
},null,2)}\n`);
