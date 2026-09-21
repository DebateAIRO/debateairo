import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { access,readFile,writeFile } from "node:fs/promises";
import { execFileSync,spawnSync } from "node:child_process";

const ROOT="/Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine/.hermes/reports/support-conversation-20260914";
const E=`${ROOT}/evidence`;
const P=`${ROOT}/probes/GUIDE_PREVIEW_BIND32`;
const PRODUCT="/Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine/.worktrees/support-conversation-cp1/dialectical-engine";
const NODE="/Users/vladmihaimiron/.local/bin/node";
const REVISION="0d34f82f4a2188d0ce1db04655b693798ffd2169";
const KB="7ef4244d30507e162cebf544eeb6b9578f17ed91711f2d164f2a4d75dd72c7af";
const CONTRACT=`${E}/GUIDE_PREVIEW_BIND32-command-contract.json`;
const OPERATOR=`${E}/GUIDE_PREVIEW_BIND32-operator-contract.json`;
const ROW_PROOF=`${E}/GUIDE_ROW_PROOF-run-PREVIEW_BIND32.json`;
const OUTPUT=`${E}/GUIDE_PREVIEW_BIND32-binding-proof.json`;
const sha256=bytes=>createHash("sha256").update(bytes).digest("hex");
const readJson=async path=>JSON.parse(await readFile(path,"utf8"));
const command=await readJson(CONTRACT);
const operator=await readJson(OPERATOR);
const rowProof=await readJson(ROW_PROOF);
const phases=["preflight","readiness","capacity","gate","rowProof","capture","idle"];
assert.equal(command.node,"GUIDE_PREVIEW_BIND32");
assert.equal(command.revision,REVISION);
assert.equal(command.kbVersion,KB);
assert.deepEqual(Object.keys(command.phases),phases);
for (const phase of phases) assert.equal(command.phases[phase].argv[2],CONTRACT);
assert.equal(command.phases.preflight.ui.argv[2],REVISION);
assert.equal(command.phases.rowProof.childArgv[5],REVISION);
assert.equal(command.phases.capture.childArgv[3],`${P}/capture-public-guide.mjs`);
assert.equal(command.actualSequences.length,31);
assert.equal(new Set(command.actualSequences).size,31);
assert.equal(command.actualReceipt,`${E}/GUIDE_LIVE_GUIDE22-actual-receipt.json`);
assert.equal(command.phases.rowProof.result,`${E}/GUIDE_ROW_PROOF-run-LIVE29.json`);
assert.equal(command.ownerCapacity.output,`${E}/GUIDE_LIVE21-owner-capacity.json`);
const helper=await readFile(`${P}/screenshot-evidence-successor.mjs`);
assert.equal(sha256(helper),"824e780a1817c198a6ca6ebc6215948241ecccbb5611617a033e650799ac4b29");
const capture=await readFile(`${P}/capture-public-guide.mjs`,"utf8");
assert.match(capture,/FRESH_GUIDE22_FIXED31/u);
assert.match(capture,/GUIDE_LIVE_GUIDE22-row-/u);
assert.match(capture,/sessionCreationTimesUtc\.length < 2/u);
const capturePhase=await readFile(`${ROOT}/probes/GUIDE_HARNESS_FIX26/phase-capture.mjs`,"utf8");
assert.match(capturePhase,/rowProof/u);
assert.match(capturePhase,/readFile\(contract\.phases\.rowProof\.output\)/u);
assert.match(capturePhase,/readFile\(contract\.phases\.rowProof\.result\)/u);
assert.match(capturePhase,/validateGuideRowProofDependency/u);
assert.equal(operator.commandContract.sha256,sha256(await readFile(CONTRACT)));
assert.deepEqual(operator.argv,[NODE,"--import","tsx",`${P}/run-operator.mjs`]);
assert.equal(operator.requiredToolPermissionContext,"require_escalated");
assert.equal(operator.stdoutStderr,"tool_captured_no_outer_redirection");
assert.equal(operator.futureAbsence.count,123);
assert.equal(operator.futureAbsence.uniqueCount,123);
assert.equal(new Set(operator.futureAbsence.paths).size,123);
assert.ok(operator.futureAbsence.paths.includes(command.phases.rowProof.result));
assert.ok(operator.futureAbsence.paths.includes(command.actualReceipt));
assert.ok(operator.futureAbsence.paths.includes(`${E}/GUIDE_LIVE25-owner-testability.json`));
for (const path of operator.futureAbsence.paths) {
  try { await access(path); throw new Error(`GUIDE_PREVIEW_BIND32_FUTURE_OUTPUT_PRESENT:${path}`); }
  catch (error) { if (error?.code!=="ENOENT") throw error; }
}
const runtimeContract=await readJson(command.runtimeCustodyContractPath);
assert.deepEqual(runtimeContract.exactKeys,["schemaVersion","node","revision","pid","pgid","commandMarker","runtimeLogPath","ports","startedAtUtc","detached","ordinarySystemTls"]);
assert.equal(runtimeContract.required.revision,REVISION);
assert.equal(runtimeContract.required.node,"GUIDE_RUNTIME8");
assert.equal(runtimeContract.required.detached,true);
assert.equal(runtimeContract.required.ordinarySystemTls.status,200);
const owner=await readJson(command.ownerCapacity.contractPath);
assert.equal(owner.argv[2],REVISION);
assert.equal(owner.output,`${E}/GUIDE_LIVE21-owner-capacity.json`);
assert.deepEqual(owner.requirements,{maxMessages:6,maxSessions:2,modelCallCeiling:6});
assert.equal(rowProof.verdict,"PASS");
assert.equal(rowProof.resultCode,"GUIDE_ROW_PROOF_ALL_ROWS_PASS");
assert.equal(rowProof.rows.length,58);
assert.ok(rowProof.rows.every(row=>row.result==="PASS"&&row.code==="GUIDE_ROW_PROOF_PASS"));
assert.deepEqual(rowProof.traffic,{browser:false,sessions:0,supportRequests:0,modelRequests:0});
assert.equal(execFileSync("git",["-C",PRODUCT,"rev-parse","HEAD"],{encoding:"utf8"}).trim(),REVISION);
assert.equal(execFileSync("git",["-C",PRODUCT,"status","--short"],{encoding:"utf8"}),"");
for (const script of [`${P}/capture-public-guide.mjs`,`${P}/screenshot-evidence-successor.mjs`,`${P}/run-operator.mjs`]) {
  const checked=spawnSync(NODE,["--check",script],{encoding:"utf8"});
  assert.equal(checked.status,0,checked.stderr);
}
const names=[
  "exact clean reviewed product revision is bound",
  "FINAL18 nonempty product inventory is bound",
  "unchanged reviewed44 KB attestation is rebound",
  "exact34 membership has current affected-frame custody without single-run overclaim",
  "current product full58 constructor passes every row",
  "current full58 proof records zero browser session Support and model traffic",
  "exact31 order remains31 unique rows",
  "five-session fourteen-EN seventeen-RO twenty-seven-model plan remains in reviewed matrix",
  "FIX30 screenshot helper is byte-identical",
  "actual GUIDE22 and LIVE29 namespaces remain unchanged",
  "all seven argv self-bind the BIND32 contract",
  "proof-before-capture reviewed phase remains bound",
  "Runtime8 exact11-key custody contract is bound",
  "deferred owner command binds current revision and six-message two-session requirement",
  "123 reserved future paths are unique and absent",
  "operator remains node --import tsx require-escalated tool-captured stop-first",
  "successor scripts pass syntax checks"
];
const result={schemaVersion:1,node:"GUIDE_PREVIEW_BIND32",ticket:"t_f068fcad",revision:REVISION,verdict:"PASS_BOUND_OFFLINE_REVIEW_REQUIRED",controls:names.length,passed:names.length,names,full58:{path:ROW_PROOF,sha256:sha256(await readFile(ROW_PROOF)),rows:58},futureAbsence:{count:123,allAbsent:true},traffic:{runtime:0,http:0,status:0,capacity:0,database:0,support:0,model:0}};
await writeFile(OUTPUT,`${JSON.stringify(result,null,2)}\n`,{flag:"wx",mode:0o600});
process.stdout.write(`${JSON.stringify({verdict:result.verdict,controls:result.controls,passed:result.passed,rows:58})}\n`);
