import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile,writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { computeGuideHarnessSha256 } from "./controls.mjs";
import { GUIDE_ACTUAL_PLAN,GUIDE_ACTUAL_SEQUENCES,GUIDE_MATRIX,GUIDE_RETAINED_SEQUENCES,GUIDE_SESSION_GROUPS,validateGuideActualPlan } from "./matrix.mjs";
import { validateGuideRuntimeCapacity } from "./runtime-capacity.mjs";

const ROOT="/Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine/.hermes/reports/support-conversation-20260914";
const OUTPUT=`${ROOT}/evidence/GUIDE_CONTINUATION_BIND40-core-control-proof-final.json`;
const UI=`${ROOT}/evidence/GUIDE_CONTINUATION_BIND40-ui-proof-final4.json`;
const names=[]; const pass=name=>names.push(name);
validateGuideActualPlan(); pass("remaining21 exact plan");
assert.deepEqual(GUIDE_RETAINED_SEQUENCES,[1,2,15,19,23,27,31,35,39,47]); pass("retained10 exact");
assert.deepEqual(GUIDE_ACTUAL_SEQUENCES,[10,18,26,34,56,58,54,43,5,13,21,25,29,37,45,53,8,12,42,55,57]); pass("remaining21 order");
assert.equal(new Set([...GUIDE_RETAINED_SEQUENCES,...GUIDE_ACTUAL_SEQUENCES]).size,31); pass("composed31 unique");
assert.equal(GUIDE_MATRIX.length,58); pass("logical58 retained");
assert.deepEqual(GUIDE_SESSION_GROUPS.map(group=>group.sequences.length),[8,8,5]); pass("three exact session groups");
assert.equal(GUIDE_ACTUAL_PLAN.modelCallCeiling,18); pass("model ceiling18");
const ui=JSON.parse(await readFile(UI,"utf8"));
for(const [key,value] of Object.entries({completed:true,navigationPerformed:true,destinationHelp:true,fullRoRestored:true,
  priorMessageRestored:true,sessionIdentityPreserved:true,capabilityPreserved:true,languageSelectionPerformed:false,
  createSessionAttempts:0,messageAttempts:1,messageUsedSeededSession:true,hiddenSupportSetupRequests:0,forwardedDynamicRequests:0})){
  assert.equal(ui[key],value,key);
}
pass("compiled UI same-session transition");
const measuredAtUtc="2026-09-21T13:00:00.000Z";
const capacity={schemaVersion:1,measuredAtUtc,finalCommit:"0d34f82f4a2188d0ce1db04655b693798ffd2169",
  kbVersion:"7ef4244d30507e162cebf544eeb6b9578f17ed91711f2d164f2a4d75dd72c7af",
  supportRegisterVersion:"1",supportSchemaVersion:1,supportSnapshotSha256:"a".repeat(64),fullSnapshotSha256:"b".repeat(64),
  supportEnabled:true,supportModelRef:"development:hermes-glm-5.3-flash",
  limits:{support_limit_anon_msgs_10m:20,support_limit_anon_msgs_24h:100,support_limit_anon_sessions_1h:5,
    support_limit_session_msgs:14,support_limit_msg_chars:1000,support_relay_concurrency:1,support_queue_depth:1,
    support_daily_call_cap:100,support_lock_after_injections:3,support_ip_cooldown_minutes:10},
  observed:{maxAnonSessionEvents1hByIp:2,maxAnonMessageEvents10mByIp:0,maxAnonMessageEvents24hByIp:73,
    anyIpCooldownActive:false,callsToday:76,liveRelayWaiters:0,relayState:"AVAILABLE"}};
const expected={finalCommit:capacity.finalCommit,kbVersion:capacity.kbVersion,modelRows:18,nowMs:Date.parse(measuredAtUtc)};
validateGuideRuntimeCapacity(capacity,expected); pass("capacity exact3-27-24 accepted");
for(const [name,mutate] of [
  ["capacity sessions2 rejected",value=>value.observed.maxAnonSessionEvents1hByIp=3],
  ["capacity messages26 rejected",value=>value.observed.maxAnonMessageEvents24hByIp=74],
  ["capacity model23 rejected",value=>value.observed.callsToday=77]
]){
  const value=structuredClone(capacity); mutate(value);
  assert.throws(()=>validateGuideRuntimeCapacity(value,expected),/GUIDE_HARNESS_CAPACITY_INSUFFICIENT/u); pass(name);
}
const directory=dirname(fileURLToPath(import.meta.url));
const harnessSha256=computeGuideHarnessSha256(directory); pass("six-file harness digest");
const proof={schemaVersion:2,result:"PASS",revision:capacity.finalCommit,kbVersion:capacity.kbVersion,
  harnessSha256,controls:names.length+1,passed:names.length+1,names:[...names,"control proof serialized"]};
await writeFile(OUTPUT,`${JSON.stringify(proof,null,2)}\n`,{flag:"wx",mode:0o600});
process.stdout.write(`${JSON.stringify({passed:proof.passed,harnessSha256,sha256:createHash("sha256").update(await readFile(OUTPUT)).digest("hex")})}\n`);
