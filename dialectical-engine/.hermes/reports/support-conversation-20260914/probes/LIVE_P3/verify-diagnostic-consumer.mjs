import assert from "node:assert/strict";
import { consumeSupportDiagnosticWindow } from "./diagnostic-consumer.mjs";
import { classifySupportResponseEvidence } from "./response-evidence.mjs";

const id = "10000000-0000-4000-8000-000000000001";
const secondId = "20000000-0000-4000-8000-000000000002";

function record(overrides = {}, extra = "") {
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

const snapshot = Object.freeze({
  requestVersion:"snapshot-v1",
  pinnedVersion:"snapshot-v1",
  pinnedSourceId:"source-one",
  reviewedFallback:Object.freeze({
    version:"snapshot-v1",sourceId:"source-one",text:"Reviewed fallback."
  })
});
const recoveryEvidence = classifySupportResponseEvidence({
  outcome:"ANSWER_GROUNDED",text:"Reviewed fallback.",sourceIds:["source-one"]
},snapshot);
const acceptedEvidence = classifySupportResponseEvidence({
  outcome:"ANSWER_GROUNDED",text:"A screened model answer.",sourceIds:["source-one"]
},snapshot);
const refusalEvidence = classifySupportResponseEvidence({
  outcome:"REFUSE_SAFETY",text:"Fixed refusal.",sourceIds:[]
},snapshot);
const incompatibleEvidence = classifySupportResponseEvidence({
  outcome:"DEGRADED",text:"Unavailable.",sourceIds:[]
},snapshot);

function consume(text,responseEvidence,seen = new Set(),cursorStart = 0,cursorEnd = Buffer.byteLength(text)) {
  const bytes = Buffer.from(text);
  return consumeSupportDiagnosticWindow(bytes,{ cursorStart,cursorEnd,seenAttemptIds:seen,responseEvidence });
}

// Response-evidence properties: only fixed terminal state and one boolean leave this boundary.
assert.deepEqual(recoveryEvidence,{ terminal:"GROUNDED",reviewedFallbackMatch:true });
assert.deepEqual(acceptedEvidence,{ terminal:"GROUNDED",reviewedFallbackMatch:false });
assert.deepEqual(refusalEvidence,{ terminal:"REFUSAL",reviewedFallbackMatch:false });
assert.deepEqual(incompatibleEvidence,{ terminal:"INCOMPATIBLE",reviewedFallbackMatch:false });
assert.equal(classifySupportResponseEvidence({
  outcome:"ANSWER_GROUNDED",text:"changed",sourceIds:["source-one"]
},snapshot).reviewedFallbackMatch,false);
assert.equal(classifySupportResponseEvidence({
  outcome:"ANSWER_GROUNDED",text:"Reviewed fallback.",sourceIds:["source-two"]
},snapshot).reviewedFallbackMatch,false);
assert.equal(classifySupportResponseEvidence({
  outcome:"ANSWER_GROUNDED",text:"Reviewed fallback.",sourceIds:["source-one"]
},{ ...snapshot,requestVersion:"snapshot-v2" }).reviewedFallbackMatch,false);
assert.equal(classifySupportResponseEvidence({
  outcome:"ANSWER_GROUNDED",text:"Reviewed fallback.",sourceIds:["source-one"],hostile:"raw-value"
},snapshot).terminal,"INCOMPATIBLE");
assert.equal(classifySupportResponseEvidence({
  outcome:"ANSWER_GROUNDED",text:"Reviewed fallback.",sourceIds:["source-one"]
},{ ...snapshot,reviewedFallback:{ ...snapshot.reviewedFallback,hostile:"raw-value" } }).terminal,"INCOMPATIBLE");

// Transition fixtures.
const recovery = consume(record(),recoveryEvidence);
assert.equal(recovery.status,"ATTRIBUTED_RECOVERY");
assert.deepEqual(Object.keys(recovery.record),[
  "attemptId","code","predicate","hasSources","hasActions","sourceCount","actionCount"
]);
assert.deepEqual(recovery.record,{
  attemptId:id,code:"SUPPORT_DRAFT_JSON_INVALID",predicate:"JSON_SYNTAX",
  hasSources:false,hasActions:false,sourceCount:0,actionCount:0
});
assert.equal(consume(record(),refusalEvidence).status,"ATTRIBUTED_REFUSAL");
assert.equal(consume("ordinary log line\n",acceptedEvidence).status,"ACCEPTED_DRAFT");
assert.equal(consume("ordinary log line\n",recoveryEvidence).status,"ACCEPTED_DRAFT");
assert.equal(consume(record(),acceptedEvidence).status,"AMBIGUOUS");
assert.equal(consume(record(),incompatibleEvidence).status,"AMBIGUOUS");
assert.equal(consume("ordinary log line\n",refusalEvidence).status,"AMBIGUOUS");

// Existing privacy and ambiguity controls.
const hostile = "private completion https://example.invalid/?token=raw source-one";
const hostileResult = consume(record({},hostile),refusalEvidence);
assert.equal(hostileResult.status,"AMBIGUOUS");
assert.equal(consume(record({ attemptId:"invalid" }),refusalEvidence).status,"AMBIGUOUS");
assert.equal(consume(record({ code:"SUPPORT_DRAFT_UNKNOWN" }),refusalEvidence).status,"AMBIGUOUS");
assert.equal(consume(record({ predicate:"UNKNOWN" }),refusalEvidence).status,"AMBIGUOUS");
assert.equal(consume("{\n  code: 'SUPPORT_DRAFT_JSON_INVALID',\n}\n",refusalEvidence).status,"AMBIGUOUS");
assert.equal(consume(`${record()}${record({ attemptId:secondId })}`,refusalEvidence).status,"AMBIGUOUS");
const seen = new Set([id]);
assert.equal(consume(record(),refusalEvidence,seen).status,"AMBIGUOUS");
assert.equal(consume(record(),recoveryEvidence,new Set([id])).status,"AMBIGUOUS");
const outside = `prefix\n${record()}`;
assert.equal(consume(outside,refusalEvidence,new Set(),0,7).status,"AMBIGUOUS");
assert.equal(consume(record(),{ terminal:"UNKNOWN",reviewedFallbackMatch:false }).status,"AMBIGUOUS");
assert.equal(consume(record(),{ ...recoveryEvidence,hostile:"raw-value" }).status,"AMBIGUOUS");

const serialized = JSON.stringify({
  recovery,refusal:consume(record({ attemptId:secondId }),refusalEvidence),
  accepted:consume("none\n",acceptedEvidence),hostile:hostileResult,
  responseEvidence:[recoveryEvidence,acceptedEvidence,refusalEvidence,incompatibleEvidence]
});
for (const forbidden of [hostile,"private completion","source-one","snapshot-v1",
  "Reviewed fallback.","A screened model answer.","Fixed refusal.","example.invalid","token=raw"]) {
  assert.equal(serialized.includes(forbidden),false);
}
for (const forbiddenKey of ["jsonValid","fenced","exactKeys","kindValid","textCodePoints",
  "sourceIdCount","allowedSourceIdCount","actionIdCount","allowedActionIdCount"]) {
  assert.equal(serialized.includes(forbiddenKey),false);
}

process.stdout.write(JSON.stringify({
  responseEvidenceProperties:9,
  transitionAndAmbiguityFixtures:18,
  totalControls:27,
  exactProducerKeys:7,
  validRecoveryAttributed:true,
  validRefusalAttributed:true,
  groundedNoEventAcceptedDraft:true,
  recoveryMatchNoEventAcceptedDraft:true,
  mismatchedRecoveryAmbiguous:true,
  incompatibleTerminalAmbiguous:true,
  missingRefusalEventAmbiguous:true,
  hostileDropped:true,
  invalidUuidAmbiguous:true,
  unknownCodeAmbiguous:true,
  unknownPredicateAmbiguous:true,
  malformedAmbiguous:true,
  multipleAmbiguous:true,
  duplicateAmbiguous:true,
  recoveryDuplicateAmbiguous:true,
  delayedOrOutOfWindowAmbiguous:true,
  unknownEvidenceAmbiguous:true,
  extraEvidenceAmbiguous:true
}) + "\n");
