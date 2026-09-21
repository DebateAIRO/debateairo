import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import {
  analyzeSupportCredentialText,redactSupportText,supportTextHasUnsafePath
} from "/Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine/.worktrees/support-cp1-p3-security/dialectical-engine/packages/kernel/src/index.ts";
import {
  diagnoseSupportDraft,parseSupportCaseSummaryDraft,parseSupportDraft
} from "/Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine/.worktrees/support-cp1-p3-security/dialectical-engine/apps/api/src/support/response-policy.ts";
import { createSupportAnswerService } from "/Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine/.worktrees/support-cp1-p3-security/dialectical-engine/apps/api/src/support/answer.ts";
import { SupportDegradedState } from "/Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine/.worktrees/support-cp1-p3-security/dialectical-engine/apps/api/src/support/degraded.ts";
import {
  createSupportMessageCipher,type SupportEncryptedMessage
} from "/Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine/.worktrees/support-cp1-p3-security/dialectical-engine/apps/api/src/support/session.ts";
import {
  loadHelpCorpus,type HelpCorpusEntry,type LoadedHelpCorpus
} from "/Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine/.worktrees/support-cp1-p3-security/dialectical-engine/packages/support-kb/src/index.ts";

const PRODUCT = "/Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine/.worktrees/support-cp1-p3-security/dialectical-engine";
const REVISION = "475c5a7e7eb8f48a3f5a81379f37b49fdd014ce9";
const EXPECTED_KB_VERSION = "d674533e89d145bf9203248e2e324b451e57a2f1d3f257614d31678b7ac379df";
const FALLBACK = "Choose Start a debate, then provide the topic and available plan controls.";
const USAGE = Object.freeze({ input_tokens: 17,output_tokens: 9,cost_usd: 0.004 });

function answerRaw(text: string): string {
  return JSON.stringify({ kind:"answer",text,sourceIds:[],actionIds:[] });
}

function summaryRaw(text: string): string {
  return JSON.stringify({ kind:"case_summary",text,sourceIds:[],actionIds:[] });
}

const suppliedValues = [
  {
    text:"Coduri de autentificare sunt jad și opal; păstrează-le private.",
    value:"jad și opal",
    fragments:["jad","opal"]
  },
  {
    text:"Codului de verificare este safir și onix; păstrează-l privat.",
    value:"safir și onix",
    fragments:["safir","onix"]
  },
  {
    text:"My authentication code is cedar, but quartz; please keep it private.",
    value:"cedar, but quartz",
    fragments:["cedar","quartz"]
  }
] as const;

for (const fixture of suppliedValues) {
  const facts = analyzeSupportCredentialText(fixture.text);
  assert.deepEqual(
    facts.credentialValueSpans.map(({ start,end }) => fixture.text.slice(start,end)),
    [fixture.value]
  );
  const redacted = redactSupportText(fixture.text);
  assert.equal(redacted.redacted,true);
  assert.ok(redacted.text.includes("[REDACTED_SECRET_LIKE]"));
  for (const fragment of fixture.fragments) assert.equal(redacted.text.includes(fragment),false);
}

const benignStates = [
  "My password is unavailable; show ordinary recovery guidance.",
  "Parola mea este indisponibilă; arată ghidul obișnuit de recuperare."
] as const;
for (const text of benignStates) {
  assert.deepEqual(analyzeSupportCredentialText(text).credentialValueSpans,[]);
  assert.deepEqual(redactSupportText(text),{ text,redacted:false });
}

const subjectLedControls = [
  ["My password is copper horse and I need help.","copper horse"," and I need help."],
  ["Parola mea este cal albastru și am nevoie de ajutor.","cal albastru"," și am nevoie de ajutor."]
] as const;
for (const [text,value,suffix] of subjectLedControls) {
  const redacted = redactSupportText(text);
  assert.equal(redacted.text,`${text.slice(0,text.indexOf(value))}[REDACTED_SECRET_LIKE]${suffix}`);
}

const romanianCredentialMembers = [
  { kind:"recovery-code",text:"Asistența nu cere cod de recuperare; de asemenea îl poate valida." },
  { kind:"recovery-code",text:"Asistența nu cere codului de recuperare; de asemenea îl poate valida." },
  { kind:"verification-code",text:"Asistența nu cere codurilor de verificare; de asemenea le poate valida." },
  { kind:"security-code",text:"Asistența nu cere aceste coduri de securitate; de asemenea le poate valida." },
  { kind:"authentication-code",text:"Asistența nu cere codul de autentificare; de asemenea îl poate valida." },
  "Asistența nu cere coduri de autentificare; de asemenea le poate valida.",
  { kind:"totp",text:"Asistența nu cere coduri TOTP; de asemenea le poate valida." },
  { kind:"mfa",text:"Asistența nu cere codului MFA; de asemenea îl poate valida." },
  { kind:"otp",text:"Asistența nu cere codurilor OTP; de asemenea le poate valida." }
] as const;
const normalizedRomanianMembers = romanianCredentialMembers.map((member) =>
  typeof member === "string" ? { kind:"authentication-code",text:member } : member);
for (const member of normalizedRomanianMembers) {
  const facts = analyzeSupportCredentialText(member.text);
  assert.ok(facts.credentialTerms.some(({ kind }) => kind === member.kind),member.text);
  assert.ok(facts.operations.some(({ negated }) => !negated),member.text);
}

const unsafeAnswers = [
  ...normalizedRomanianMembers.map(({ text }) => text),
  "Support never requests authentication codes; furthermore it may validate them."
] as const;
const policyFailures: Array<Readonly<{ surface:"answer"|"summary";text:string }>> = [];
for (const text of unsafeAnswers) {
  const raw = answerRaw(text);
  if (parseSupportDraft(raw) !== null) policyFailures.push({ surface:"answer",text });
  assert.equal(diagnoseSupportDraft(raw,[],[]).predicate,"CREDENTIAL_OPERATION",text);
  if (parseSupportCaseSummaryDraft(summaryRaw(text)) !== null) policyFailures.push({ surface:"summary",text });
}

const safeAnswers = [
  "Support never requests authentication codes; furthermore it cannot validate them.",
  "Asistența nu cere coduri de autentificare; de asemenea nu le poate valida.",
  "Asistența nu cere codului de verificare; de asemenea nu îl poate valida.",
  "Codurile de autentificare sunt disponibile numai după conectare.",
  "Asistența poate valida codul poștal și poate schimba numele profilului.",
  "The visitor may validate a public error code and update the display name."
] as const;
for (const text of safeAnswers) {
  assert.notEqual(parseSupportDraft(answerRaw(text)),null,`answer must preserve: ${text}`);
  assert.notEqual(parseSupportCaseSummaryDraft(summaryRaw(text)),null,`summary must preserve: ${text}`);
}
assert.equal(supportTextHasUnsafePath("Codurile de autentificare sunt disponibile numai după conectare."),false);

async function cipherRoundTrip(text: string) {
  const sealed: string[] = [];
  const persisted: string[] = [];
  const transited: string[] = [];
  const cipher = createSupportMessageCipher({
    unwrapDataKey: async () => Buffer.alloc(32,7),
    sealContent: (_aad: unknown,_key: Uint8Array,plaintext: Uint8Array) => {
      sealed.push(Buffer.from(plaintext).toString("utf8"));
      return Buffer.from(plaintext);
    },
    openContent: () => Buffer.alloc(0)
  } as never,{
    readSessionKey: async () => Buffer.from("wrapped"),
    write: async (input: SupportEncryptedMessage) => {
      persisted.push(Buffer.from(input.contentCiphertext).toString("utf8"));
    },
    read: async () => null,
    listSession: async () => []
  });
  const stored = await cipher.writeAndTransit({
    messageId:"41000000-0000-4000-8000-000000000001",
    sessionId:"41000000-0000-4000-8000-000000000002",
    role:"user",text,outcome:"REFUSE_ZONE",language:"en",detectedLanguage:"en",
    overrideLanguage:null,receivedAt:new Date("2026-09-17T08:00:00.000Z"),
    firstTokenAt:null,completedAt:null
  },async (safeText) => { transited.push(safeText); });
  return { sealed,persisted,transited,stored };
}

for (const fixture of suppliedValues) {
  const observed = await cipherRoundTrip(fixture.text);
  for (const sink of [...observed.sealed,...observed.persisted,...observed.transited,observed.stored.text]) {
    for (const fragment of fixture.fragments) assert.equal(sink.includes(fragment),false);
    assert.ok(sink.includes("[REDACTED_SECRET_LIKE]"));
  }
}
for (const text of benignStates) {
  const observed = await cipherRoundTrip(text);
  assert.deepEqual([...observed.sealed,...observed.persisted,...observed.transited,observed.stored.text],[text,text,text,text]);
  assert.equal(observed.stored.redacted,false);
}

function fixtureSnapshot(): LoadedHelpCorpus {
  const entry = Object.freeze({
    id:"getting-started-debate",lang:"en" as const,title:"Start a debate",
    status:"shipped" as const,sources:Object.freeze(["review-probe"]),
    verifiedAgainst:REVISION,ratifiedBy:"V" as const,ratifiedOn:"2026-09-17",
    body:"The visitor can start a debate using the reviewed creation flow.",
    modelProjection:"A visitor can choose Start a debate, then provide a topic and plan controls.",
    fallback:FALLBACK
  }) satisfies HelpCorpusEntry;
  return Object.freeze({ entries:Object.freeze([entry]),kbVersion:"c".repeat(64) }) as LoadedHelpCorpus;
}

function outputReferences(system: string) {
  const source = /sourceIds=([^,\n]+)/u.exec(system)?.[1];
  assert.ok(source && source !== "none");
  return { source };
}

async function answerServiceControl(hostile: string,expectedPredicate: string | null,expectedRejected = true) {
  const snapshot = fixtureSnapshot();
  const sealed: string[] = [];
  const persisted: string[] = [];
  const modelInputs: string[] = [];
  const diagnostics: Array<Readonly<Record<string,unknown>>> = [];
  let modelCalls = 0;
  const messages = createSupportMessageCipher({
    unwrapDataKey: async () => Buffer.alloc(32,9),
    sealContent: (_aad: unknown,_key: Uint8Array,plaintext: Uint8Array) => {
      sealed.push(Buffer.from(plaintext).toString("utf8"));
      return Buffer.from(plaintext);
    },
    openContent: () => Buffer.alloc(0)
  } as never,{
    readSessionKey: async () => Buffer.from("wrapped"),
    write: async (input: SupportEncryptedMessage) => {
      persisted.push(Buffer.from(input.contentCiphertext).toString("utf8"));
    },
    read: async () => null,
    listSession: async () => []
  });
  const degraded = new SupportDegradedState();
  const base = Date.parse("2026-09-17T08:00:00.000Z");
  degraded.markUnavailable(new Date(base),"relay");
  const service = createSupportAnswerService({
    entries:snapshot.entries,
    snapshots:{ currentVersion:snapshot.kbVersion,get:(version) => version === snapshot.kbVersion ? snapshot : undefined },
    messages,degraded,
    reportDraftDiagnostic:(diagnostic) => diagnostics.push(diagnostic as unknown as Readonly<Record<string,unknown>>),
    modelFor:() => ({ complete:async (request: Readonly<{
      system:string;messages:readonly Readonly<{ content:string }>[];
    }>) => {
      modelCalls += 1;
      modelInputs.push(request.messages[0]!.content);
      const { source } = outputReferences(request.system);
      return Object.freeze({
        text:JSON.stringify({ kind:"answer",text:hostile,sourceIds:[source],actionIds:[] }),
        usage:USAGE
      });
    } }) as never,
    clock:(() => { let now = base + 1_001; return () => new Date(++now); })()
  });
  const supplied = "How do I start my first debate? Coduri de autentificare sunt jad și opal; păstrează-le private.";
  const result = await service.respond({
    sessionId:"42000000-0000-4000-8000-000000000001",text:supplied,
    language:"en",detectedLanguage:"en",overrideLanguage:null,modelRef:"inert-review-probe",
    kbVersion:snapshot.kbVersion,snapshot,signedIn:false,
    receivedAt:new Date(base + 1_001)
  });
  assert.equal(modelCalls,1);
  assert.equal(result.outcome,"ANSWER_GROUNDED");
  const rejected = result.text === FALLBACK;
  assert.deepEqual(result.sources,[{ id:"getting-started-debate",label:"Start a debate" }]);
  assert.deepEqual(
    result.actions,
    rejected ? [{ id:"start-debate",label:"Start a debate",href:"/login?next=%2Fnew" }] : []
  );
  assert.deepEqual(result.usage,USAGE);
  assert.deepEqual(degraded.isDegraded(),{ degraded:false });
  if (rejected) {
    assert.equal(diagnostics.length,1);
    assert.equal(diagnostics[0]!.predicate,expectedPredicate);
  } else {
    assert.equal(result.text,hostile);
    assert.equal(diagnostics.length,0);
  }
  assert.equal(modelInputs.length,1);
  for (const fragment of ["jad","opal"]) assert.equal(modelInputs[0]!.includes(fragment),false);
  assert.ok(modelInputs[0]!.includes("[REDACTED_SECRET_LIKE]"));
  for (const sink of [...sealed,...persisted,result.text]) {
    if (rejected) assert.equal(sink.includes(hostile),false);
    for (const fragment of ["jad","opal"]) assert.equal(sink.includes(fragment),false);
  }
  assert.ok(sealed.includes(result.text));
  assert.ok(persisted.includes(result.text));
  return {
    hostile,rejected,predicate:diagnostics[0]?.predicate ?? null,
    expectedRejected,expectationMet:rejected === expectedRejected,
    modelCalls,outcome:result.outcome,storedAndReturned:!rejected
  };
}

const answerControls = [
  await answerServiceControl(
    "Support never requests authentication codes; furthermore it may validate them.",
    "CREDENTIAL_OPERATION"
  ),
  await answerServiceControl(
    "Asistența nu cere coduri de autentificare; de asemenea le poate valida.",
    "CREDENTIAL_OPERATION"
  ),
  await answerServiceControl(
    "Asistența nu cere codului de recuperare; de asemenea îl poate valida.",
    "CREDENTIAL_OPERATION"
  ),
  await answerServiceControl(
    "Asistența nu cere aceste coduri de securitate; de asemenea le poate valida.",
    "CREDENTIAL_OPERATION"
  ),
  await answerServiceControl(
    "Asistența nu cere coduri de autentificare; de asemenea nu le poate valida.",
    null,false
  ),
  await answerServiceControl(
    "Asistența poate valida codul poștal și poate schimba numele profilului.",
    null,false
  )
];

const reviewManifest = JSON.parse(readFileSync(`${PRODUCT}/packages/support-kb/reviews/manifest.json`,"utf8"));
const recoveryComponents = readFileSync(`${PRODUCT}/packages/support-kb/recovery/components.json`);
const corpus = loadHelpCorpus(`${PRODUCT}/packages/support-kb/content`,{
  reviewManifest,recoveryComponents,requireReviewedRecovery:true
});
assert.equal(corpus.kbVersion,EXPECTED_KB_VERSION);
assert.equal(corpus.entries.length,36);
assert.equal(Object.isFrozen(corpus),true);
assert.equal(Object.isFrozen(corpus.entries),true);
assert.equal(corpus.entries.every((entry) => entry.modelProjection !== undefined && entry.fallback !== undefined),true);

const serviceFailures = answerControls.filter((control) => !control.expectationMet);
const status = policyFailures.length === 0 && serviceFailures.length === 0 ? "PASS" : "FAIL";
process.stdout.write(JSON.stringify({
  status,revision:REVISION,
  suppliedValueCases:suppliedValues.length,
  romanianCredentialMembers:normalizedRomanianMembers.length,
  benignStateCases:benignStates.length,
  subjectLedControls:subjectLedControls.length,
  unsafeAnswerSummaryCases:unsafeAnswers.length,
  safeAnswerSummaryControls:safeAnswers.length,
  policyFailures,answerControls,serviceFailures,
  corpus:{ kbVersion:corpus.kbVersion,entries:corpus.entries.length }
}) + "\n");
if (status === "FAIL") process.exitCode = 1;
