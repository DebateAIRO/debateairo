import assert from "node:assert/strict";
import { consumeSupportDiagnosticWindow } from "./diagnostic-consumer.mjs";

const id = "10000000-0000-4000-8000-000000000001";
function record(overrides = {},extra = "") {
  const row = {
    code:"SUPPORT_DRAFT_JSON_INVALID",attemptId:id,predicate:"JSON_SYNTAX",
    jsonValid:false,fenced:false,exactKeys:false,kindValid:false,textCodePoints:null,
    sourceIdCount:0,allowedSourceIdCount:3,actionIdCount:0,allowedActionIdCount:1,
    ...overrides
  };
  const lines = Object.entries(row).map(([key,value]) =>
    `  ${key}: ${typeof value === "string" ? `'${value}'` : String(value)},`);
  if (extra.length > 0) lines.push(`  hostile: '${extra}',`);
  return `{\n${lines.join("\n")}\n}\n`;
}
function consume(text,seen = new Set(),expectedRejection = true) {
  const bytes = Buffer.from(text);
  return consumeSupportDiagnosticWindow(bytes,{
    cursorStart:0,cursorEnd:bytes.length,seenAttemptIds:seen,expectedRejection
  });
}

const seen = new Set();
const accepted = consume(record(),seen);
assert.equal(accepted.status,"ATTRIBUTED");
assert.equal(accepted.record.attemptId,id);
assert.deepEqual(Object.keys(accepted.record),[
  "attemptId","code","predicate","hasSources","hasActions","sourceCount","actionCount"
]);
assert.deepEqual(accepted.record,{
  attemptId:id,code:"SUPPORT_DRAFT_JSON_INVALID",predicate:"JSON_SYNTAX",
  hasSources:false,hasActions:false,sourceCount:0,actionCount:0
});
assert.equal(consume("ordinary log line\n",new Set(),false).status,"NO_REJECTION_EVENT");
const hostile = "private completion https://example.invalid/?token=raw getting-started-debate";
assert.equal(consume(record({},hostile)).status,"AMBIGUOUS");
assert.equal(consume(record({ attemptId:"invalid" })).status,"AMBIGUOUS");
assert.equal(consume(record({ code:"SUPPORT_DRAFT_UNKNOWN" })).status,"AMBIGUOUS");
assert.equal(consume(record({ predicate:"UNKNOWN" })).status,"AMBIGUOUS");
assert.equal(consume("{\n  code: 'SUPPORT_DRAFT_JSON_INVALID',\n}\n").status,"AMBIGUOUS");
assert.equal(consume(`${record()}${record({ attemptId:"20000000-0000-4000-8000-000000000002" })}`).status,"AMBIGUOUS");
assert.equal(consume(record(),seen).status,"AMBIGUOUS");
assert.equal(consume(record(),new Set(),false).status,"AMBIGUOUS");
assert.equal(consume("none\n",new Set(),true).status,"AMBIGUOUS");
const serialized = JSON.stringify({ accepted,noEvent:consume("none\n",new Set(),false),hostile:consume(record({},hostile)) });
for (const forbidden of [hostile,"private completion","getting-started-debate","example.invalid","token=raw"]) {
  assert.equal(serialized.includes(forbidden),false);
}
for (const forbiddenKey of ["jsonValid","fenced","exactKeys","kindValid","textCodePoints",
  "sourceIdCount","allowedSourceIdCount","actionIdCount","allowedActionIdCount"]) {
  assert.equal(serialized.includes(forbiddenKey),false);
}
process.stdout.write(JSON.stringify({ controls:12,exactProducerKeys:7,validAttributed:true,noEvent:true,hostileDropped:true,
  invalidUuidAmbiguous:true,unknownCodeAmbiguous:true,unknownPredicateAmbiguous:true,
  malformedAmbiguous:true,multipleAmbiguous:true,duplicateAmbiguous:true,
  unmatchedEventAmbiguous:true,missingOrDelayedEventAmbiguous:true }) + "\n");
