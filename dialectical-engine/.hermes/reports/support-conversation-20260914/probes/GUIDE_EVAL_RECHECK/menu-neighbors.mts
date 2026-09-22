import { readFileSync,realpathSync,writeFileSync } from "node:fs";
import { createHash } from "node:crypto";

import {
  GUIDE_MATRIX,validateGuideMatrix,
} from "/Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine/.hermes/reports/support-conversation-20260914/probes/GUIDE_HARNESS/matrix.mjs";
import {
  SUPPORT_ACTION_IDS,SUPPORT_CAPABILITIES,
} from "/Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine/.worktrees/support-cp1-p3-correctness/dialectical-engine/packages/support-kb/src/catalog.ts";
import {
  buildSupportKnowledgeContext,
} from "/Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine/.worktrees/support-cp1-p3-correctness/dialectical-engine/packages/support-kb/src/context.ts";
import {
  loadHelpCorpus,
} from "/Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine/.worktrees/support-cp1-p3-correctness/dialectical-engine/packages/support-kb/src/index.ts";

const root = "/Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine/.worktrees/support-cp1-p3-correctness/dialectical-engine";
const output = "/Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine/.hermes/reports/support-conversation-20260914/probes/GUIDE_EVAL_RECHECK/menu-neighbors.json";
const paths = [
  `${root}/packages/support-kb/src/catalog.ts`,
  `${root}/packages/support-kb/src/context.ts`,
  `${root}/packages/support-kb/src/index.ts`,
  `${root}/packages/support-kb/reviews/manifest.json`,
  `${root}/packages/support-kb/recovery/components.json`,
];

function sha256(path: string): string {
  return createHash("sha256").update(readFileSync(path)).digest("hex");
}

validateGuideMatrix(GUIDE_MATRIX);
const corpus = loadHelpCorpus(`${root}/packages/support-kb/content`,{
  reviewManifest:JSON.parse(readFileSync(`${root}/packages/support-kb/reviews/manifest.json`,"utf8")),
  recoveryComponents:readFileSync(`${root}/packages/support-kb/recovery/components.json`),
  requireReviewedRecovery:true,
});
const rows = GUIDE_MATRIX.filter((row) => row.kind === "GUIDE_FAMILY");
const results = rows.map((row,index) => {
  const result = buildSupportKnowledgeContext({
    entries:corpus.entries,capabilities:SUPPORT_CAPABILITIES,
    availableActionIds:SUPPORT_ACTION_IDS,language:row.language,query:row.prompt,
    historyText:"",maxCodePoints:24_000,
    referenceFor:(kind,offset) => `${kind === "source" ? "s" : "a"}-30000000000040008000000000000003-${index+offset+1}`,
  });
  const missing = row.expectedSourceIds.filter((id) => !result.sourceIds.includes(id));
  return { sequence:row.sequence,family:row.family,mode:row.mode,language:row.language,
    expectedSourceIds:row.expectedSourceIds,sourceIds:result.sourceIds,missing };
});
const failed = results.filter((row) => row.missing.length > 0);
const receipt = {
  kbVersion:corpus.kbVersion,rows:rows.length,passed:rows.length-failed.length,failed,
  custody:paths.map((path) => ({ path:realpathSync(path),sha256:sha256(path) })),
};
writeFileSync(output,`${JSON.stringify(receipt,null,2)}\n`);
console.log(JSON.stringify(receipt));
if (failed.length > 0) process.exitCode = 1;
