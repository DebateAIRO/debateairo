import { readFileSync,writeFileSync } from 'node:fs';
import { GUIDE_MATRIX,validateGuideMatrix } from '/Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine/.hermes/reports/support-conversation-20260914/probes/GUIDE_HARNESS/matrix.mjs';
import { SUPPORT_ACTION_IDS,SUPPORT_CAPABILITIES } from '/Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine/.worktrees/support-conversation-cp1/dialectical-engine/packages/support-kb/src/catalog.ts';
import { buildSupportKnowledgeContext } from '/Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine/.worktrees/support-conversation-cp1/dialectical-engine/packages/support-kb/src/context.ts';
import { loadHelpCorpus } from '/Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine/.worktrees/support-conversation-cp1/dialectical-engine/packages/support-kb/src/index.ts';
const root='/Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine/.worktrees/support-conversation-cp1/dialectical-engine';
const output='/Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine/.hermes/reports/support-conversation-20260914/probes/GUIDE_EVAL_FIX/menu-neighbors.json';
validateGuideMatrix(GUIDE_MATRIX);
const corpus=loadHelpCorpus(`${root}/packages/support-kb/content`,{
  reviewManifest:JSON.parse(readFileSync(`${root}/packages/support-kb/reviews/manifest.json`,'utf8')),
  recoveryComponents:readFileSync(`${root}/packages/support-kb/recovery/components.json`),
  requireReviewedRecovery:true
});
const rows=GUIDE_MATRIX.filter(row=>row.kind==='GUIDE_FAMILY');
const results=rows.map((row,index)=>{
  const result=buildSupportKnowledgeContext({
    entries:corpus.entries,capabilities:SUPPORT_CAPABILITIES,
    availableActionIds:SUPPORT_ACTION_IDS,language:row.language,query:row.prompt,
    historyText:'',maxCodePoints:24_000,
    referenceFor:(kind,offset)=>`${kind==='source'?'s':'a'}-20000000000040008000000000000002-${index+offset+1}`
  });
  const missing=row.expectedSourceIds.filter(id=>!result.sourceIds.includes(id));
  return {sequence:row.sequence,family:row.family,mode:row.mode,language:row.language,expectedSourceIds:row.expectedSourceIds,sourceIds:result.sourceIds,missing};
});
const failed=results.filter(row=>row.missing.length>0);
const receipt={kbVersion:corpus.kbVersion,rows:rows.length,passed:rows.length-failed.length,failed};
writeFileSync(output,`${JSON.stringify(receipt,null,2)}\n`);
console.log(JSON.stringify(receipt));
if(failed.length>0)process.exitCode=1;
