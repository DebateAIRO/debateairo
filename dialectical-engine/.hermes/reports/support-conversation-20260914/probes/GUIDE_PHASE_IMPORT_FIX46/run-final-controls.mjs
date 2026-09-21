import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import { access,readFile,stat,writeFile } from "node:fs/promises";
import { validateRetainedCompositionContract } from "../GUIDE_CONTINUATION_BIND40/composition.mjs";

const ROOT="/Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine/.hermes/reports/support-conversation-20260914";
const E=`${ROOT}/evidence`;
const P=`${ROOT}/probes/GUIDE_PHASE_IMPORT_FIX46`;
const PRODUCT="/Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine/.worktrees/support-conversation-cp1/dialectical-engine";
const CONTRACT=`${E}/GUIDE_PHASE_IMPORT_FIX46-command-contract.json`;
const OPERATOR=`${P}/run-operator.mjs`;
const NODE="/Users/vladmihaimiron/.local/bin/node";
const sha256=bytes=>createHash("sha256").update(bytes).digest("hex");
const binding=async path=>{const bytes=await readFile(path);return{path,sha256:sha256(bytes),bytes:bytes.byteLength};};
const checks=[];
const pass=(name,details={})=>checks.push({name,result:"PASS",...details});
const contractBytes=await readFile(CONTRACT);
const contract=JSON.parse(contractBytes);
const contractSha256=sha256(contractBytes);
assert.equal(contractSha256,"2257cae89fbe2592ddbb0d1ba6533931cb9c6fe1824465240ead8b9586af2e26");
assert.equal(contract.node,"GUIDE_PHASE_IMPORT_FIX46");
assert.deepEqual(Object.keys(contract.phases),["preflight","readiness","capacity","gate","rowProof","capture","idle"]);
for(const phase of Object.values(contract.phases))assert.equal(phase.argv[2],CONTRACT);
pass("final command contract and seven self paths",{contractSha256});

const moduleClosure=[];
for(const expected of contract.moduleClosure){
  const actual=await binding(expected.path);
  assert.deepEqual(actual,expected);
  moduleClosure.push(actual);
}
assert.equal(moduleClosure.length,31);
assert.equal(sha256(Buffer.from(JSON.stringify(moduleClosure))),contract.moduleClosureSha256);
pass("31-file reachable local module closure exact hashes",{moduleClosureSha256:contract.moduleClosureSha256});

const missingContract=`${E}/GUIDE_PHASE_IMPORT_FIX46-missing-contract-control.json`;
try{await access(missingContract);assert.fail(missingContract);}catch(error){if(error?.code!=="ENOENT")throw error;}
const expectedLoads=[
  ["phase.preflight",contract.phases.preflight.argv[1],[contract.phases.preflight.argv[1],missingContract],"ENOENT"],
  ["phase.readiness",contract.phases.readiness.argv[1],[contract.phases.readiness.argv[1],missingContract],"ENOENT"],
  ["phase.capacity",contract.phases.capacity.argv[1],[contract.phases.capacity.argv[1],missingContract],"ENOENT"],
  ["phase.gate",contract.phases.gate.argv[1],[contract.phases.gate.argv[1],missingContract],"ENOENT"],
  ["phase.rowProof",contract.phases.rowProof.argv[1],[contract.phases.rowProof.argv[1],missingContract],"ENOENT"],
  ["phase.capture",contract.phases.capture.argv[1],[contract.phases.capture.argv[1],missingContract],"ENOENT"],
  ["phase.idle",contract.phases.idle.argv[1],[contract.phases.idle.argv[1],missingContract],"ENOENT"],
  ["child.ui",contract.phases.preflight.ui.argv[1],[contract.phases.preflight.ui.argv[1]],"GUIDE_CONTINUATION_UI_OUTPUT_PATH_INVALID"],
  ["child.rowProof",contract.phases.rowProof.childArgv[3],["--import","tsx",contract.phases.rowProof.childArgv[3]],"GUIDE_CONTINUATION_ROW_PROOF_ARGUMENTS_INVALID"],
  ["child.capture",contract.phases.capture.childArgv[3],["--import","tsx",contract.phases.capture.childArgv[3]],"GUIDE_HARNESS_GATE_PATH_REQUIRED"]
];
const loadBoundaries=[];
for(const [role,script,argv,errorCode] of expectedLoads){
  const result=spawnSync(NODE,argv,{cwd:PRODUCT,encoding:"utf8"});
  assert.notEqual(result.status,0,role);
  assert.match(result.stderr,new RegExp(errorCode,"u"),role);
  assert.doesNotMatch(result.stderr,/ERR_MODULE_NOT_FOUND|does not provide an export named/u,role);
  loadBoundaries.push({role,script,status:result.status,errorCode});
}
pass("seven phases and three configured children real-load to pre-I/O boundaries",{loaded:loadBoundaries.length});

const broken=`${ROOT}/probes/GUIDE_CONTINUATION_BIND40/phase-capacity.mjs`;
const missing=spawnSync(NODE,[broken],{cwd:PRODUCT,encoding:"utf8"});
assert.notEqual(missing.status,0);
assert.match(missing.stderr,/ERR_MODULE_NOT_FOUND/u);
assert.match(missing.stderr,/GUIDE_CONTINUATION_BIND40\/phase-contract\.mjs/u);
pass("actual missing-dependency predecessor rejects before I/O",{failureCode:"ERR_MODULE_NOT_FOUND"});

const capacityPath=`${E}/GUIDE_PHASE_IMPORT_FIX46-inert-capacity.json`;
const gatePath=`${E}/GUIDE_PHASE_IMPORT_FIX46-inert-gate.json`;
const rowProofPath=`${E}/GUIDE_PHASE_IMPORT_FIX46-row-proof-control.json`;
const measuredAtUtc=new Date().toISOString();
const capacity={schemaVersion:1,measuredAtUtc,finalCommit:contract.revision,kbVersion:contract.kbVersion,
  supportRegisterVersion:"1",supportSchemaVersion:1,supportSnapshotSha256:"a".repeat(64),fullSnapshotSha256:"b".repeat(64),supportEnabled:true,supportModelRef:"development:hermes-glm-5.3-flash",
  limits:{support_limit_anon_msgs_10m:20,support_limit_anon_msgs_24h:100,support_limit_anon_sessions_1h:5,support_limit_session_msgs:14,support_limit_msg_chars:1000,support_relay_concurrency:1,support_queue_depth:1,support_daily_call_cap:100,support_lock_after_injections:3,support_ip_cooldown_minutes:10},
  observed:{maxAnonSessionEvents1hByIp:0,maxAnonMessageEvents10mByIp:0,maxAnonMessageEvents24hByIp:0,anyIpCooldownActive:false,callsToday:0,liveRelayWaiters:0,relayState:"AVAILABLE"}};
const capacityBytes=Buffer.from(`${JSON.stringify(capacity,null,2)}\n`);
await writeFile(capacityPath,capacityBytes,{flag:"wx",mode:0o600});
const template=JSON.parse(await readFile(contract.gateTemplatePath,"utf8"));
const gate={...template,runtimeCapacityPath:capacityPath,runtimeCapacitySha256:sha256(capacityBytes)};
await writeFile(gatePath,`${JSON.stringify(gate,null,2)}\n`,{flag:"wx",mode:0o600});
const rowProof=spawnSync(NODE,["--import","tsx",contract.phases.rowProof.childArgv[3],gatePath,contract.revision,rowProofPath],{cwd:PRODUCT,encoding:"utf8"});
assert.equal(rowProof.status,0,rowProof.stderr);
const rows=JSON.parse(await readFile(rowProofPath,"utf8"));
assert.equal(rows.custody.matrixCount,58);
assert.equal(rows.rows.length,58);
assert.equal(rows.actualModelRows,18);
assert.equal(rows.rows.every((row,index)=>row.sequence===index+1&&row.result==="PASS"),true);
pass("corrected actual row child preserves full58 logical proof",{rows:58,actualModelRows:18});

const composition=JSON.parse(await readFile(contract.compositionContractPath,"utf8"));
await validateRetainedCompositionContract(composition);
assert.equal(composition.futureComposedManifestPath,contract.composedManifest);
pass("retained10 plus remaining21 composition contract bound to LIVE35");

assert.equal(new Set(contract.futureAbsence).size,contract.futureAbsence.length);
for(const path of contract.futureAbsence){try{await access(path);assert.fail(path);}catch(error){if(error?.code!=="ENOENT")throw error;}}
pass("115 operational future paths remain absent",{count:contract.futureAbsence.length});

const operatorBytes=await readFile(OPERATOR);
const operatorContract={schemaVersion:1,node:"GUIDE_PHASE_IMPORT_FIX46",cwd:PRODUCT,
  argv:[NODE,"--import","tsx",OPERATOR],sandboxPermissions:"require_escalated",toolCapturedOutput:true,redirection:false,
  script:{path:OPERATOR,sha256:sha256(operatorBytes),bytes:operatorBytes.byteLength},
  commandContract:{path:CONTRACT,sha256:contractSha256,bytes:contractBytes.byteLength},
  operatorOwned:{outputs:{prerequisite:contract.lifecycle.prerequisite,stop:contract.lifecycle.stop},logs:contract.lifecycle.operatorLogs},
  futureAbsence:{count:contract.futureAbsence.length,uniqueCount:new Set(contract.futureAbsence).size,paths:contract.futureAbsence}};
await writeFile(`${E}/GUIDE_PHASE_IMPORT_FIX46-operator-contract.json`,`${JSON.stringify(operatorContract,null,2)}\n`,{flag:"wx",mode:0o600});
const current=spawnSync(NODE,["--import","tsx",OPERATOR,"--inert-guard",CONTRACT,contractSha256],{cwd:PRODUCT,encoding:"utf8"});
assert.equal(current.status,0,current.stderr);assert.match(current.stdout,/PASS_INERT_GUARD/u);
const stale=spawnSync(NODE,["--import","tsx",OPERATOR,"--inert-guard",CONTRACT,"0".repeat(64)],{cwd:PRODUCT,encoding:"utf8"});
assert.notEqual(stale.status,0);assert.match(stale.stderr,/CONTRACT_HASH_MISMATCH/u);
pass("actual final operator accepts current digest and rejects stale digest");

const closureProof={schemaVersion:1,node:"GUIDE_PHASE_IMPORT_FIX46",revision:contract.revision,
  verdict:"PASS",roots:contract.moduleClosureRoots,moduleClosureSha256:contract.moduleClosureSha256,
  modules:contract.moduleClosure,loadBoundaries,missingDependencyNegative:{script:broken,status:missing.status,code:"ERR_MODULE_NOT_FOUND"},
  traffic:{runtime:false,browser:false,http:false,status:0,capacity:0,database:0,support:0,model:0}};
await writeFile(`${E}/GUIDE_PHASE_IMPORT_FIX46-module-closure-proof.json`,`${JSON.stringify(closureProof,null,2)}\n`,{flag:"wx",mode:0o600});
const proof={schemaVersion:1,node:"GUIDE_PHASE_IMPORT_FIX46",revision:contract.revision,
  verdict:"PASS_PHASE_IMPORTS_BOUND_REVIEW_REQUIRED",controls:checks.length+1,passed:checks.length+1,
  checks:[...checks,{name:"proof serialized",result:"PASS"}],contractSha256,moduleClosureSha256:contract.moduleClosureSha256,
  traffic:{runtime:false,browser:false,http:false,status:0,capacity:0,database:0,support:0,model:0}};
await writeFile(`${E}/GUIDE_PHASE_IMPORT_FIX46-control-proof.json`,`${JSON.stringify(proof,null,2)}\n`,{flag:"wx",mode:0o600});
await writeFile(`${ROOT}/logs/GUIDE_PHASE_IMPORT_FIX46-controls-final.log`,`${JSON.stringify({verdict:proof.verdict,passed:proof.passed,contractSha256,moduleClosureSha256:contract.moduleClosureSha256},null,2)}\n`,{flag:"wx",mode:0o600});
process.stdout.write(`${JSON.stringify({verdict:proof.verdict,passed:proof.passed,contractSha256,moduleClosureSha256:contract.moduleClosureSha256})}\n`);
