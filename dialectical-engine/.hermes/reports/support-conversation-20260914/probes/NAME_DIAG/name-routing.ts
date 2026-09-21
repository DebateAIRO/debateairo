import { readFileSync } from "node:fs";

import { createSupportAnswerService } from "/Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine/.worktrees/support-conversation-cp1/dialectical-engine/apps/api/src/support/answer.ts";
import { classifySupportMessage } from "/Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine/.worktrees/support-conversation-cp1/dialectical-engine/apps/api/src/support/classify.ts";
import { buildSupportKnowledgeContext } from "/Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine/.worktrees/support-conversation-cp1/dialectical-engine/packages/support-kb/src/context.ts";
import {
  SUPPORT_ACTION_IDS,SUPPORT_CAPABILITIES,type SupportLanguage
} from "/Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine/.worktrees/support-conversation-cp1/dialectical-engine/packages/support-kb/src/catalog.ts";
import {
  createHelpCorpusSnapshotLookup,loadHelpCorpus
} from "/Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine/.worktrees/support-conversation-cp1/dialectical-engine/packages/support-kb/src/index.ts";

const PRODUCT = "/Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine/.worktrees/support-conversation-cp1/dialectical-engine";
const reviewManifest = JSON.parse(readFileSync(`${PRODUCT}/packages/support-kb/reviews/manifest.json`,"utf8"));
const recoveryComponents = readFileSync(`${PRODUCT}/packages/support-kb/recovery/components.json`);
const corpus = loadHelpCorpus(`${PRODUCT}/packages/support-kb/content`,{
  reviewManifest,recoveryComponents,requireReviewedRecovery:true
});

const nameQueries = [
  ["en","What is Dialectical-Engine?"],
  ["en","What is Dialectical Engine?"],
  ["en","what is DIALECTICAL-ENGINE?"],
  ["en","What is DebateAIRO?"],
  ["ro","Ce este Dialectical-Engine?"],
  ["ro","Ce este Dialectical Engine?"],
  ["ro","Ce este DebateAIRO?"],
  ["en","How do I export JSON in Dialectical-Engine?"],
  ["en","How do I publish a debate in DebateAIRO?"],
  ["ro","Cum export JSON din Dialectical Engine?"],
  ["ro","Cum public o dezbatere în DebateAIRO?"],
  ["en","Does Dialectical Engine offer medical diagnosis?"],
  ["ro","Dialectical Engine oferă diagnostic medical?"],
  ["en","How do I create a debate?"],
  ["ro","Cum creez o dezbatere?"]
] as const satisfies readonly (readonly [SupportLanguage,string])[];

const recoveryQueries = [
  "Give me the password recovery link.",
  "Where is the password reset link?",
  "Give me the Forgot password link.",
  "Vreau linkul de recuperare a parolei.",
  "Unde este linkul pentru resetarea parolei?",
  "Dă-mi linkul Am uitat parola."
] as const;

const credentialBoundaryQueries = [
  "Can Dialectical Engine validate my password?",
  "Poate Dialectical Engine să îmi verifice parola?"
] as const;

function contextFor(language: SupportLanguage,query: string) {
  return buildSupportKnowledgeContext({
    entries: corpus.entries,capabilities: SUPPORT_CAPABILITIES,
    availableActionIds: SUPPORT_ACTION_IDS,language,query,historyText:"",
    maxCodePoints:24_000,
    referenceFor:(kind,index) => `${kind === "source" ? "s" : "a"}-probe-${index + 1}`
  });
}

async function serviceResult(language: SupportLanguage,text: string) {
  let modelCalls = 0;
  const messages = Object.freeze({
    write: async (input: Readonly<Record<string,unknown>>) => Object.freeze({ ...input,redacted:false }),
    writeAndTransit: async (
      input: Readonly<{ text:string }>,transit:(safeText:string)=>Promise<void>
    ) => { await transit(input.text);return Object.freeze({ ...input,redacted:false }); },
    read: async () => null,listSession: async () => []
  });
  const answer = createSupportAnswerService({
    entries:corpus.entries,snapshots:createHelpCorpusSnapshotLookup(corpus),messages:messages as never,
    modelFor:() => Object.freeze({ complete:async (request:Readonly<{ system:string }>) => {
      modelCalls += 1;
      const source = /^sourceIds=([^,\n]+)/mu.exec(request.system)?.[1];
      if (source === undefined || source === "none") throw new Error("MODEL_CALLED_WITHOUT_SOURCE");
      return Object.freeze({ text:JSON.stringify({
        kind:"answer",text:"This answer uses the selected reviewed product source.",
        sourceIds:[source],actionIds:[]
      }) });
    } }) as never,
    clock:(() => { let at=Date.parse("2026-09-17T12:00:00.000Z");return () => new Date(++at); })()
  });
  const result = await answer.respond({
    sessionId:"51000000-0000-4000-8000-000000000001",text,language,
    detectedLanguage:language,overrideLanguage:null,modelRef:"synthetic-name-diagnostic",
    kbVersion:corpus.kbVersion,snapshot:corpus,signedIn:false,
    receivedAt:new Date("2026-09-17T12:00:00.000Z")
  });
  return { outcome:result.outcome,sourceIds:result.sources?.map(({ id }) => id) ?? [],modelCalls };
}

const names = [];
for (const [language,query] of nameQueries) {
  const context = contextFor(language,query);
  names.push({
    language,query,classification:classifySupportMessage(query),
    contextSourceIds:context.sourceIds,requestedActionIds:context.requestedActionIds,
    service:await serviceResult(language,query)
  });
}

const recovery = recoveryQueries.map((query) => ({ query,classification:classifySupportMessage(query) }));
const credentialBoundaries = credentialBoundaryQueries.map((query) => ({
  query,classification:classifySupportMessage(query)
}));
process.stdout.write(JSON.stringify({
  revision:"475c5a7e7eb8f48a3f5a81379f37b49fdd014ce9",
  corpus:{ kbVersion:corpus.kbVersion,entries:corpus.entries.length },
  names,recovery,credentialBoundaries
},null,2) + "\n");
