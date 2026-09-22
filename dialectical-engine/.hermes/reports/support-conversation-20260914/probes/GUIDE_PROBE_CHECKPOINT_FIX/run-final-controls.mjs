import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import { access,readFile,stat,writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import {
  computeGuideHarnessSha256,validateGuideUiProbeArguments
} from "../GUIDE_HARNESS_BIND15/controls.mjs";

const root="/Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine/.hermes/reports/support-conversation-20260914";
const directory=resolve(root,"probes/GUIDE_PROBE_CHECKPOINT_FIX");
const harness=resolve(root,"probes/GUIDE_HARNESS_BIND15");
const evidence=resolve(root,"evidence");
const revision="152eed4da1cd3e66b74d8301159ba76427552409";
const outputPath=resolve(evidence,"GUIDE_UI_TRANSITION_PROBE-run-LIVE8-PROBE5.json");
const logPath=resolve(root,"logs/GUIDE_UI_TRANSITION_PROBE5-LIVE8.log");
const scriptPath=resolve(directory,"probe-zero-request-ui.mjs");
const sha256=(bytes) => createHash("sha256").update(bytes).digest("hex");
async function absent(path) {
  try { await access(path); return false; }
  catch (error) { if (error?.code === "ENOENT") return true; throw error; }
}
function run(args) {
  return spawnSync(process.execPath,args,{ encoding:"utf8",stdio:["ignore","pipe","pipe"] });
}

assert.equal(await absent(outputPath),true);
assert.equal(await absent(logPath),true);
assert.equal(await absent(resolve(evidence,"GUIDE_LIVE_GUIDE15-actual-receipt.json")),true);

const original=run([resolve(directory,"checkpoint-regression.mjs"),"original"]);
assert.equal(original.status,1);
assert.match(original.stderr,/ReferenceError: EVIDENCE_ROOT is not defined/u);
assert.equal(original.stdout,"");

const fixed=run([resolve(directory,"checkpoint-regression.mjs"),"fixed"]);
assert.equal(fixed.status,0);
assert.equal(fixed.stderr,"");
const fixedProof=JSON.parse(fixed.stdout);
assert.deepEqual(fixedProof,{
  schemaVersion:1,result:"PASS",initialExclusive:true,update:true,failureCheckpoint:true,
  mkdirCalls:3,writeCalls:3
});

for (const path of ["checkpoint-writer.mjs","checkpoint-regression.mjs","probe-zero-request-ui.mjs"]) {
  const syntax=run(["--check",resolve(directory,path)]);
  assert.equal(syntax.status,0);
  assert.equal(syntax.stderr,"");
}

const accepted=validateGuideUiProbeArguments([revision,outputPath]);
assert.deepEqual(accepted,{ expectedRevision:revision,outputPath });
for (const args of [
  [revision,resolve(evidence,"GUIDE_UI_TRANSITION_PROBE2-run-LIVE8.json")],
  [revision,"/private/tmp/GUIDE_UI_TRANSITION_PROBE-run-LIVE8-PROBE5.json"],
  [revision,outputPath,"extra"],
  ["bad-revision",outputPath]
]) assert.throws(() => validateGuideUiProbeArguments(args),/GUIDE_UI_PROBE_ARGUMENTS_INVALID/u);

const unchanged={
  orderedEightSha256:computeGuideHarnessSha256(harness),
  captureSha256:sha256(await readFile(resolve(harness,"capture-public-guide.mjs"))),
  controlsSha256:sha256(await readFile(resolve(harness,"controls.mjs"))),
  matrixSha256:sha256(await readFile(resolve(harness,"matrix.mjs"))),
  adapterCustodySha256:sha256(await readFile(resolve(root,"probes/GUIDE_ROW_PROOF_BIND15/reviewed-harness-custody.mjs"))),
  controlProofSha256:sha256(await readFile(resolve(evidence,"GUIDE_HARNESS_BIND15-control-proof.json")))
};
assert.deepEqual(unchanged,{
  orderedEightSha256:"b6162d665b60a1a35d882e41fa5b0da3259e9cb86bae32ca5d5056d320ad99d4",
  captureSha256:"53dbf7a2df891632de70c83ce3fab60a4deac98005df0015f6393880285e9f0b",
  controlsSha256:"20adde062fd0f7f478f8bf235e9c1be3a541f5f9bb2a5d421f1d6921d76397b7",
  matrixSha256:"4e3250313f415b71cea228cc5f3559cf9a2375cb5ca70916ecfbaac32c1a5a2c",
  adapterCustodySha256:"4aa66298dd92f028f048003afdf6966f6c905b7aa9dc95f1a2ae9c2a8d22dd8e",
  controlProofSha256:"fb25e5bb044db363bc5ea54cf6090082603b3796df3d9d63df15671881da1fd5"
});
const controlProof=JSON.parse(await readFile(resolve(evidence,"GUIDE_HARNESS_BIND15-control-proof.json"),"utf8"));
assert.equal(controlProof.controls,130);
assert.equal(controlProof.passed,130);

const scriptBytes=await readFile(scriptPath);
const scriptInfo=await stat(scriptPath);
const contract={
  schemaVersion:1,node:"GUIDE_PROBE_CHECKPOINT_FIX",revision,
  script:{ path:scriptPath,sha256:sha256(scriptBytes),bytes:scriptInfo.size },
  cwd:"/Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine/.worktrees/support-conversation-cp1/dialectical-engine",
  argv:["node",scriptPath,revision,outputPath],outputPath,logPath,
  childStatusPreservedBy:"direct stdout/stderr redirection without tee",
  argumentGuardControls:{
    acceptedExactFutureArgv:true,rejectedOldProbe2Basename:true,rejectedWrongRoot:true,
    rejectedExtraArgument:true,rejectedMalformedRevision:true
  },
  executed:false
};
await writeFile(resolve(directory,"probe-contract.json"),`${JSON.stringify(contract,null,2)}\n`,{ flag:"wx",mode:0o600 });
const proof={
  schemaVersion:1,node:"GUIDE_PROBE_CHECKPOINT_FIX",result:"PASS",revision,
  originalChildStatus:original.status,fixedChildStatus:fixed.status,
  checkpoint:{ initialExclusive:true,update:true,failurePersistence:true },
  syntaxFiles:3,argumentGuardControls:5,unchanged,
  retained:{ controls:130,matrixRows:54,adapterNegatives:3,actualNamespace:"GUIDE_LIVE_GUIDE15" },
  future:{ outputPath,logPath,absent:true },
  traffic:{ browser:0,runtime:0,http:0,supportRequests:0,modelRequests:0,database:0 }
};
await writeFile(resolve(evidence,"GUIDE_PROBE_CHECKPOINT_FIX-control-proof.json"),`${JSON.stringify(proof,null,2)}\n`,{ flag:"wx",mode:0o600 });
process.stdout.write(`${JSON.stringify(proof,null,2)}\n`);
