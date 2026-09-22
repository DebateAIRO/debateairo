import assert from "node:assert/strict";
import { readFile,writeFile } from "node:fs/promises";
import { commitCaptureSuccess } from "./completion-state.mjs";
const ROOT="/Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine/.hermes/reports/support-conversation-20260914",E=`${ROOT}/evidence`,P=`${ROOT}/probes/GUIDE_COMPLETION_FIX42`;
const exact=[{ordinal:1,observedAtUtc:"2026-09-21T12:00:00.000Z"},{ordinal:2,observedAtUtc:"2026-09-21T12:00:31.000Z"},{ordinal:3,observedAtUtc:"2026-09-21T12:01:02.000Z"}];
const cases=[
 ["valid",exact,null,true],
 ["missing",exact.slice(0,2),null,false],
 ["extra",[...exact,{ordinal:4,observedAtUtc:"2026-09-21T12:01:33.000Z"}],null,false],
 ["malformed",[{ordinal:1,observedAtUtc:"bad"},exact[1],exact[2]],null,false],
 ["out-of-order",[exact[0],{ordinal:2,observedAtUtc:"2026-09-21T11:59:59.000Z"},exact[2]],null,false],
 ["accumulated-failure",exact,"GUIDE_CONTINUATION_SESSION_TIME_RECORD_FAILED",false]
];
const names=[];
for(const [name,times,failure,allowed] of cases){let checkpoints=0;const result={completed:false,sessionVersionFailure:failure,sessionCreationTimesUtc:times};let error=null;try{await commitCaptureSuccess({result,checkpoint:async()=>{checkpoints+=1;}});}catch(value){error=value;}
 if(allowed){assert.equal(error,null);assert.equal(result.completed,true);assert.equal(checkpoints,1);}else{assert.ok(error);assert.equal(result.completed,false);assert.equal(checkpoints,0);}names.push(`${name} ${allowed?"passes":"rejects before success checkpoint"}`);}
const source=await readFile(`${P}/capture-public-guide.mjs`,"utf8"),call=source.indexOf("await commitCaptureSuccess({result,checkpoint});"),compose=source.indexOf("await createComposedManifest",call);assert.ok(call>0&&compose>call);assert.equal(source.slice(Math.max(0,call-80),call).includes("result.completed=true"),false);names.push("real capture invokes completion predicate before composer");
const proof={schemaVersion:1,node:"GUIDE_COMPLETION_FIX42",revision:"0d34f82f4a2188d0ce1db04655b693798ffd2169",verdict:"PASS",controls:names.length+1,passed:names.length+1,names:[...names,"proof serialized"],traffic:{runtime:0,browser:0,http:0,status:0,capacity:0,database:0,support:0,model:0}};
await writeFile(`${E}/GUIDE_COMPLETION_FIX42-completion-control-proof.json`,`${JSON.stringify(proof,null,2)}\n`,{flag:"wx",mode:0o600});await writeFile(`${ROOT}/logs/GUIDE_COMPLETION_FIX42-completion-controls.log`,`${JSON.stringify({verdict:"PASS",passed:proof.passed},null,2)}\n`,{flag:"wx",mode:0o600});process.stdout.write(`${JSON.stringify({passed:proof.passed})}\n`);
