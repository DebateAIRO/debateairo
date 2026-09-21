import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { createSupportAnswerService } from "/Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine/.worktrees/support-cp1-p3-correctness/dialectical-engine/apps/api/src/support/answer.ts";
import { createSupportModelReferenceFactory } from "/Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine/.worktrees/support-cp1-p3-correctness/dialectical-engine/apps/api/src/support/model-references.ts";
import {
  createHelpCorpusSnapshotLookup,selectSupportRecoveryEntry,supportSourceIdsSatisfyPolicy
} from "/Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine/.worktrees/support-cp1-p3-correctness/dialectical-engine/packages/support-kb/src/index.ts";
import {
  SUPPORT_ACTION_IDS,SUPPORT_CAPABILITIES,SUPPORT_SOURCE_POLICIES
} from "/Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine/.worktrees/support-cp1-p3-correctness/dialectical-engine/packages/support-kb/src/catalog.ts";
import { buildSupportKnowledgeContext } from "/Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine/.worktrees/support-cp1-p3-correctness/dialectical-engine/packages/support-kb/src/context.ts";

const DETACHED = "/Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine/.worktrees/support-cp1-p3-correctness/dialectical-engine";
const REQUEST_ID = "20000000-0000-4000-8000-000000000001";
const factory = () => createSupportModelReferenceFactory(REQUEST_ID);
const POLICY = {
  id:"your-and-public-debates",
  requiredSourceIds:["app-navigation"],
  allowedSourceIds:["app-navigation","browse-public-debates"],
  recoverySourceIds:["app-navigation"]
} as const;
const prompts = {
  en:"Where do I find my debates and the public debate library?",
  ro:"Deschide Dezbaterile mele și Biblioteca de dezbateri publice."
} as const;
const otherPrompts = {
  en:"Where can I browse the public debate library? Do not open my debates.",
  ro:"Unde este biblioteca publică? Nu deschide dezbaterile mele."
} as const;
const limitation = {
  en:"cannot read private lists",
  ro:"nu poate citi liste private"
} as const;

const document = JSON.parse(readFileSync(
  resolve(DETACHED,"packages/support-kb/recovery/components.json"),"utf8"
)) as { components:Array<{id:string;lang:"en"|"ro";modelProjection:string;fallback:string}> };

function corpus(language:"en"|"ro",ids = [
  "app-navigation","browse-public-debates","getting-started-debate"
]) {
  const entries = document.components
    .filter((item) => item.lang === language && ids.includes(item.id))
    .map((item) => Object.freeze({
      id:item.id,lang:item.lang,title:item.id.replaceAll("-"," "),status:"shipped" as const,
      sources:Object.freeze(["fixture"]),verifiedAgainst:"fixture",ratifiedBy:"",ratifiedOn:"",
      body:item.modelProjection,modelProjection:item.modelProjection,fallback:item.fallback
    }));
  return Object.freeze({
    entries:Object.freeze(entries),
    kbVersion:`correctness6-${language}-${ids.join("-")}`
  });
}

const messages = Object.freeze({
  write: async (input:Record<string,unknown>) => Object.freeze({ ...input,redacted:false }),
  writeAndTransit: async (
    input:Record<string,unknown>,transit:(safeText:string)=>Promise<void>
  ) => {
    await transit(String(input.text));
    return Object.freeze({ ...input,redacted:false });
  },
  read:async () => null,
  listSession:async () => []
});

function contextFor(snapshot:ReturnType<typeof corpus>,language:"en"|"ro",query:string) {
  return buildSupportKnowledgeContext({
    entries:snapshot.entries,capabilities:SUPPORT_CAPABILITIES,language,query,historyText:"",
    maxCodePoints:24_000,availableActionIds:SUPPORT_ACTION_IDS,
    referenceFor:factory().referenceFor
  });
}

let clockValue = Date.parse("2026-09-17T19:00:00.000Z");
function service(snapshot:ReturnType<typeof corpus>,completionText:string,onCall = () => {}) {
  return createSupportAnswerService({
    entries:snapshot.entries,snapshots:createHelpCorpusSnapshotLookup(snapshot as never),
    messages:messages as never,modelReferenceFactory:factory,
    modelFor:() => Object.freeze({
      complete:async () => {
        onCall();
        return Object.freeze({ text:completionText });
      }
    }) as never,
    clock:() => new Date(++clockValue)
  });
}

function request(snapshot:ReturnType<typeof corpus>,language:"en"|"ro",text:string) {
  return {
    sessionId:"20000000-0000-4000-8000-000000000001",
    text,language,detectedLanguage:language,overrideLanguage:null,
    modelRef:"support-fixture",kbVersion:snapshot.kbVersion,snapshot,signedIn:true,
    receivedAt:new Date("2026-09-17T19:00:00.000Z")
  } as const;
}

function sorted(values:readonly string[]) { return [...values].sort(); }
const rows:Array<Record<string,unknown>> = [];
function record(name:string,language:string,result:Record<string,unknown>) {
  rows.push({ name,language,...result });
}

assert.deepEqual(SUPPORT_SOURCE_POLICIES,[{
  id:"your-and-public-debates",
  requiredActionIds:["your-debates","public-catalog"],
  requiredSourceIds:["app-navigation"],
  allowedSourceIds:["app-navigation","browse-public-debates"],
  recoverySourceIds:["app-navigation"]
}]);
assert.equal(supportSourceIdsSatisfyPolicy(["app-navigation"],POLICY),true);
assert.equal(supportSourceIdsSatisfyPolicy(["browse-public-debates","app-navigation"],POLICY),true);
assert.equal(supportSourceIdsSatisfyPolicy(["browse-public-debates"],POLICY),false);
assert.equal(supportSourceIdsSatisfyPolicy(
  ["app-navigation","getting-started-debate"],POLICY
),false);
assert.equal(selectSupportRecoveryEntry([
  { id:"browse-public-debates",fallback:"browse" },
  { id:"app-navigation",fallback:"app" }
],POLICY)?.id,"app-navigation");
assert.equal(selectSupportRecoveryEntry([{ id:"app-navigation",fallback:"app" }],{
  ...POLICY,recoverySourceIds:["browse-public-debates"]
}),undefined);
record("policy-helpers","both",{ assertions:6 });

for (const [name,query,expectedPolicy] of [
  ["ro-ordinary-unde","Unde găsesc dezbaterile mele și biblioteca publică?",true],
  ["ro-ordinary-deschid","Cum deschid Dezbaterile tale împreună cu Dezbateri publice?",true],
  ["ro-second-person","Deschizi Dezbaterile mele și Biblioteca de dezbateri publice?",true],
  ["ro-first-plural","Deschidem Dezbaterile mele și Biblioteca de dezbateri publice.",true],
  ["ro-polite-plural","Deschideți Dezbaterile mele și Biblioteca de dezbateri publice.",true],
  ["ro-negated","Unde găsesc dezbaterile publice? Nu deschide dezbaterile mele.",false],
  ["ro-noun-boundary","Deschiderea Dezbaterilor mele și Biblioteca de dezbateri publice.",false]
] as const) {
  const context = contextFor(corpus("ro"),"ro",query);
  assert.equal(context.sourcePolicy !== null,expectedPolicy);
  if (expectedPolicy) {
    assert.equal(context.sourceIds.includes("app-navigation"),true);
    assert.deepEqual([...context.requestedActionIds].sort(),["public-catalog","your-debates"]);
  }
  record(name,"ro",{
    query,sourcePolicy:context.sourcePolicy?.id ?? null,
    sourceIds:context.sourceIds,actionIds:context.requestedActionIds
  });
}

for (const language of ["en","ro"] as const) {
  const snapshot = corpus(language);
  const query = prompts[language];
  const context = contextFor(snapshot,language,query);
  assert.deepEqual(context.sourcePolicy,POLICY);
  assert.equal(context.sourceIds.includes("app-navigation"),true);
  assert.equal(context.sourceIds.every((id) => POLICY.allowedSourceIds.includes(id as never)),true);
  assert.equal(context.sourceIds.includes("getting-started-debate"),false);
  assert.deepEqual(sorted(context.requestedActionIds),["public-catalog","your-debates"]);
  const appEntry = snapshot.entries.find(({ id }) => id === "app-navigation")!;
  assert.equal(appEntry.modelProjection.includes("Your debates"),true);
  assert.equal(appEntry.modelProjection.includes("Public debates"),true);
  assert.equal(appEntry.fallback.includes("Your debates"),true);
  assert.equal(appEntry.fallback.includes("Public debates"),true);
  assert.equal(appEntry.fallback.includes(limitation[language]),true);
  record("producer-contract",language,{
    sourceIds:context.sourceIds,actionIds:context.requestedActionIds,
    policy:context.sourcePolicy
  });

  const sourceRef = new Map(context.sourceReferences.map((item) => [
    item.canonicalId,item.reference
  ]));
  const actionRef = new Map(context.actionReferences.map((item) => [
    item.canonicalId,item.reference
  ]));
  const app = sourceRef.get("app-navigation")!;
  const browse = sourceRef.get("browse-public-debates")!;
  const actions = [
    actionRef.get("your-debates")!,actionRef.get("public-catalog")!
  ];

  for (const [index,sourceIds] of [
    [1,[app]],
    [2,[app,browse]],
    [3,[browse,app]]
  ] as const) {
    const modelText = `accepted-${language}-${index}`;
    const draft = JSON.stringify({ kind:"answer",text:modelText,sourceIds,actionIds:actions });
    const result = await service(snapshot,draft).respond(request(snapshot,language,query) as never);
    const expectedSources = sourceIds.map((reference) =>
      context.sourceReferences.find((item) => item.reference === reference)!.canonicalId);
    assert.equal(result.outcome,"ANSWER_GROUNDED");
    assert.equal(result.text,modelText);
    assert.deepEqual(sorted(result.sources?.map(({ id }) => id) ?? []),sorted(expectedSources));
    assert.deepEqual(sorted(result.actions?.map(({ id }) => id) ?? []),[
      "public-catalog","your-debates"
    ]);
    record(`accepted-order-${index}`,language,{
      outcome:result.outcome,text:result.text,
      sources:result.sources?.map(({ id }) => id),
      actions:result.actions?.map(({ id }) => id)
    });
  }

  for (const [name,sourceIds] of [
    ["browse-only",[browse]],
    ["unrelated",[app,"getting-started-debate"]]
  ] as const) {
    const draft = JSON.stringify({
      kind:"answer",text:`unsafe-${name}-${language}`,sourceIds,actionIds:actions
    });
    const result = await service(snapshot,draft).respond(request(snapshot,language,query) as never);
    assert.equal(result.outcome,"ANSWER_GROUNDED");
    assert.equal(result.text,appEntry.fallback);
    assert.deepEqual(result.sources?.map(({ id }) => id),["app-navigation"]);
    assert.deepEqual(sorted(result.actions?.map(({ id }) => id) ?? []),[
      "public-catalog","your-debates"
    ]);
    record(`rejected-${name}-recovery`,language,{
      outcome:result.outcome,textMatchesRequiredFallback:result.text === appEntry.fallback,
      sources:result.sources?.map(({ id }) => id),
      actions:result.actions?.map(({ id }) => id)
    });
  }

  const malformed = await service(snapshot,"not-json").respond(
    request(snapshot,language,query) as never
  );
  assert.equal(malformed.outcome,"ANSWER_GROUNDED");
  assert.equal(malformed.text,appEntry.fallback);
  assert.deepEqual(malformed.sources?.map(({ id }) => id),["app-navigation"]);
  record("malformed-recovery",language,{
    outcome:malformed.outcome,sources:malformed.sources?.map(({ id }) => id),
    actions:malformed.actions?.map(({ id }) => id)
  });

  const incomplete = corpus(language,["browse-public-debates","getting-started-debate"]);
  let modelCalls = 0;
  const noSource = await service(incomplete,"not-used",() => { modelCalls += 1; }).respond(
    request(incomplete,language,query) as never
  );
  assert.equal(noSource.outcome,"NO_SOURCE");
  assert.deepEqual(noSource.sources,[]);
  assert.deepEqual(noSource.actions,[]);
  assert.equal(modelCalls,0);
  record("missing-required-source",language,{
    outcome:noSource.outcome,sources:noSource.sources,actions:noSource.actions,modelCalls
  });

  const otherQuery = otherPrompts[language];
  const otherContext = contextFor(snapshot,language,otherQuery);
  assert.equal(otherContext.sourcePolicy,null);
  assert.deepEqual(otherContext.requestedActionIds,["public-catalog"]);
  const otherDraft = JSON.stringify({
    kind:"answer",text:`other-intent-${language}`,
    sourceIds:[otherContext.sourceReferences[0]!.reference],
    actionIds:[otherContext.actionReferences[0]!.reference]
  });
  const other = await service(snapshot,otherDraft).respond(
    request(snapshot,language,otherQuery) as never
  );
  assert.equal(other.outcome,"ANSWER_GROUNDED");
  assert.equal(other.text,`other-intent-${language}`);
  assert.deepEqual(other.actions?.map(({ id }) => id),["public-catalog"]);
  record("normal-other-intent",language,{
    outcome:other.outcome,sources:other.sources?.map(({ id }) => id),
    actions:other.actions?.map(({ id }) => id),sourcePolicy:otherContext.sourcePolicy
  });
}

console.log(JSON.stringify({
  revision:"0b9320eae5a0ad8c9fcc9648ed85ebef1b289c13",
  cases:rows.length,
  rows,
  failures:[]
},null,2));
