import assert from "node:assert/strict";
import { mkdtemp,readFile,rm,writeFile } from "node:fs/promises";
import { join } from "node:path";
import { createComposedManifest } from "./composition.mjs";
import { recordSessionCreationTime,validateRemainingSessionCreationTimes } from "./session-times.mjs";
const ROOT="/Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine/.hermes/reports/support-conversation-20260914";
const E=`${ROOT}/evidence`,P=`${ROOT}/probes/GUIDE_SESSION_TIMES_FIX41`;
const contract=JSON.parse(await readFile(`${E}/GUIDE_CONTINUATION_BIND40-composition-contract.json`,"utf8"));
const controls=[];const pass=name=>controls.push(name);
const times=[];for(const value of ["2026-09-21T12:00:00.000Z","2026-09-21T12:00:31.000Z","2026-09-21T12:01:02.000Z"])recordSessionCreationTime(times,value);
assert.deepEqual(validateRemainingSessionCreationTimes(times),times);pass("actual producer records exactly three identifier-free ordered timestamps");
assert.throws(()=>recordSessionCreationTime(times,"2026-09-21T12:01:33.000Z"),/GUIDE_CONTINUATION_SESSION_TIMES_INVALID/u);pass("actual producer rejects fourth timestamp");
const dir=await mkdtemp(`${P}/fixture-`);
const receiptBase={completed:true,finalCommit:contract.productRevision,kbVersion:contract.kbVersion,
  freshRows:contract.remainingSequences.map(sequence=>({sequence})),sessionCreationTimesUtc:times};
async function compose(label,sessionCreationTimesUtc,shouldPass){
  const receipt=join(dir,`${label}-receipt.json`),output=join(dir,`${label}-manifest.json`);
  await writeFile(receipt,`${JSON.stringify({...receiptBase,sessionCreationTimesUtc},null,2)}\n`);
  let error=null;try{await createComposedManifest({contract,remainingReceiptPath:receipt,outputPath:output});}catch(value){error=value;}
  if(shouldPass){assert.equal(error,null);const manifest=JSON.parse(await readFile(output,"utf8"));assert.equal(manifest.sessionTimesUtc.length,5);assert.deepEqual(manifest.sessionTimesUtc.map(x=>x.ordinal),[1,2,3,4,5]);}
  else {assert.match(error?.message??"",/GUIDE_CONTINUATION_SESSION_TIMES_INVALID|GUIDE_CONTINUATION_REMAINING_SEGMENT_INVALID/u);}
}
try{
 await compose("three",times,true);pass("actual composer accepts exact three and emits five total ordinals");
 await compose("two",times.slice(0,2),false);pass("actual composer rejects two");
 await compose("four",[...times,{ordinal:4,observedAtUtc:"2026-09-21T12:01:33.000Z"}],false);pass("actual composer rejects four");
 await compose("malformed",[{ordinal:1,observedAtUtc:"not-a-time"},times[1],times[2]],false);pass("actual composer rejects malformed");
 await compose("order",[times[0],{ordinal:2,observedAtUtc:"2026-09-21T11:59:59.000Z"},times[2]],false);pass("actual composer rejects out of order");
 await compose("ordinal",[times[0],{ordinal:3,observedAtUtc:times[1].observedAtUtc},{ordinal:2,observedAtUtc:times[2].observedAtUtc}],false);pass("actual composer rejects incorrect ordinals");
}finally{await rm(dir,{recursive:true,force:true});}
const proof={schemaVersion:1,node:"GUIDE_SESSION_TIMES_FIX41",revision:contract.productRevision,verdict:"PASS",controls:controls.length+1,passed:controls.length+1,names:[...controls,"proof serialized"],traffic:{runtime:0,browser:0,http:0,status:0,capacity:0,database:0,support:0,model:0},privateValuesPersisted:false};
await writeFile(`${E}/GUIDE_SESSION_TIMES_FIX41-session-control-proof.json`,`${JSON.stringify(proof,null,2)}\n`,{flag:"wx",mode:0o600});
await writeFile(`${ROOT}/logs/GUIDE_SESSION_TIMES_FIX41-session-controls.log`,`${JSON.stringify({verdict:"PASS",passed:proof.passed},null,2)}\n`,{flag:"wx",mode:0o600});
process.stdout.write(`${JSON.stringify({passed:proof.passed})}\n`);
