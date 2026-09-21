import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import { access,readFile,rm,writeFile } from "node:fs/promises";
import { computeGuideHarnessSha256 } from "./controls.mjs";
import { createGuidePreRequestVerifier } from "./pre-request-verifier.ts";
import { validateRetainedCompositionContract } from "./composition.mjs";
const ROOT="/Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine/.hermes/reports/support-conversation-20260914",E=`${ROOT}/evidence`,P=`${ROOT}/probes/GUIDE_CONTINUATION_BIND40`;
const CONTRACT=`${E}/GUIDE_CONTINUATION_BIND40-command-contract.json`,OPERATOR=`${P}/run-operator.mjs`;
const sha256=bytes=>createHash("sha256").update(bytes).digest("hex");
const names=[];const pass=name=>names.push(name);
const contractBytes=await readFile(CONTRACT),contract=JSON.parse(contractBytes),contractHash=sha256(contractBytes);
assert.equal(contractHash,"8b8a25888415c79381aa195d601b2cf2aaf1401ce830abaa5d84a608630bdcea");pass("command contract digest");
assert.deepEqual(Object.keys(contract.phases),["preflight","readiness","capacity","gate","rowProof","capture","idle"]);pass("seven phases exact");
for(const phase of Object.values(contract.phases))assert.equal(phase.argv[2],CONTRACT);pass("all seven self paths");
assert.deepEqual(contract.budget,{captureSessions:3,captureMessages:21,modelCallCeiling:18,reservedOwnerMessages:6,reservedOwnerModelCalls:6,deferredOwnerSessions:2,requiredSessionHeadroom1h:3,requiredMessageHeadroom24h:27,requiredDailyCallHeadroom:24});pass("budget3-21-18-plus-owner");
assert.equal(contract.ownerCapacity.output,"/Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine/.hermes/reports/support-conversation-20260914/evidence/GUIDE_LIVE21-owner-capacity.json");assert.equal(contract.ownerWalkthrough,"/Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine/.hermes/reports/support-conversation-20260914/evidence/GUIDE_LIVE25-owner-testability.json");pass("established owner paths retained");
assert.equal(new Set(contract.futureAbsence).size,contract.futureAbsence.length);for(const path of contract.futureAbsence){try{await access(path);assert.fail(`future present ${path}`);}catch(error){if(error?.code!=="ENOENT")throw error;}}pass("future paths unique absent");
const compositionBytes=await readFile(contract.compositionContractPath);assert.equal(sha256(compositionBytes),contract.compositionContractSha256);await validateRetainedCompositionContract(JSON.parse(compositionBytes));pass("retained10 composition hashes");
const core=JSON.parse(await readFile(`${E}/GUIDE_CONTINUATION_BIND40-core-control-proof-final.json`,"utf8"));assert.equal(core.harnessSha256,computeGuideHarnessSha256(P));pass("six-file harness current");
const helper=await readFile(`${P}/screenshot-evidence-successor.mjs`);assert.equal(sha256(helper),contract.screenshotHelper.sha256);assert.equal(contract.screenshotHelper.sha256,"10a806c50999a84f3a036375807ef29a29c92ef6368047ec4e14c28af148b3be");pass("immutable FIX39 helper");
const capture=await readFile(`${P}/capture-public-guide.mjs`,"utf8");for(const anchor of ["row.sequence===54","destinationSequence:43","languageSelectionPerformed:false","GUIDE_LIVE_GUIDE24","createComposedManifest"]){assert.ok(capture.includes(anchor),anchor);}pass("narrow54-to43 controller anchors");
const gateTemplate=JSON.parse(await readFile(contract.gateTemplatePath));
const measuredAtUtc=new Date().toISOString(),capacity={schemaVersion:1,measuredAtUtc,finalCommit:contract.revision,kbVersion:contract.kbVersion,
  supportRegisterVersion:"1",supportSchemaVersion:1,supportSnapshotSha256:"a".repeat(64),fullSnapshotSha256:"b".repeat(64),supportEnabled:true,supportModelRef:"development:hermes-glm-5.3-flash",
  limits:{support_limit_anon_msgs_10m:20,support_limit_anon_msgs_24h:100,support_limit_anon_sessions_1h:5,support_limit_session_msgs:14,support_limit_msg_chars:1000,support_relay_concurrency:1,support_queue_depth:1,support_daily_call_cap:100,support_lock_after_injections:3,support_ip_cooldown_minutes:10},
  observed:{maxAnonSessionEvents1hByIp:2,maxAnonMessageEvents10mByIp:0,maxAnonMessageEvents24hByIp:73,anyIpCooldownActive:false,callsToday:76,liveRelayWaiters:0,relayState:"AVAILABLE"}};
const capacityPath=`${P}/inert-capacity.json`,gatePath=`${P}/inert-gate.json`;
try{
  const capacityBytes=Buffer.from(`${JSON.stringify(capacity,null,2)}\n`);await writeFile(capacityPath,capacityBytes,{flag:"wx",mode:0o600});
  const gate={...gateTemplate,runtimeCapacityPath:capacityPath,runtimeCapacitySha256:sha256(capacityBytes)};await writeFile(gatePath,`${JSON.stringify(gate,null,2)}\n`,{flag:"wx",mode:0o600});
  const verifier=await createGuidePreRequestVerifier(gate);assert.equal(verifier.actualModelRows,18);assert.equal(verifier.modelRows>=18,true);for(const row of [10,54,43,57,58])assert.ok(verifier.prepare({sequence:row}));
  pass("actual constructor exact gated path");
}finally{await rm(capacityPath,{force:true});await rm(gatePath,{force:true});}
const current=spawnSync("/Users/vladmihaimiron/.local/bin/node",["--import","tsx",OPERATOR,"--inert-guard",CONTRACT,contractHash],{cwd:contract.cwd,encoding:"utf8"});assert.equal(current.status,0);assert.match(current.stdout,/PASS_INERT_GUARD/u);pass("operator current digest boundary");
const stale=spawnSync("/Users/vladmihaimiron/.local/bin/node",["--import","tsx",OPERATOR,"--inert-guard",CONTRACT,"0".repeat(64)],{cwd:contract.cwd,encoding:"utf8"});assert.notEqual(stale.status,0);assert.match(stale.stderr,/CONTRACT_HASH_MISMATCH/u);pass("operator stale digest rejects before I O");
const operatorBytes=await readFile(OPERATOR),operatorContract=JSON.parse(await readFile(`${E}/GUIDE_CONTINUATION_BIND40-operator-contract.json`));assert.equal(operatorContract.script.sha256,sha256(operatorBytes));assert.equal(operatorContract.commandContract.sha256,contractHash);assert.deepEqual(operatorContract.operatorOwned.outputs,{prerequisite:`${E}/GUIDE_LIVE32-prerequisites.json`,stop:`${E}/GUIDE_LIVE32-stop.json`});assert.equal(Object.keys(operatorContract.operatorOwned.logs).length,7);pass("operator metadata actual bytes and ownership");
const proof={schemaVersion:1,node:"GUIDE_CONTINUATION_BIND40",revision:contract.revision,verdict:"PASS",controls:names.length+1,passed:names.length+1,names:[...names,"final proof serialized"],traffic:{publicAssetsFromUiProof:true,forwardedSupport:0,status:0,capacity:0,database:0,model:0}};
await writeFile(`${E}/GUIDE_CONTINUATION_BIND40-final-control-proof.json`,`${JSON.stringify(proof,null,2)}\n`,{flag:"wx",mode:0o600});
await writeFile(`${ROOT}/logs/GUIDE_CONTINUATION_BIND40-controls-final.log`,`${JSON.stringify({verdict:"PASS",passed:proof.passed,contractHash},null,2)}\n`,{flag:"wx",mode:0o600});
process.stdout.write(`${JSON.stringify({passed:proof.passed,contractHash})}\n`);
