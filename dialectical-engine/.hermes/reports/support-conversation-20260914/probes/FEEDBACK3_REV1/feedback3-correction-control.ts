import { readFileSync } from "node:fs";

import {
  classifySecurityNavigation,forgotPasswordGuidance
} from "/Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine/.worktrees/support-cp1-p3-correctness/dialectical-engine/apps/api/src/support/security-guidance.ts";
import { classifySupportMessage } from "/Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine/.worktrees/support-cp1-p3-correctness/dialectical-engine/apps/api/src/support/classify.ts";
import {
  SUPPORT_ACTION_IDS,SUPPORT_CAPABILITIES
} from "/Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine/.worktrees/support-cp1-p3-correctness/dialectical-engine/packages/support-kb/src/catalog.ts";
import { buildSupportKnowledgeContext } from "/Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine/.worktrees/support-cp1-p3-correctness/dialectical-engine/packages/support-kb/src/context.ts";
import { loadHelpCorpus } from "/Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine/.worktrees/support-cp1-p3-correctness/dialectical-engine/packages/support-kb/src/index.ts";
import { resolveSupportActions } from "/Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine/.worktrees/support-cp1-p3-correctness/dialectical-engine/packages/support-kb/src/navigation.ts";

const PRODUCT = "/Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine/.worktrees/support-cp1-p3-correctness/dialectical-engine";
const REVISION = "479763da1f586a217f36204cc81138aaa81c6f81";
const EXPECTED_VERSION = "23f8131ced441159be735d779ff4d863c9b0b77cf79a7eb513df49e7711f9f3e";

type Mismatch = Readonly<{ kind:string;text:string;expected:unknown;actual:unknown }>;
const mismatches: Mismatch[] = [];
function check(kind: string,text: string,actual: unknown,expected: unknown) {
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    mismatches.push(Object.freeze({ kind,text,expected,actual }));
  }
}

const reviewManifest = JSON.parse(readFileSync(`${PRODUCT}/packages/support-kb/reviews/manifest.json`,"utf8"));
const recoveryComponents = readFileSync(`${PRODUCT}/packages/support-kb/recovery/components.json`);
const corpus = loadHelpCorpus(`${PRODUCT}/packages/support-kb/content`,{
  reviewManifest,recoveryComponents,requireReviewedRecovery:true
});
check("corpus-version","kbVersion",corpus.kbVersion,EXPECTED_VERSION);
check("corpus-count","entry count",corpus.entries.length,38);
check("identity-pair","identity languages",corpus.entries
  .filter(({ id }) => id === "product-identity").map(({ lang }) => lang).sort(),["en","ro"]);

const identityRecovery = reviewManifest.recovery.components.filter(
  (record: Readonly<{ id:string }>) => record.id === "product-identity"
);
check("manifest-identity","recovery records",identityRecovery.length,2);
for (const record of identityRecovery) {
  check("manifest-owner",`${record.id}/${record.lang}/ratifiedBy`,record.ratifiedBy,"");
  check("manifest-owner",`${record.id}/${record.lang}/ratifiedOn`,record.ratifiedOn,"");
  check("manifest-reviewer",`${record.id}/${record.lang}/reviewerSession`,record.reviewerSession,
    "01a09ef7-e096-7c31-9b35-806840028cf0");
}

function context(language: "en"|"ro",query: string) {
  return buildSupportKnowledgeContext({
    entries:corpus.entries,capabilities:SUPPORT_CAPABILITIES,language,query,historyText:"",
    maxCodePoints:24_000,availableActionIds:SUPPORT_ACTION_IDS,
    referenceFor:(kind,index) => `${kind === "source" ? "s" : "a"}-60000000000040008000000000000001-${index + 1}`
  });
}

const identityQueries = [
  ["en","What is Dialectical-Engine?"],
  ["en","Give me an overview of dialecticalengine."],
  ["en","Explain Debate AIRO to me."],
  ["en","Is Dialectical Engine a reasoning instrument?"],
  ["en","Is DebateAIRO an AI debate tool?"],
  ["ro","Ce este DialecticalEngine?"],
  ["ro","Este Dialectical Engine un instrument de raționament?"]
] as const;
for (const [language,query] of identityQueries) {
  const result = context(language,query);
  check("identity-source",query,result.sourceIds,["product-identity"]);
  check("identity-actions",query,result.requestedActionIds,[]);
}

const brandedFeatures = [
  ["en","How do I export JSON in Dialectical Engine?","export-json"],
  ["en","How do I publish a debate in DebateAIRO?","publish-a-debate"],
  ["ro","Cum export JSON din Dialectical-Engine?","export-json"],
  ["ro","Cum public o dezbatere în DebateAIRO?","publish-a-debate"],
  ["ro","Cum public o dezbatere în Debate AIRO?","publish-a-debate"]
] as const;
for (const [language,query,source] of brandedFeatures) {
  const result = context(language,query);
  check("branded-feature-source",query,result.sourceIds[0],source);
  check("branded-feature-no-identity",query,result.sourceIds.includes("product-identity"),false);
}

const unbrandedFeatures = [
  ["en","Can I download the ledger result as JSON?","export-json"],
  ["en","How do I create a debate?","getting-started-debate"],
  ["ro","Cum creez o dezbatere?","getting-started-debate"]
] as const;
for (const [language,query,source] of unbrandedFeatures) {
  check("unbranded-feature",query,context(language,query).sourceIds[0],source);
}

for (const [language,query] of [
  ["en","Does Dialectical Engine provide medical diagnosis?"],
  ["en","Can DebateAIRO recommend investments?"],
  ["en","Can Dialectical Engine help with medical diagnosis?"],
  ["en","Can DebateAIRO support insider-trading advice?"],
  ["ro","Dialectical Engine oferă consultanță juridică?"]
] as const) {
  const result = context(language,query);
  check("unsupported-source",query,result.sourceIds,[]);
  check("unsupported-actions",query,result.requestedActionIds,[]);
}

const recoveryPositive = [
  ["Give me the password recovery link","en"],
  ["Where is the password reset page?","en"],
  ["Where can I find the link to recover my password?","en"],
  ["Can you show me the recovery page for my password?","en"],
  ["Can you check where the password reset page is?","en"],
  ["I do not want to validate a reset token; show me the password recovery page.","en"],
  ["Where is the p%61ssword recovery link?","en"],
  ["Vreau linkul de recuperare a parolei","ro"],
  ["Unde găsesc linkul pentru a-mi recupera parola?","ro"],
  ["Verifică unde este pagina de resetare a parolei.","ro"],
  ["Nu vreau să validez tokenul de resetare; arată pagina de recuperare a parolei.","ro"],
  ["Unde este linkul pentru recuperarea p%61rolei?","ro"],
  ["Where is the password reset page? Support cannot perform the reset.","en"],
  ["Unde este pagina de resetare a parolei? Asistența nu poate efectua resetarea.","ro"],
  ["Where is the password reset page? Support must not perform the reset.","en"],
  ["Where is the password reset page? Support is unable to perform the reset.","en"],
  ["Unde este pagina de resetare a parolei? Asistența nu trebuie să efectueze resetarea.","ro"],
  ["Unde este pagina de resetare a parolei? Asistența nu are voie să efectueze resetarea.","ro"]
] as const;
for (const [text,language] of recoveryPositive) {
  const expected = { kind:"FORGOT_PASSWORD",language,actionId:"forgot-password" };
  check("recovery-navigation",text,classifySecurityNavigation(text),expected);
  const classification = classifySupportMessage(text);
  check("recovery-caller",text,classification.securityNavigation,"FORGOT_PASSWORD");
}

const recoveryNegative = [
  "Reset my password now",
  "Validate my password reset token",
  "Can the password reset page validate my reset token?",
  "Use the password reset button to submit a reset for me",
  "Poate pagina de resetare a parolei să valideze tokenul meu de resetare?",
  "Unde este pagina pentru validarea codului de recuperare a parolei?",
  "Where is the password reset page? Support cannot perform the reset, but please perform it for me.",
  "I do not want to validate a reset token; please validate this reset token.",
  "Unde este pagina de resetare? Asistența nu poate efectua resetarea, dar efectueaz-o pentru mine.",
  "Where is my saved MFA recovery code?"
] as const;
for (const text of recoveryNegative) {
  check("recovery-negative",text,classifySecurityNavigation(text),null);
}

check("unresolved-action","signed out forgot action",resolveSupportActions(["forgot-password"],{
  signedIn:false,language:"en"
}),[]);
check("unresolved-action","signed in forgot action",resolveSupportActions(["forgot-password"],{
  signedIn:true,language:"ro"
}),[]);
check("guidance-no-route","English guidance has no path",/\/(?:login|settings|reset|recover)/u.test(
  forgotPasswordGuidance("en")
),false);
check("guidance-no-route","Romanian guidance has no path",/\/(?:login|settings|reset|recover)/u.test(
  forgotPasswordGuidance("ro")
),false);

const status = mismatches.length === 0 ? "PASS" : "FAIL";
process.stdout.write(JSON.stringify({
  status,revision:REVISION,corpus:{ entries:corpus.entries.length,kbVersion:corpus.kbVersion },
  counts:{ identity:identityQueries.length,brandedFeatures:brandedFeatures.length,
    unbrandedFeatures:unbrandedFeatures.length,unsupported:5,recoveryPositive:recoveryPositive.length,
    recoveryNegative:recoveryNegative.length,manifestIdentity:identityRecovery.length },
  mismatches
}) + "\n");
if (status === "FAIL") process.exitCode = 1;
