import { readFileSync } from "node:fs";

import { createSupportAnswerService } from "/Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine/.worktrees/support-cp1-p3-correctness/dialectical-engine/apps/api/src/support/answer.ts";
import { classifySupportMessage } from "/Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine/.worktrees/support-cp1-p3-correctness/dialectical-engine/apps/api/src/support/classify.ts";
import {
  createSupportMessageCipher,type SupportEncryptedMessage
} from "/Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine/.worktrees/support-cp1-p3-correctness/dialectical-engine/apps/api/src/support/session.ts";
import { SUPPORT_ACTION_IDS,SUPPORT_CAPABILITIES } from "/Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine/.worktrees/support-cp1-p3-correctness/dialectical-engine/packages/support-kb/src/catalog.ts";
import { buildSupportKnowledgeContext } from "/Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine/.worktrees/support-cp1-p3-correctness/dialectical-engine/packages/support-kb/src/context.ts";
import { loadHelpCorpus } from "/Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine/.worktrees/support-cp1-p3-correctness/dialectical-engine/packages/support-kb/src/index.ts";

const PRODUCT = "/Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine/.worktrees/support-cp1-p3-correctness/dialectical-engine";
const manifest = JSON.parse(readFileSync(`${PRODUCT}/packages/support-kb/reviews/manifest.json`,"utf8"));
const corpus = loadHelpCorpus(`${PRODUCT}/packages/support-kb/content`,{
  reviewManifest:manifest,
  recoveryComponents:readFileSync(`${PRODUCT}/packages/support-kb/recovery/components.json`),
  requireReviewedRecovery:true
});

function context(query: string,language: "en"|"ro" = "en") {
  const result = buildSupportKnowledgeContext({
    entries:corpus.entries,capabilities:SUPPORT_CAPABILITIES,language,query,historyText:"",
    maxCodePoints:24_000,availableActionIds:SUPPORT_ACTION_IDS,
    referenceFor:(kind,index) => `${kind === "source" ? "s" : "a"}-70000000000040008000000000000001-${index + 1}`
  });
    return { sourceIds:result.sourceIds,requestedActionIds:result.requestedActionIds };
}

async function service(query: string) {
  const writes: string[] = [];
  let modelCalls = 0;
  const messages = createSupportMessageCipher({
    unwrapDataKey:async () => Buffer.alloc(32,3),
    sealContent:(_aad: unknown,_key: Uint8Array,plaintext: Uint8Array) => Buffer.from(plaintext),
    openContent:() => Buffer.alloc(0)
  } as never,{
    readSessionKey:async () => Buffer.from("wrapped"),
    write:async (input: SupportEncryptedMessage) => {
      writes.push(Buffer.from(input.contentCiphertext).toString("utf8"));
    },
    read:async () => null,
    listSession:async () => []
  });
  const api = createSupportAnswerService({
    entries:corpus.entries,
    snapshots:{ currentVersion:corpus.kbVersion,get:(version) => version === corpus.kbVersion ? corpus : undefined },
    messages,
    modelFor:() => ({ complete:async (request: Readonly<{ system:string }>) => {
      modelCalls += 1;
      const source = /sourceIds=([^,\n]+)/u.exec(request.system)?.[1];
      if (source === undefined || source === "none") throw new Error("missing source reference");
      return Object.freeze({
        text:JSON.stringify({
          kind:"answer",text:"Dialectical Engine is a reviewed product.",sourceIds:[source],actionIds:[]
        }),
        usage:{ input_tokens:7,output_tokens:5,cost_usd:0.002 }
      });
    } }) as never,
    clock:(() => { let time = Date.parse("2026-09-17T10:00:00.000Z"); return () => new Date(++time); })()
  });
  const result = await api.respond({
    sessionId:"71000000-0000-4000-8000-000000000001",text:query,
    language:"en",detectedLanguage:"en",overrideLanguage:null,modelRef:"inert-feedback-observation",
    kbVersion:corpus.kbVersion,snapshot:corpus,signedIn:false,
    receivedAt:new Date("2026-09-17T10:00:00.000Z")
  });
  return { query,modelCalls,outcome:result.outcome,sources:result.sources,actions:result.actions,writes };
}

const contextObservations = [
  "What is Dialectical-Engine?",
  "Is Dialectical Engine a reasoning instrument?",
  "Is DebateAIRO an AI debate tool?",
  "Cum public o dezbatere în DebateAIRO?",
  "Cum public o dezbatere în Debate AIRO?",
  "Can Dialectical Engine help with medical diagnosis?",
  "Can DebateAIRO support insider-trading advice?"
].map((query) => ({ query,...context(query,query.startsWith("Cum") ? "ro" : "en") }));

const recoveryTexts = [
  "Where can I find the link to recover my password?",
  "Can you show me the recovery page for my password?",
  "Unde găsesc linkul pentru a-mi recupera parola?",
  "Can the password reset page validate my reset token?",
  "Use the password reset button to submit a reset for me",
  "Poate pagina de resetare a parolei să valideze tokenul meu de resetare?"
  ,"Where is the password reset page? Support cannot perform the reset."
  ,"Unde este pagina de resetare a parolei? Asistența nu poate efectua resetarea."
];
const recoveryObservations = recoveryTexts.map((text) => ({ text,...classifySupportMessage(text) }));

const serviceObservations = [
  await service("What is Dialectical-Engine?"),
  await service("Is Dialectical Engine a reasoning instrument?"),
  await service("Is DebateAIRO an AI debate tool?"),
  await service("Can Dialectical Engine help with medical diagnosis?"),
  await service("Can DebateAIRO support insider-trading advice?")
];

process.stdout.write(JSON.stringify({
  status:"OBSERVED",revision:"9e87fe5859b44fbd62dd485e03045e5bcde96bed",
  contextObservations,recoveryObservations,serviceObservations
}) + "\n");
