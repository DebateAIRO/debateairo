import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import {
  createHelpCorpusSnapshotLookup,loadHelpCorpus,type LoadedHelpCorpus
} from "/Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine/.worktrees/support-cp1-p3-security/dialectical-engine/packages/support-kb/src/index.ts";
import {
  SUPPORT_ACTION_IDS,SUPPORT_CAPABILITIES,type SupportLanguage
} from "/Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine/.worktrees/support-cp1-p3-security/dialectical-engine/packages/support-kb/src/catalog.ts";
import { buildSupportKnowledgeContext } from "/Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine/.worktrees/support-cp1-p3-security/dialectical-engine/packages/support-kb/src/context.ts";
import { resolveSupportActions } from "/Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine/.worktrees/support-cp1-p3-security/dialectical-engine/packages/support-kb/src/navigation.ts";
import { createSupportAnswerService } from "/Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine/.worktrees/support-cp1-p3-security/dialectical-engine/apps/api/src/support/answer.ts";
import { classifySupportMessage } from "/Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine/.worktrees/support-cp1-p3-security/dialectical-engine/apps/api/src/support/classify.ts";
import { createSupportModelReferenceFactory } from "/Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine/.worktrees/support-cp1-p3-security/dialectical-engine/apps/api/src/support/model-references.ts";
import {
  classifySecurityNavigation,forgotPasswordGuidance
} from "/Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine/.worktrees/support-cp1-p3-security/dialectical-engine/apps/api/src/support/security-guidance.ts";
import {
  redactSupportMessage,type SupportMessageCipherPort
} from "/Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine/.worktrees/support-cp1-p3-security/dialectical-engine/apps/api/src/support/session.ts";

const PRODUCT = "/Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine/.worktrees/support-cp1-p3-security/dialectical-engine";
const REVISION = "479763da1f586a217f36204cc81138aaa81c6f81";
const KB_VERSION = "23f8131ced441159be735d779ff4d863c9b0b77cf79a7eb513df49e7711f9f3e";
const REQUEST_ID = "51000000-0000-4000-8000-000000000051";

const reviewManifest = JSON.parse(readFileSync(`${PRODUCT}/packages/support-kb/reviews/manifest.json`,"utf8"));
const recoveryComponents = readFileSync(`${PRODUCT}/packages/support-kb/recovery/components.json`);
const snapshot = loadHelpCorpus(`${PRODUCT}/packages/support-kb/content`,{
  reviewManifest,recoveryComponents,requireReviewedRecovery:true
});
assert.equal(snapshot.kbVersion,KB_VERSION);
assert.equal(snapshot.entries.length,38);
const identityEntries = snapshot.entries.filter(({ id }) => id === "product-identity");
assert.deepEqual(identityEntries.map(({ lang }) => lang).sort(),["en","ro"]);
assert.ok(identityEntries.every(({ recoveryReview }) => recoveryReview?.reviewedBy === "SOL"
  && recoveryReview.reviewerSession === "01a09ef7-e096-7c31-9b35-806840028cf0"
  && recoveryReview.ratifiedBy === "" && recoveryReview.ratifiedOn === ""));

function contextFor(query: string,language: SupportLanguage,signedIn = false) {
  const factory = createSupportModelReferenceFactory(REQUEST_ID);
  return buildSupportKnowledgeContext({
    entries:snapshot.entries,capabilities:SUPPORT_CAPABILITIES,language,query,historyText:"",
    maxCodePoints:12_000,
    availableActionIds:resolveSupportActions(SUPPORT_ACTION_IDS,{ signedIn,language }).map(({ id }) => id),
    referenceFor:factory.referenceFor
  });
}

const identityQueries = [
  { language:"en" as const,query:"What is Dialectical Engine?" },
  { language:"en" as const,query:"Why can't the support agent answer questions about Dialectical-Engine?" },
  { language:"en" as const,query:"Give me an overview of dialecticalengine." },
  { language:"ro" as const,query:"Ce este Debate AIRO și la ce este folosit?" },
  { language:"en" as const,query:"Is Dialectical Engine a reasoning instrument?" },
  { language:"ro" as const,query:"Este Dialectical Engine un instrument de raționament?" }
].map((item) => ({ ...item,context:contextFor(item.query,item.language) }));

const featureQueries = [
  { language:"en" as const,query:"How do I export a debate from Dialectical Engine?",expected:"export-json" },
  { language:"ro" as const,query:"Cum public o dezbatere în DebateAIRO?",expected:"publish-a-debate" },
  { language:"ro" as const,query:"Cum public o dezbatere în Debate AIRO?",expected:"publish-a-debate" },
  { language:"en" as const,query:"How do I view a public debate in Dialectical Engine?",expected:"view-public-debate" }
].map((item) => ({ ...item,context:contextFor(item.query,item.language) }));

const unsupportedQueries = [
  "Does Dialectical Engine provide medical advice?",
  "Does Dialectical Engine support investment advice?",
  "Can DebateAIRO help diagnose medical conditions?",
  "Can Dialectical-Engine support insider trading questions?",
  "Does Dialectical Engine offer portfolio recommendations?",
  "Could Debate AIRO assist with diagnosing illness?",
  "Will Dialectical Engine help answer market manipulation questions?"
].map((query) => ({ query,context:contextFor(query,"en") }));

const privateQueries = [
  { id:"identity-signed-in",context:contextFor("What is Dialectical Engine?","en",true) },
  { id:"settings-signed-out",context:contextFor("Tell me about Dialectical Engine account settings.","en",false) },
  { id:"settings-signed-in",context:contextFor("Tell me about Dialectical Engine account settings.","en",true) }
];

const contextMismatches = [
  ...identityQueries.flatMap(({ query,context }) => [
    ...(context.sourceIds.length === 1 && context.sourceIds[0] === "product-identity"
      ? [] : [`identity-source:${query}:${context.sourceIds.join(",")}`]),
    ...(context.requestedActionIds.length === 0
      ? [] : [`identity-action:${query}:${context.requestedActionIds.join(",")}`])
  ]),
  ...featureQueries.flatMap(({ query,expected,context }) => context.sourceIds[0] === expected
    && !context.sourceIds.includes("product-identity") ? []
    : [`feature-source:${query}:expected=${expected}:actual=${context.sourceIds.join(",")}`]),
  ...unsupportedQueries.flatMap(({ query,context }) => context.sourceIds.length === 0
    && context.requestedActionIds.length === 0 ? []
    : [`unsupported-admission:${query}:sources=${context.sourceIds.join(",")}:actions=${context.requestedActionIds.join(",")}`]),
  ...(privateQueries[0]!.context.requestedActionIds.length === 0
    ? [] : [`identity-signed-in-actions:${privateQueries[0]!.context.requestedActionIds.join(",")}`]),
  ...(privateQueries[1]!.context.requestedActionIds.length === 0
    ? [] : [`settings-signed-out-actions:${privateQueries[1]!.context.requestedActionIds.join(",")}`]),
  ...(privateQueries[2]!.context.requestedActionIds.every((id) => id === "settings" || id === "privacy-preferences")
    ? [] : [`settings-signed-in-actions:${privateQueries[2]!.context.requestedActionIds.join(",")}`])
];

const recoveryPositive = [
  "Please show the password recovery page.",
  "Which button opens password reset?",
  "I need the opener for reset my password.",
  "Vreau pagina pentru recuperarea parolei.",
  "Care buton deschide resetarea parolei?",
  "Unde este opțiunea de recuperare a parolei?",
  "Show the p%61ssword recovery link.",
  "Arată pagina pentru recuperarea p%61rolei.",
  "Where can I find the link to recover my password?",
  "Can you show me the recovery page for my password?",
  "Unde găsesc linkul pentru a-mi recupera parola?",
  "Show the password rec%6fvery screen.",
  "Arată linkul pentru resetarea p%61rolei.",
  "Can you check where the password reset page is?",
  "Verifică unde este pagina de resetare a parolei.",
  "I do not want to validate a reset token; show me the password recovery page.",
  "Nu vreau să validez tokenul de resetare; arată pagina de recuperare a parolei.",
  "I don’t want to validate a reset token; show me the password recovery page.",
  "I am not asking you to verify a recovery code; show me the password recovery page.",
  "Nu doresc să validez tokenul de resetare; arată pagina de recuperare a parolei."
];
const recoveryNegative = [
  "Where is my saved MFA recovery code?",
  "How do I change my password?",
  "Reset my password now.",
  "Validate my password reset token.",
  "Where is the page to validate my password reset token?",
  "Unde este pagina pentru validarea tokenului de resetare a parolei?",
  "Can the password reset page validate my reset token?",
  "Use the password reset button to submit a reset for me",
  "Poate pagina de resetare a parolei să valideze tokenul meu de resetare?",
  "Where is the page to v%61lidate my password reset token?",
  "Where is the page to validate my password recovery token?",
  "Unde este pagina pentru validarea codului de recuperare a parolei?",
  "I do not want to validate a reset token, but submit the password reset for me from the page.",
  "Nu vreau să validez tokenul, dar execută resetarea parolei de pe pagină."
];
const recoveryPositiveResults = recoveryPositive.map((text) => ({
  text,navigation:classifySecurityNavigation(text),classification:classifySupportMessage(text)
}));
const recoveryNegativeResults = recoveryNegative.map((text) => ({
  text,navigation:classifySecurityNavigation(text),classification:classifySupportMessage(text)
}));
const unresolvedActions = Object.freeze({
  signedOut:resolveSupportActions(["forgot-password"],{ signedIn:false,language:"en" }),
  signedIn:resolveSupportActions(["forgot-password"],{ signedIn:true,language:"en" })
});
const guidance = Object.freeze({ en:forgotPasswordGuidance("en"),ro:forgotPasswordGuidance("ro") });
const recoveryMismatches = [
  ...recoveryPositiveResults.flatMap(({ text,navigation,classification }) => [
    ...(navigation?.kind === "FORGOT_PASSWORD"
      ? [] : [`recovery-positive-navigation:${text}`]),
    ...(classification.outcome === "REFUSE_ZONE" && classification.securityNavigation === "FORGOT_PASSWORD"
      && classification.link === null ? [] : [`recovery-positive-classification:${text}`])
  ]),
  ...recoveryNegativeResults.flatMap(({ text,navigation }) => navigation === null
    ? [] : [`recovery-cross-intent:${text}:${navigation.kind}`]),
  ...(unresolvedActions.signedOut.length === 0 && unresolvedActions.signedIn.length === 0
    ? [] : ["recovery-unresolved-action-emitted"]),
  ...(/[\\/]|https?:|settings|login/iu.test(`${guidance.en} ${guidance.ro}`)
    ? ["recovery-guidance-invented-destination"] : [])
];

const labelledPassword = "Please show the password recovery page. My password is violet cedar.";
const redactedPassword = redactSupportMessage(labelledPassword);
assert.equal(redactedPassword.redacted,true);
assert.equal(redactedPassword.text.includes("violet"),false);
assert.equal(redactedPassword.text.includes("cedar"),false);

type CompletionBuilder = (sourceRefs: readonly string[]) => string;
async function answerCase(query: string,completionFor: CompletionBuilder) {
  const stored: Array<Record<string,unknown>> = [];
  const transited: string[] = [];
  const systems: string[] = [];
  let modelCalls = 0;
  const messages = Object.freeze({
    write:async (message:Record<string,unknown>) => {
      const prepared = redactSupportMessage(String(message.text));
      const row=Object.freeze({ ...message,text:prepared.text,redacted:prepared.redacted });
      stored.push(row);return row;
    },
    writeAndTransit:async (message:Record<string,unknown>,send:(text:string)=>Promise<void>) => {
      const prepared=redactSupportMessage(String(message.text));transited.push(prepared.text);
      await send(prepared.text);
      const row=Object.freeze({ ...message,text:prepared.text,redacted:prepared.redacted });
      stored.push(row);return row;
    },read:async()=>null,listSession:async()=>[]
  }) as unknown as SupportMessageCipherPort;
  const service=createSupportAnswerService({
    entries:snapshot.entries,snapshots:createHelpCorpusSnapshotLookup(snapshot),messages,
    modelReferenceFactory:()=>createSupportModelReferenceFactory(REQUEST_ID),
    modelFor:()=>Object.freeze({ complete:async (request:Readonly<{ system:string }>) => {
      modelCalls += 1;systems.push(request.system);
      const refs=request.system.match(/^sourceIds=(.*)$/mu)?.[1]?.split(",")
        .filter((value)=>value!==""&&value!=="none") ?? [];
      return Object.freeze({ text:completionFor(refs) });
    } }) as never,
    clock:(()=>{let at=Date.parse("2026-09-17T12:00:00.000Z");return()=>new Date(++at);})()
  });
  const result=await service.respond({
    sessionId:"52000000-0000-4000-8000-000000000052",text:query,
    language:"en",detectedLanguage:"en",overrideLanguage:null,modelRef:"synthetic-model",
    kbVersion:snapshot.kbVersion,snapshot,signedIn:false,
    receivedAt:new Date("2026-09-17T12:00:00.000Z")
  });
  return Object.freeze({ query,modelCalls,result,systems,stored,transited });
}

const serviceCases = [
  await answerCase("What is Dialectical Engine?",(refs) => JSON.stringify({
    kind:"answer",text:"Dialectical Engine is a reasoning instrument for structured debate.",
    sourceIds:refs.slice(0,1),actionIds:[]
  })),
  await answerCase("Is Dialectical Engine a reasoning instrument?",(refs) => JSON.stringify({
    kind:"answer",text:"Dialectical Engine is a reasoning instrument for structured debate.",
    sourceIds:refs.slice(0,1),actionIds:[]
  })),
  await answerCase("Give me an overview of dialecticalengine.",(refs) => JSON.stringify({
    kind:"answer",text:"Dialectical Engine is a reasoning instrument for structured debate.",
    sourceIds:refs.slice(0,1),actionIds:[]
  })),
  await answerCase("Does Dialectical Engine support investment advice?",(refs) => JSON.stringify({
    kind:"answer",text:"Dialectical Engine provides investment advice.",
    sourceIds:refs.slice(0,1),actionIds:[]
  })),
  await answerCase("Can DebateAIRO help diagnose medical conditions?",(refs) => JSON.stringify({
    kind:"answer",text:"DebateAIRO can diagnose medical conditions.",
    sourceIds:refs.slice(0,1),actionIds:[]
  })),
  await answerCase("Can Dialectical Engine validate my password?",(refs) => JSON.stringify({
    kind:"answer",text:"Support may validate your password.",
    sourceIds:refs.slice(0,1),actionIds:[]
  }))
];
const serviceMismatches = [
  ...serviceCases.slice(0,3).flatMap((row) => row.modelCalls === 1
    && row.result.outcome === "ANSWER_GROUNDED"
    && row.result.sources[0]?.id === "product-identity"
    && row.result.actions.length === 0 ? [] : [`service-identity:${row.query}`]),
  ...serviceCases.slice(3,5).flatMap((row) => row.modelCalls === 0
    && row.result.outcome === "NO_SOURCE" && row.result.sources.length === 0
    ? [] : [`service-unsupported:${row.query}:${row.result.outcome}:${row.result.sources.map(({ id })=>id).join(",")}`]),
  ...(serviceCases[5]!.result.text.includes("validate your password")
    ? ["service-credential-operation-survived"] : [])
];

const failures=Object.freeze([...contextMismatches,...recoveryMismatches,...serviceMismatches]);
const output=Object.freeze({
  status:failures.length===0?"PASS":"FAIL",revision:REVISION,
  substrate:"exact admitted snapshot and actual final TypeScript modules with in-memory model/message ports; no socket, HTTP, database, browser, preview, provider, auth, reset, or account traffic",
  snapshot:{ kbVersion:snapshot.kbVersion,entries:snapshot.entries.length,
    identity:identityEntries.map(({ lang,title,recoveryReview })=>({ lang,title,recoveryReview })) },
  contexts:{
    identity:identityQueries.map(({ query,context })=>({ query,sources:context.sourceIds,actions:context.requestedActionIds })),
    feature:featureQueries.map(({ query,context })=>({ query,sources:context.sourceIds,actions:context.requestedActionIds })),
    unsupported:unsupportedQueries.map(({ query,context })=>({ query,sources:context.sourceIds,actions:context.requestedActionIds })),
    private:privateQueries.map(({ id,context })=>({ id,sources:context.sourceIds,actions:context.requestedActionIds }))
  },
  recovery:{ positive:recoveryPositiveResults,negative:recoveryNegativeResults,unresolvedActions,guidance,
    redactedPassword },
  service:serviceCases.map(({ query,modelCalls,result,stored,transited })=>({ query,modelCalls,
    outcome:result.outcome,text:result.text,sources:result.sources,actions:result.actions,
    stored:stored.map(({ role,text })=>({ role,text })),transited })),
  failures
});
process.stdout.write(`${JSON.stringify(output,null,2)}\n`);
if(failures.length>0)process.exitCode=1;
