import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";
import { resolve } from "node:path";

const productRoot="/Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine/.worktrees/support-conversation-cp1/dialectical-engine";
const missionRoot="/Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine";
const evidenceRoot=resolve(missionRoot,".hermes/reports/support-conversation-20260914/evidence");
const load=relative => import(pathToFileURL(resolve(productRoot,relative)).href);
const [loader,catalog,context,navigation,session,responsePolicy,references]=await Promise.all([
  load("packages/support-kb/src/index.ts"),
  load("packages/support-kb/src/catalog.ts"),
  load("packages/support-kb/src/context.ts"),
  load("packages/support-kb/src/navigation.ts"),
  load("apps/api/src/support/session.ts"),
  load("apps/api/src/support/response-policy.ts"),
  load("apps/api/src/support/model-references.ts")
]);

const publicEvidence=JSON.parse(await readFile(resolve(evidenceRoot,"GUIDE_LIVE8-failed-row-public-evidence.json"),"utf8"));
const manifest=JSON.parse(await readFile(resolve(productRoot,"packages/support-kb/reviews/manifest.json"),"utf8"));
const components=await readFile(resolve(productRoot,"packages/support-kb/recovery/components.json"));
const corpus=loader.loadHelpCorpus(resolve(productRoot,"packages/support-kb/content"),{
  reviewManifest:manifest,recoveryComponents:components,requireReviewedRecovery:true
});
const availableActionIds=navigation.resolveSupportActions(catalog.SUPPORT_ACTION_IDS,{
  signedIn:false,language:"ro"
}).map(({ id }) => id);
const factory=references.createSupportModelReferenceFactory();
const prepared=session.redactSupportMessage(publicEvidence.canonicalRow.prompt);
const built=context.buildSupportKnowledgeContext({
  entries:corpus.entries,capabilities:catalog.SUPPORT_CAPABILITIES,language:"ro",
  query:prepared.text,historyText:"",availableActionIds,
  referenceFor:factory.referenceFor,maxCodePoints:20_000
});
const appReference=built.sourceReferences.find(({ canonicalId }) => canonicalId === "app-navigation")?.reference;
if (appReference === undefined) throw new Error("GUIDE_SOURCE_DIAG_APP_NAVIGATION_UNAVAILABLE");
const serialized=JSON.stringify({
  kind:"answer",text:publicEvidence.api.text,sourceIds:[appReference],actionIds:[]
});
const acceptedIds=[
  ...built.sourceIds,...built.requestedActionIds,
  ...built.sourceReferences.map(({ reference }) => reference),
  ...built.actionReferences.map(({ reference }) => reference)
];
const diagnostic=responsePolicy.diagnoseSupportDraft(
  serialized,built.sourceReferences.map(({ reference }) => reference),
  built.actionReferences.map(({ reference }) => reference),acceptedIds
);
const parsed=responsePolicy.parseSupportDraft(serialized,acceptedIds);
const validated=parsed === null ? null : responsePolicy.validateSupportDraft(
  parsed,built.sourceReferences.map(({ reference }) => reference),
  built.actionReferences.map(({ reference }) => reference)
);
const translated=validated === null ? null : references.translateSupportDraftReferences(validated,{
  sources:built.sourceReferences,actions:built.actionReferences
});
const componentsJson=JSON.parse(components.toString("utf8"));
const projections=Object.fromEntries(componentsJson.components
  .filter(({ id,lang }) => lang === "ro" && [
    "app-navigation","guide-how-it-works","debate-workspace-menus"
  ].includes(id)).map(({ id,modelProjection }) => [id,modelProjection]));
const sha=value => createHash("sha256").update(value).digest("hex");
function neighborContext(query,language) {
  const localFactory=references.createSupportModelReferenceFactory();
  const actionIds=navigation.resolveSupportActions(catalog.SUPPORT_ACTION_IDS,{
    signedIn:false,language
  }).map(({ id }) => id);
  const value=context.buildSupportKnowledgeContext({
    entries:corpus.entries,capabilities:catalog.SUPPORT_CAPABILITIES,language,
    query:session.redactSupportMessage(query).text,historyText:"",availableActionIds:actionIds,
    referenceFor:localFactory.referenceFor,maxCodePoints:20_000
  });
  return { sourceIds:value.sourceIds,requestedActionIds:value.requestedActionIds };
}

const result={
  schemaVersion:1,
  revision:"152eed4da1cd3e66b74d8301159ba76427552409",
  questionSha256:sha(publicEvidence.canonicalRow.prompt),
  answerSha256:sha(publicEvidence.api.text),
  kbVersion:corpus.kbVersion,
  context:{
    sourceIds:built.sourceIds,
    requestedActionIds:built.requestedActionIds,
    sourcePolicy:built.sourcePolicy,
    appNavigationPosition:built.sourceIds.indexOf("app-navigation")
  },
  actualValidator:{
    diagnosticCode:diagnostic.code,
    parsed:parsed !== null,
    validated:validated !== null,
    translatedSourceIds:translated?.sourceIds ?? null,
    translatedActionIds:translated?.actionIds ?? null,
    sourcePolicySatisfied:translated !== null
      && loader.supportSourceIdsSatisfyPolicy(translated.sourceIds,built.sourcePolicy),
    textScreenAccepted:responsePolicy.screenSupportModelText(publicEvidence.api.text)
  },
  reviewedProjectionFacts:{
    appNavigationMentionsMethodAndTranscripts:/Method și Transcripts/u.test(projections["app-navigation"]),
    appNavigationDefinesHomeAsLibrary:/Acasă este biblioteca/u.test(projections["app-navigation"]),
    appNavigationMentionsHelpFreeText:/Help acceptă text liber/u.test(projections["app-navigation"]),
    appNavigationAllowsFixedNavigation:/navigare fixă/u.test(projections["app-navigation"]),
    guideHowItWorksDescribesWorkspaceArtifacts:/spațiul dezbaterii poate afișa arborele/u.test(projections["guide-how-it-works"]),
    workspaceMenusDescribesOpenDebateControls:/controale pentru dezbaterea deja deschisă/u.test(projections["debate-workspace-menus"])
  },
  harnessOracle:{
    expectedPrimaryIds:["guide-how-it-works","debate-workspace-menus"],
    acceptsActualPrimary:false
  },
  neighbors:{
    broadEnglish:neighborContext("Where can I learn how a debate works?","en"),
    explicitLocalEnglish:neighborContext("What does the How it works control in an open debate explain?","en"),
    explicitLocalRomanian:neighborContext("Ce explică controlul Cum funcționează într-o dezbatere deschisă?","ro")
  }
};
process.stdout.write(`${JSON.stringify(result,null,2)}\n`);
