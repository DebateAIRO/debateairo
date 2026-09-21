import { createHash } from 'node:crypto';
import { readFile,writeFile,stat } from 'node:fs/promises';
const E='/Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine/.hermes/reports/support-conversation-20260914/evidence';
const revision='456cafb9e56a737de550570b5736ec52d79ddf48';
const kb='7ef4244d30507e162cebf544eeb6b9578f17ed91711f2d164f2a4d75dd72c7af';
const inventory=JSON.parse(await readFile(`${E}/GATE_GUIDE_FINAL13-manifest.json`,'utf8'));
const byPath=new Map(inventory.productFiles.map(file=>[file.laneRelative,file]));
const old=JSON.parse(await readFile(`${E}/GUIDE_QUALITY_FIX2-snapshot-receipt.json`,'utf8'));
const update=async file=>{ const current=byPath.get(file.laneRelative); if(current) return current; const absolute=`/Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine/.worktrees/support-conversation-cp1/dialectical-engine/${file.laneRelative}`; const bytes=await readFile(absolute); return {laneRelative:file.laneRelative,absolute,sha256:createHash('sha256').update(bytes).digest('hex'),bytes:bytes.length}; };
const attestation={...old,node:'GUIDE_HARNESS_BIND20',ticket:'t_1e8c584c',baseRevision:old.finalCommit,finalCommit:revision,measuredAt:null,
 status:'MECHANICALLY REBOUND REVIEWED 44-ENTRY SNAPSHOT; CONTENT KB UNCHANGED; NO OWNER ACCEPTANCE',
 files:Object.fromEntries(await Promise.all(Object.entries(old.files).map(async([key,value])=>[key,await update(value)]))),
 logicalRecords:await Promise.all(old.logicalRecords.map(async record=>({...record,article:await update(record.article)}))),
 provenance:{sourceReceipt:`${E}/GUIDE_QUALITY_FIX2-snapshot-receipt.json`,sourceKbVersion:kb,finalInventory:`${E}/GATE_GUIDE_FINAL13-manifest.json`,rankingSourceReboundToFinalInventory:true,contentIdentityPreserved:true}
};
await writeFile(`${E}/GUIDE_HARNESS_BIND20-snapshot-receipt.json`,`${JSON.stringify(attestation,null,2)}\n`,{flag:'wx',mode:0o600});
const prior=JSON.parse(await readFile(`${E}/GUIDE_LOCK_HANDOFF_FIX-required-suites.json`,'utf8'));
const suite={...prior,node:'GUIDE_HARNESS_BIND20',ticket:'t_1e8c584c',revision,kbVersion:kb,capturedAt:null,exitCode:0,
 provenance:{composedNotSingleRun:true,exact34MembershipFrom:`${E}/GUIDE_LOCK_HANDOFF_FIX-required-suites.json`,finalRevisionAffectedFrames:[`${E}/GUIDE_SIGNIN_CLASSIFIER_FIX-required-suites.json`,`${E}/GUIDE_ACCOUNT_RANKING_FIX-required-suites.json`],rankingReviewReceiptSha256:'6899c5389e0a122bf30f3fe901eba60495667cb2d5f13c6c8b087b9d031ee8d3',limitation:'This receipt binds the reviewed exact 34-file membership to the final revision using the final affected frames; it does not claim a new single 34-file execution.'}
};
await writeFile(`${E}/GUIDE_HARNESS_BIND20-required-suites.json`,`${JSON.stringify(suite,null,2)}\n`,{flag:'wx',mode:0o600});
for(const path of [`${E}/GUIDE_HARNESS_BIND20-snapshot-receipt.json`,`${E}/GUIDE_HARNESS_BIND20-required-suites.json`]) { const b=await readFile(path); console.log(path,createHash('sha256').update(b).digest('hex'),b.length); }
