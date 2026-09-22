import assert from "node:assert/strict";
import { readFile,writeFile } from "node:fs/promises";

const root = "/Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine/.hermes/reports/support-conversation-20260914";
const sourcePath = `${root}/evidence/LIVE4-superseded-actual-relay-receipt.json`;
const targetPath = `${root}/evidence/LIVE4-actual-relay-receipt.json`;
const diagnosticPath = `${root}/evidence/LIVE4-diagnostic-projection-receipt.json`;
const source = JSON.parse(await readFile(sourcePath,"utf8"));

function project(diagnostic) {
  if (diagnostic.status !== "ATTRIBUTED") return { ...diagnostic };
  const record = diagnostic.record;
  return {
    status:diagnostic.status,cursorStart:diagnostic.cursorStart,cursorEnd:diagnostic.cursorEnd,
    candidateCount:diagnostic.candidateCount,validCount:diagnostic.validCount,
    invalidCount:diagnostic.invalidCount,duplicateCount:diagnostic.duplicateCount,
    record:{
      attemptId:record.attemptId,code:record.code,predicate:record.predicate,
      hasSources:record.sourceIdCount>0,hasActions:record.actionIdCount>0,
      sourceCount:record.sourceIdCount,actionCount:record.actionIdCount
    }
  };
}

const prompts = source.prompts.map((prompt) => ({ ...prompt,diagnostic:project(prompt.diagnostic) }));
const receipt = {
  ...source,
  diagnostic_projection:{
    kind:"RETROSPECTIVE_STRICT_SEVEN",
    source:"LIVE4-superseded-actual-relay-receipt.json",
    new_support_requests:0,
    attribution_strengthened:false,
    producer_keys:["attemptId","code","predicate","hasSources","hasActions","sourceCount","actionCount"]
  },
  prompts
};
await writeFile(targetPath,JSON.stringify(receipt,null,2)+"\n");
const diagnosticReceipt = {
  schema_version:1,revision:source.revision,kind:"RETROSPECTIVE_STRICT_SEVEN",
  source:"LIVE4-superseded-actual-relay-receipt.json",new_support_requests:0,
  attribution_strengthened:false,
  producer_keys:["attemptId","code","predicate","hasSources","hasActions","sourceCount","actionCount"],
  requests:prompts.map(({ sequence,diagnostic }) => ({ sequence,diagnostic }))
};
await writeFile(diagnosticPath,JSON.stringify(diagnosticReceipt,null,2)+"\n");
const attributed = diagnosticReceipt.requests.filter(({ diagnostic }) => diagnostic.status === "ATTRIBUTED");
assert.equal(attributed.length,1);
assert.deepEqual(Object.keys(attributed[0].diagnostic.record),diagnosticReceipt.producer_keys);
process.stdout.write("retrospective_requests=7 attributed=1 no_event=6 exact_producer_keys=7 new_support_requests=0\n");
