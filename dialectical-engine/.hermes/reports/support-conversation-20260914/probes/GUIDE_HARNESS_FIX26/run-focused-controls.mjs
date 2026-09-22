import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { access,readFile,writeFile } from "node:fs/promises";
import { readFinalContract } from "../GUIDE_HARNESS_BIND21/phase-contract.mjs";

const ROOT="/Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine/.hermes/reports/support-conversation-20260914";
const E=`${ROOT}/evidence`;
const L=`${ROOT}/logs`;
const P=`${ROOT}/probes`;
const PRODUCT="/Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine/.worktrees/support-conversation-cp1/dialectical-engine";
const NODE="/Users/vladmihaimiron/.local/bin/node";
const CONTRACT_PATH=`${E}/GUIDE_HARNESS_FIX26-command-contract.json`;
const sha256=bytes => createHash("sha256").update(bytes).digest("hex");
const writeJson=(path,value) => writeFile(path,`${JSON.stringify(value,null,2)}\n`,{ flag:"wx",mode:0o600 });
const absent=async path => { try { await access(path); return false; } catch (error) { if (error?.code !== "ENOENT") throw error; return true; } };

const finalBytes=await readFile(CONTRACT_PATH);
const finalContract=await readFinalContract(CONTRACT_PATH);
assert.equal(finalContract.node,"GUIDE_HARNESS_FIX26");
assert.deepEqual(Object.keys(finalContract.phases),[
  "preflight","readiness","capacity","gate","rowProof","capture","idle"
]);
for (const phase of Object.values(finalContract.phases)) assert.equal(phase.argv[2],CONTRACT_PATH);
assert.equal(finalContract.gateTemplatePath,`${E}/GUIDE_HARNESS_FIX25-gate-template.json`);
const futurePaths=[
  ...Object.values(finalContract.phases).flatMap(phase => [phase.output,phase.log]),
  finalContract.phases.preflight.ui.output,finalContract.phases.preflight.ui.log,
  finalContract.phases.rowProof.result,finalContract.actualReceipt,finalContract.browserProfile,
  finalContract.ownerCapacity.output
];
for (const path of futurePaths) assert.equal(await absent(path),true,path);

const capacityPath=`${E}/GUIDE_HARNESS_FIX26-inert-capacity.json`;
const gatePath=`${E}/GUIDE_HARNESS_FIX26-inert-gate.json`;
const gateDeclarationPath=`${E}/GUIDE_HARNESS_FIX26-inert-gate-declaration.json`;
const capacity=JSON.parse(await readFile(`${E}/GUIDE_LIVE21-capacity.json`,"utf8"));
capacity.measuredAtUtc=new Date().toISOString();
const capacityBytes=Buffer.from(`${JSON.stringify(capacity,null,2)}\n`);
await writeFile(capacityPath,capacityBytes,{ flag:"wx",mode:0o600 });
const gateTemplateBytes=await readFile(finalContract.gateTemplatePath);
assert.equal(sha256(gateTemplateBytes),finalContract.gateTemplateSha256);
const gate={ ...JSON.parse(gateTemplateBytes),runtimeCapacityPath:capacityPath,
  runtimeCapacitySha256:sha256(capacityBytes) };
const gateBytes=Buffer.from(`${JSON.stringify(gate,null,2)}\n`);
await writeFile(gatePath,gateBytes,{ flag:"wx",mode:0o600 });
await writeJson(gateDeclarationPath,{ schemaVersion:1,node:"GUIDE_HARNESS_FIX26",
  fixtureOnly:true,operationalUseForbidden:true,runtimeAvailabilityClaimed:false,
  finalGateTemplatePath:finalContract.gateTemplatePath,
  finalGateTemplateSha256:sha256(gateTemplateBytes),
  substitutions:["runtimeCapacityPath","runtimeCapacitySha256"],
  capacityPath,capacitySha256:sha256(capacityBytes),gatePath,gateSha256:sha256(gateBytes) });

const phaseRowProof=`${P}/GUIDE_HARNESS_FIX26/phase-row-proof.mjs`;
const phaseCapture=`${P}/GUIDE_HARNESS_FIX26/phase-capture.mjs`;
const sentinel=`${P}/GUIDE_HARNESS_FIX26/sentinel-capture-child.mjs`;
const positiveContractPath=`${E}/GUIDE_HARNESS_FIX26-inert-positive-contract.json`;
const positiveStatusPath=`${E}/GUIDE_HARNESS_FIX26-inert-row-proof-status.json`;
const positiveResultPath=`${E}/GUIDE_ROW_PROOF-run-GUIDE_HARNESS_FIX26-POSITIVE.json`;
const positiveRowLog=`${L}/GUIDE_HARNESS_FIX26-inert-row-proof.log`;
const positiveCaptureStatus=`${E}/GUIDE_HARNESS_FIX26-inert-capture-status.json`;
const positiveCaptureLog=`${L}/GUIDE_HARNESS_FIX26-inert-capture.log`;
const positiveMarker=`${E}/GUIDE_HARNESS_FIX26-inert-capture-child-marker.txt`;
const positive=structuredClone(finalContract);
positive.node="GUIDE_HARNESS_FIX26_INERT_POSITIVE";
positive.phases.gate.output=gatePath;
positive.phases.rowProof={ argv:[NODE,phaseRowProof,positiveContractPath],output:positiveStatusPath,
  log:positiveRowLog,childArgv:[NODE,"--import","tsx",
    `${P}/GUIDE_HARNESS_FIX25/replay-row-proofs.mjs`,gatePath,finalContract.revision,positiveResultPath],
  result:positiveResultPath };
positive.phases.capture={ argv:[NODE,phaseCapture,positiveContractPath],output:positiveCaptureStatus,
  log:positiveCaptureLog,childArgv:[NODE,"--import","tsx",sentinel,gatePath] };
positive.actualReceipt=`${E}/GUIDE_HARNESS_FIX26-inert-unused-actual-receipt.json`;
await writeJson(positiveContractPath,positive);

const run=(argv,extraEnv={}) => spawnSync(argv[0],argv.slice(1),{
  cwd:PRODUCT,encoding:"utf8",env:{ ...process.env,...extraEnv }
});
const produced=run(positive.phases.rowProof.argv);
assert.equal(produced.status,0,produced.stderr);
const producerStatus=JSON.parse(await readFile(positiveStatusPath,"utf8"));
assert.equal(producerStatus.status,0);
assert.equal(producerStatus.validation,"PASS");
assert.equal(producerStatus.validatedRows,58);
assert.equal(producerStatus.resultSha256,sha256(await readFile(positiveResultPath)));
assert.equal(producerStatus.gateSha256,sha256(gateBytes));
const captured=run(positive.phases.capture.argv,{ GUIDE_FIX26_SENTINEL_PATH:positiveMarker });
assert.equal(captured.status,0,captured.stderr);
assert.equal(await readFile(positiveMarker,"utf8"),"capture-child-spawned\n");
const captureStatus=JSON.parse(await readFile(positiveCaptureStatus,"utf8"));
assert.equal(captureStatus.status,0);
assert.equal(captureStatus.consumedRowProofSha256,producerStatus.resultSha256);
assert.equal(captureStatus.consumedGateSha256,producerStatus.gateSha256);
assert.equal(captureStatus.consumedRowCount,58);

const cases=[];
async function negative(name,{ statusMutator,resultBytes,errorCode,missingStatus=false }) {
  const contractPath=`${E}/GUIDE_HARNESS_FIX26-negative-${name}-contract.json`;
  const statusPath=`${E}/GUIDE_HARNESS_FIX26-negative-${name}-row-proof-status.json`;
  const resultPath=`${E}/GUIDE_HARNESS_FIX26-negative-${name}-row-proof-result.json`;
  const captureOutput=`${E}/GUIDE_HARNESS_FIX26-negative-${name}-capture-status.json`;
  const captureLog=`${L}/GUIDE_HARNESS_FIX26-negative-${name}-capture.log`;
  const marker=`${E}/GUIDE_HARNESS_FIX26-negative-${name}-child-marker.txt`;
  const negativeContract=structuredClone(positive);
  negativeContract.node=`GUIDE_HARNESS_FIX26_NEGATIVE_${name.toUpperCase()}`;
  negativeContract.phases.rowProof.output=statusPath;
  negativeContract.phases.rowProof.result=resultPath;
  negativeContract.phases.capture={ argv:[NODE,phaseCapture,contractPath],output:captureOutput,
    log:captureLog,childArgv:[NODE,"--import","tsx",sentinel,gatePath] };
  await writeJson(contractPath,negativeContract);
  let bytes=resultBytes ?? await readFile(positiveResultPath);
  if (!missingStatus) {
    await writeFile(resultPath,bytes,{ flag:"wx",mode:0o600 });
    const status={ ...producerStatus,resultPath,resultSha256:sha256(bytes) };
    statusMutator?.(status);
    await writeJson(statusPath,status);
  }
  const result=run(negativeContract.phases.capture.argv,{ GUIDE_FIX26_SENTINEL_PATH:marker });
  assert.equal(result.status,1);
  assert.match(result.stderr,new RegExp(errorCode,"u"));
  assert.equal(await absent(marker),true);
  assert.equal(await absent(captureOutput),true);
  assert.equal(await absent(captureLog),true);
  cases.push({ name,result:"PASS",errorCode,childCalls:0,browserCalls:0 });
}

await negative("missing",{ missingStatus:true,errorCode:"GUIDE_CAPTURE_ROW_PROOF_EVIDENCE_MISSING" });
await negative("nonzero",{ statusMutator:status => { status.status=1; status.validation="CHILD_FAILED"; },
  errorCode:"GUIDE_CAPTURE_ROW_PROOF_STATUS_INVALID" });
await negative("stale",{ statusMutator:status => { status.completedAtUtc="2020-01-01T00:00:00.000Z"; },
  errorCode:"GUIDE_CAPTURE_ROW_PROOF_STATUS_INVALID" });
await negative("malformed",{ resultBytes:Buffer.from("{\n"),
  errorCode:"GUIDE_CAPTURE_ROW_PROOF_RESULT_INVALID" });
const tampered=Buffer.concat([await readFile(positiveResultPath),Buffer.from(" \n")]);
await negative("tampered",{ resultBytes:tampered,
  statusMutator:status => { status.resultSha256=producerStatus.resultSha256; },
  errorCode:"GUIDE_CAPTURE_ROW_PROOF_HASH_MISMATCH" });

for (const path of futurePaths) assert.equal(await absent(path),true,path);
const proof={ schemaVersion:1,node:"GUIDE_HARNESS_FIX26",ticket:"t_45088d73",
  revision:finalContract.revision,result:"PASS",verdict:"PASS_CAPTURE_PROOF_DEPENDENCY",
  actualByteContractSha256:sha256(finalBytes),phaseCount:7,selfBoundPhaseCount:7,
  producer:{ status:producerStatus.status,validation:producerStatus.validation,
    resultPath:producerStatus.resultPath,resultSha256:producerStatus.resultSha256,
    gatePath:producerStatus.gatePath,gateSha256:producerStatus.gateSha256,
    validatedRows:producerStatus.validatedRows },
  consumer:{ status:captureStatus.status,consumedRowProofSha256:captureStatus.consumedRowProofSha256,
    consumedGateSha256:captureStatus.consumedGateSha256,consumedRowCount:captureStatus.consumedRowCount,
    sentinelChildCalls:1 },negativeCases:cases,
  beforeSpawn:true,freshnessMaxAgeMs:120000,futureSkewMs:5000,
  operationalOutputsCheckedAbsent:futurePaths.length,
  retained:{ gateTemplatePath:finalContract.gateTemplatePath,
    ownerCapacityContractSha256:finalContract.ownerCapacity.contractSha256,
    actualNamespace:"GUIDE_LIVE_GUIDE21",provenance:"FRESH_GUIDE21_FIXED31" },
  traffic:{ browser:0,http:0,status:0,capacity:0,database:0,support:0,model:0 } };
await writeJson(`${E}/GUIDE_HARNESS_FIX26-control-proof.json`,proof);
process.stdout.write(`${JSON.stringify({ result:"PASS",controls:13,negativeCases:cases.length,
  producerRows:58,consumerHash:captureStatus.consumedRowProofSha256 })}\n`);
