import assert from "node:assert/strict";

import {
  analyzeSupportCredentialText,redactSupportText
} from "/Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine/.worktrees/support-cp1-p3-correctness/dialectical-engine/packages/kernel/src/index.ts";
import {
  parseSupportCaseSummaryDraft,parseSupportDraft
} from "/Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine/.worktrees/support-cp1-p3-correctness/dialectical-engine/apps/api/src/support/response-policy.ts";
import { createSupportAnswerService } from "/Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine/.worktrees/support-cp1-p3-correctness/dialectical-engine/apps/api/src/support/answer.ts";
import { SupportDegradedState } from "/Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine/.worktrees/support-cp1-p3-correctness/dialectical-engine/apps/api/src/support/degraded.ts";
import {
  createSupportMessageCipher,type SupportEncryptedMessage
} from "/Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine/.worktrees/support-cp1-p3-correctness/dialectical-engine/apps/api/src/support/session.ts";

const REVISION = "475c5a7e7eb8f48a3f5a81379f37b49fdd014ce9";
const FALLBACK = "Choose Start a debate, then provide the topic and available plan controls.";
const USAGE = Object.freeze({ input_tokens:19,output_tokens:11,cost_usd:0.005 });

const termCases = [
  ["cod de recuperare","recovery-code"],
  ["codul de verificare","verification-code"],
  ["codului de securitate","security-code"],
  ["coduri de autentificare","authentication-code"],
  ["codurile de recuperare","recovery-code"],
  ["codurilor de verificare","verification-code"],
  ["coduri TOTP","totp"],
  ["codului MFA","mfa"],
  ["codurilor OTP","otp"]
] as const;

for (const [text,kind] of termCases) {
  const terms = analyzeSupportCredentialText(text).credentialTerms;
  assert.deepEqual(terms.map(({ kind }) => kind),[kind],`missing credential fact: ${text}`);
  assert.equal(text.slice(terms[0]!.start,terms[0]!.end),text);
}

const suppliedValues = [
  { text:"Coduri de autentificare: jad și opal; păstrează-le private.",fragments:["jad","opal"] },
  { text:"Codului de verificare = safir și topaz; nu îl publica.",fragments:["safir","topaz"] },
  { text:"Codurilor OTP: arțar, dar cedru; ajută-mă.",fragments:["arțar","cedru"] }
] as const;

for (const fixture of suppliedValues) {
  const facts = analyzeSupportCredentialText(fixture.text);
  assert.equal(facts.credentialValueSpans.length,1,`missing supplied value: ${fixture.text}`);
  const redacted = redactSupportText(fixture.text);
  assert.equal(redacted.redacted,true);
  assert.ok(redacted.text.includes("[REDACTED_SECRET_LIKE]"));
  for (const fragment of fixture.fragments) assert.equal(redacted.text.includes(fragment),false);
}

function answerRaw(text: string): string {
  return JSON.stringify({ kind:"answer",text,sourceIds:[],actionIds:[] });
}

function summaryRaw(text: string): string {
  return JSON.stringify({ kind:"case_summary",text,sourceIds:[],actionIds:[] });
}

const unsafeOutputs = [
  "Asistența nu cere coduri de autentificare; de asemenea le poate valida.",
  "Asistența nu solicită valorile codurilor de verificare; de asemenea le poate valida.",
  "Asistența nu cere codurile de recuperare; în plus le poate folosi.",
  "Asistența nu cere coduri TOTP; în plus le poate primi.",
  "Support does not request authentication codes; furthermore it may validate them."
] as const;

for (const text of unsafeOutputs) {
  assert.equal(parseSupportDraft(answerRaw(text)),null,`answer admitted: ${text}`);
  assert.equal(parseSupportCaseSummaryDraft(summaryRaw(text)),null,`summary admitted: ${text}`);
}

const safeOutputs = [
  "Asistența nu cere coduri de autentificare; de asemenea nu le poate valida.",
  "Asistența nu solicită valorile codurilor de verificare; în plus nu le folosește.",
  "Support does not request authentication codes; furthermore it cannot validate them.",
  "Editorul afișează coduri de profil pentru tema publică.",
  "Poți schimba numele de afișare din Setări.",
  "Codul sursă pentru profil este public."
] as const;

for (const text of safeOutputs) {
  assert.notEqual(parseSupportDraft(answerRaw(text)),null,`answer rejected benign text: ${text}`);
  assert.notEqual(parseSupportCaseSummaryDraft(summaryRaw(text)),null,`summary rejected benign text: ${text}`);
}

async function cipherRoundTrip(text: string) {
  const sealed: string[] = [];
  const persisted: string[] = [];
  const transited: string[] = [];
  const cipher = createSupportMessageCipher({
    unwrapDataKey:async () => Buffer.alloc(32,5),
    sealContent:(_aad: unknown,_key: Uint8Array,plaintext: Uint8Array) => {
      sealed.push(Buffer.from(plaintext).toString("utf8"));
      return Buffer.from(plaintext);
    },
    openContent:() => Buffer.alloc(0)
  } as never,{
    readSessionKey:async () => Buffer.from("wrapped"),
    write:async (input: SupportEncryptedMessage) => {
      persisted.push(Buffer.from(input.contentCiphertext).toString("utf8"));
    },
    read:async () => null,
    listSession:async () => []
  });
  const stored = await cipher.writeAndTransit({
    messageId:"51000000-0000-4000-8000-000000000001",
    sessionId:"51000000-0000-4000-8000-000000000002",
    role:"user",text,outcome:"REFUSE_ZONE",language:"ro",detectedLanguage:"ro",
    overrideLanguage:null,receivedAt:new Date("2026-09-17T09:00:00.000Z"),
    firstTokenAt:null,completedAt:null
  },async (safeText) => { transited.push(safeText); });
  return { sealed,persisted,transited,stored };
}

for (const fixture of suppliedValues) {
  const observed = await cipherRoundTrip(fixture.text);
  for (const sink of [...observed.sealed,...observed.persisted,...observed.transited,observed.stored.text]) {
    assert.ok(sink.includes("[REDACTED_SECRET_LIKE]"));
    for (const fragment of fixture.fragments) assert.equal(sink.includes(fragment),false);
  }
}

function snapshot() {
  const entry = Object.freeze({
    id:"getting-started-debate",lang:"en" as const,title:"Start a debate",status:"shipped" as const,
    sources:Object.freeze(["review-probe"]),verifiedAgainst:REVISION,ratifiedBy:"V" as const,
    ratifiedOn:"2026-09-17",body:"The visitor can start a debate using the reviewed creation flow.",
    modelProjection:"A visitor can choose Start a debate, then provide a topic and plan controls.",
    fallback:FALLBACK
  });
  return Object.freeze({ entries:Object.freeze([entry]),kbVersion:"d".repeat(64) });
}

function outputSource(system: string): string {
  const source = /sourceIds=([^,\n]+)/u.exec(system)?.[1];
  assert.ok(source && source !== "none");
  return source;
}

async function answerServiceControl(hostile: string) {
  const current = snapshot();
  const sealed: string[] = [];
  const persisted: string[] = [];
  const modelInputs: string[] = [];
  const diagnostics: Array<Readonly<Record<string,unknown>>> = [];
  let calls = 0;
  const messages = createSupportMessageCipher({
    unwrapDataKey:async () => Buffer.alloc(32,9),
    sealContent:(_aad: unknown,_key: Uint8Array,plaintext: Uint8Array) => {
      sealed.push(Buffer.from(plaintext).toString("utf8"));
      return Buffer.from(plaintext);
    },
    openContent:() => Buffer.alloc(0)
  } as never,{
    readSessionKey:async () => Buffer.from("wrapped"),
    write:async (input: SupportEncryptedMessage) => {
      persisted.push(Buffer.from(input.contentCiphertext).toString("utf8"));
    },
    read:async () => null,
    listSession:async () => []
  });
  const degraded = new SupportDegradedState();
  const base = Date.parse("2026-09-17T09:00:00.000Z");
  degraded.markUnavailable(new Date(base),"relay");
  const service = createSupportAnswerService({
    entries:current.entries,
    snapshots:{ currentVersion:current.kbVersion,get:(version) => version === current.kbVersion ? current : undefined },
    messages,degraded,
    reportDraftDiagnostic:(diagnostic) => diagnostics.push(diagnostic as unknown as Readonly<Record<string,unknown>>),
    modelFor:() => ({ complete:async (request: Readonly<{
      system:string;messages:readonly Readonly<{ content:string }>[];
    }>) => {
      calls += 1;
      modelInputs.push(request.messages[0]!.content);
      return Object.freeze({
        text:JSON.stringify({ kind:"answer",text:hostile,sourceIds:[outputSource(request.system)],actionIds:[] }),
        usage:USAGE
      });
    } }) as never,
    clock:(() => { let now = base + 1_001; return () => new Date(++now); })()
  });
  const result = await service.respond({
    sessionId:"52000000-0000-4000-8000-000000000001",
    text:"How do I start a debate? Coduri de autentificare: jad și opal; păstrează-le private.",
    language:"en",detectedLanguage:"en",overrideLanguage:null,modelRef:"inert-p5-control",
    kbVersion:current.kbVersion,snapshot:current,signedIn:false,receivedAt:new Date(base + 1_001)
  });
  assert.equal(calls,1);
  assert.equal(result.outcome,"ANSWER_GROUNDED");
  assert.equal(result.text,FALLBACK);
  assert.deepEqual(result.sources,[{ id:"getting-started-debate",label:"Start a debate" }]);
  assert.deepEqual(result.actions,[{ id:"start-debate",label:"Start a debate",href:"/login?next=%2Fnew" }]);
  assert.deepEqual(result.usage,USAGE);
  assert.deepEqual(degraded.isDegraded(),{ degraded:false });
  assert.equal(diagnostics.length,1);
  assert.equal(diagnostics[0]!.predicate,"CREDENTIAL_OPERATION");
  assert.equal(modelInputs.length,1);
  for (const fragment of ["jad","opal"]) assert.equal(modelInputs[0]!.includes(fragment),false);
  assert.ok(modelInputs[0]!.includes("[REDACTED_SECRET_LIKE]"));
  for (const sink of [...sealed,...persisted,result.text]) {
    assert.equal(sink.includes(hostile),false);
    for (const fragment of ["jad","opal"]) assert.equal(sink.includes(fragment),false);
  }
  assert.ok(sealed.includes(FALLBACK));
  assert.ok(persisted.includes(FALLBACK));
  return Object.freeze({ calls,predicate:diagnostics[0]!.predicate,outcome:result.outcome });
}

const serviceControls = [
  await answerServiceControl(unsafeOutputs[0]),
  await answerServiceControl(unsafeOutputs[1])
];

process.stdout.write(JSON.stringify({
  status:"PASS",revision:REVISION,termCases:termCases.length,
  suppliedValueCases:suppliedValues.length,unsafePolicyCases:unsafeOutputs.length,
  safePolicyControls:safeOutputs.length,serviceControls
}) + "\n");
