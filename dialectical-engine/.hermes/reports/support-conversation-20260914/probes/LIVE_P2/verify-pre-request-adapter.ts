import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";

import "./verify-diagnostic-consumer.mjs";
import { consumeSupportDiagnosticWindow } from "./diagnostic-consumer.mjs";
import { createLiveP2SnapshotAdapter } from "./pre-request-adapter.js";

const productRoot = "/Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine/.worktrees/support-conversation-cp1/dialectical-engine";
const evidenceRoot = "/Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine/.hermes/reports/support-conversation-20260914";
const attestationReceiptPath = `${evidenceRoot}/evidence/ATTEST_P2-snapshot-receipt.json`;
const attestationReceiptSha256 = "cfdaf33e1fc4e5e303d00764be509829e6631e36a60aece79813b6fb42163de2";
const productRevision = "606b2eabea1dc9212159e53c193cf69655424e77";
const kbVersion = "d674533e89d145bf9203248e2e324b451e57a2f1d3f257614d31678b7ac379df";
const sha256 = (value: string | Buffer) => createHash("sha256").update(value).digest("hex");

const frozenProbeHashes = {
  "diagnostic-consumer.mjs":"6f60ecfca6622517a032be204773c572584dd48b949ffe0eccdf2e399cb91db5",
  "response-evidence.mjs":"4c26d1b9125703db664959ad4b8395eee7c5a171ea79dc3df744ba5f3ffcf182",
  "verify-diagnostic-consumer.mjs":"d1c805399b178d819fa1f1eb385b2de03fb60c3283f57ef6cc1c2109b0116dc2"
};
for (const [name,expected] of Object.entries(frozenProbeHashes)) {
  assert.equal(sha256(readFileSync(`${evidenceRoot}/probes/LIVE_P2/${name}`)),expected,name);
}

const adapter = createLiveP2SnapshotAdapter({
  productRoot,attestationReceiptPath,attestationReceiptSha256,productRevision
});
assert.equal(adapter.kbVersion,kbVersion);
assert.throws(() => createLiveP2SnapshotAdapter({
  productRoot,attestationReceiptPath,
  attestationReceiptSha256:"0000000000000000000000000000000000000000000000000000000000000000",
  productRevision
}),/LIVE_P2_ATTESTATION_RECEIPT_HASH_MISMATCH/u);
assert.throws(() => createLiveP2SnapshotAdapter({
  productRoot,attestationReceiptPath,attestationReceiptSha256,
  productRevision:"0000000000000000000000000000000000000000"
}),/LIVE_P2_ATTESTATION_RECEIPT_INVALID/u);
assert.throws(() => createLiveP2SnapshotAdapter({
  productRoot:`${productRoot}/wrong`,attestationReceiptPath,attestationReceiptSha256,productRevision
}),/LIVE_P2_ATTESTED_FILE_MISMATCH/u);

const cases = [
  { sequence:1,language:"en" as const,topic:"creation" as const,message:"How do I create a debate?",
    source:"getting-started-debate",fallbackSha256:"c844161c3430edcfb0a195df7ffff6bcf82c0826ab454bf817631933649bed48" },
  { sequence:2,language:"en" as const,topic:"settings" as const,message:"What can I change in Settings?",
    source:"account-settings",fallbackSha256:"6d99d7eeb445525b3bf3cf55f4283ee24fec536ff4f9ccc3a3b1f928904091bf" },
  { sequence:3,language:"en" as const,topic:"export" as const,message:"How does JSON export work?",
    source:"guide-how-it-works",fallbackSha256:"c1ed3a89b00d46ac7f1710280ef768f9d66adec20d20aaa18815596e6a5c2265" },
  { sequence:4,language:"ro" as const,topic:"creation" as const,message:"Cum creez o dezbatere?",
    source:"getting-started-debate",fallbackSha256:"ef982f6420391eeaaf23c475afb230fcee91afc2183c4b945403283802d09e8a" },
  { sequence:5,language:"ro" as const,topic:"settings" as const,message:"Ce pot schimba în Setări?",
    source:"account-settings",fallbackSha256:"1b7be7bebd1932a4630bea3df60d016218ecedca1ef538ac14510ef66d5f2aad" },
  { sequence:6,language:"ro" as const,topic:"export" as const,message:"Cum funcționează exportul JSON?",
    source:"guide-how-it-works",fallbackSha256:"cb344a791adc4616c177c993b4f186595725f6ea3de8b1f95fcd8a6f0ff07ed8" },
  { sequence:7,language:"ro" as const,topic:"creation" as const,message:"Cum creez o dezbatere?",
    source:"getting-started-debate",fallbackSha256:"ef982f6420391eeaaf23c475afb230fcee91afc2183c4b945403283802d09e8a" }
];
const pins = cases.map((item) => {
  const pin = adapter.pin({
    sessionKbVersion:kbVersion,language:item.language,message:item.message
  });
  const safe = pin.safeReceipt(item.sequence,item.topic);
  assert.deepEqual(safe,{
    sequence:item.sequence,language:item.language,topic:item.topic,kbVersion,
    pinnedSourceId:item.source,fallbackSha256:item.fallbackSha256
  });
  return { item,pin,safe };
});
assert.throws(() => adapter.pin({
  sessionKbVersion:"0000000000000000000000000000000000000000000000000000000000000000",
  language:"en",message:"How do I create a debate?"
}),/LIVE_P2_SESSION_SNAPSHOT_MISMATCH/u);
assert.throws(() => adapter.pin({
  sessionKbVersion:kbVersion,language:"xx" as "en",message:"How do I create a debate?"
}),/LIVE_P2_LANGUAGE_INVALID/u);
assert.throws(() => adapter.pin({
  sessionKbVersion:kbVersion,language:"en",message:"qzxwv unmatched"
}),/LIVE_P2_TOP_SOURCE_UNAVAILABLE/u);

const components = JSON.parse(readFileSync(`${productRoot}/packages/support-kb/recovery/components.json`,"utf8"));
const first = pins[0];
const fallback = components.components.find((row: { id:string;lang:string }) =>
  row.id === first.safe.pinnedSourceId && row.lang === first.safe.language)?.fallback;
assert.equal(typeof fallback,"string");
assert.equal(sha256(fallback),first.safe.fallbackSha256);
const exactRecoveryEvidence = first.pin.classifyResponse({
  outcome:"ANSWER_GROUNDED",text:fallback,sourceIds:[first.safe.pinnedSourceId]
});
assert.deepEqual(exactRecoveryEvidence,{ terminal:"GROUNDED",reviewedFallbackMatch:true });
assert.deepEqual(first.pin.classifyResponse({
  outcome:"ANSWER_GROUNDED",text:"different",sourceIds:[first.safe.pinnedSourceId]
}),{ terminal:"GROUNDED",reviewedFallbackMatch:false });
assert.deepEqual(first.pin.classifyResponse({
  outcome:"ANSWER_GROUNDED",text:fallback,sourceIds:["wrong-source"]
}),{ terminal:"GROUNDED",reviewedFallbackMatch:false });
assert.deepEqual(first.pin.classifyResponse({
  outcome:"ANSWER_GROUNDED",text:fallback,sourceIds:[first.safe.pinnedSourceId,"wrong-source"]
}),{ terminal:"GROUNDED",reviewedFallbackMatch:false });
assert.deepEqual(first.pin.classifyResponse({
  outcome:"REFUSE_SAFETY",text:"Fixed refusal.",sourceIds:[]
}),{ terminal:"REFUSAL",reviewedFallbackMatch:false });
assert.deepEqual(first.pin.classifyResponse({
  outcome:"ANSWER_GROUNDED",text:fallback,sourceIds:[first.safe.pinnedSourceId],extra:"raw"
} as never),{ terminal:"INCOMPATIBLE",reviewedFallbackMatch:false });

const diagnostic = `{
  code: 'SUPPORT_DRAFT_JSON_INVALID',
  attemptId: '30000000-0000-4000-8000-000000000003',
  predicate: 'JSON_SYNTAX',
  jsonValid: false,
  fenced: false,
  exactKeys: false,
  kindValid: false,
  textCodePoints: null,
  sourceIdCount: 0,
  allowedSourceIdCount: 3,
  actionIdCount: 0,
  allowedActionIdCount: 1,
}
`;
const bytes = Buffer.from(diagnostic);
const consume = (responseEvidence: ReturnType<typeof first.pin.classifyResponse>,end = bytes.length) =>
  consumeSupportDiagnosticWindow(bytes,{
    cursorStart:0,cursorEnd:end,seenAttemptIds:new Set(),responseEvidence
  });
const recovered = consume(exactRecoveryEvidence);
assert.equal(recovered.status,"ATTRIBUTED_RECOVERY");
assert.deepEqual(Object.keys(recovered.record),[
  "attemptId","code","predicate","hasSources","hasActions","sourceCount","actionCount"
]);
assert.equal(consume(first.pin.classifyResponse({
  outcome:"REFUSE_SAFETY",text:"Fixed refusal.",sourceIds:[]
})).status,"ATTRIBUTED_REFUSAL");
assert.equal(consume(exactRecoveryEvidence,0).status,"ACCEPTED_DRAFT");
assert.equal(consume(first.pin.classifyResponse({
  outcome:"ANSWER_GROUNDED",text:"different",sourceIds:[first.safe.pinnedSourceId]
})).status,"AMBIGUOUS");

const safeSerialized = JSON.stringify({
  pins:pins.map(({ safe }) => safe),
  evidence:exactRecoveryEvidence,
  diagnostic:recovered
});
for (const forbidden of [
  fallback,"How do I create a debate?","Cum creez o dezbatere?","Fixed refusal.",
  "different","wrong-source","private completion","http://","https://"
]) {
  assert.equal(safeSerialized.includes(forbidden),false);
}

process.stdout.write(JSON.stringify({
  adapterProperties:20,
  canonicalPins:7,
  harnessControls:27,
  totalControls:54,
  attestedInputs:6,
  kbVersion,
  exactProducerKeys:7,
  exactFallbackRecovery:true,
  coincidentalFallbackNoEventAcceptedDraft:true,
  mismatchAmbiguous:true,
  staleAndHashMismatchFailClosed:true,
  rawValuesExcluded:true
}) + "\n");
