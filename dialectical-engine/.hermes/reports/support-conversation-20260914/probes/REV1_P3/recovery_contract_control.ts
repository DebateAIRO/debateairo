import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import { createSupportAnswerService } from "/Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine/.worktrees/support-cp1-p3-correctness/dialectical-engine/apps/api/src/support/answer.ts";
import {
  loadHelpCorpus,type HelpCorpusEntry,type LoadedHelpCorpus
} from "/Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine/.worktrees/support-cp1-p3-correctness/dialectical-engine/packages/support-kb/src/index.ts";
import { buildSupportKnowledgeContext } from "/Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine/.worktrees/support-cp1-p3-correctness/dialectical-engine/packages/support-kb/src/context.ts";
import {
  SUPPORT_ACTION_CATALOG,SUPPORT_ACTION_IDS,SUPPORT_CAPABILITIES,SUPPORT_PAGE_ROUTES
} from "/Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine/.worktrees/support-cp1-p3-correctness/dialectical-engine/packages/support-kb/src/catalog.ts";
import { isSupportRecoveryTextSafe } from "/Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine/.worktrees/support-cp1-p3-correctness/dialectical-engine/packages/support-kb/src/recovery.ts";

const PRODUCT = "/Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine/.worktrees/support-cp1-p3-correctness/dialectical-engine";
const REVISION = "5cbfc6d483aae0f56eabfdee00a6829e09e76c3d";
const FALLBACK = "Choose Start a debate to continue with the reviewed creation guidance.";
const USAGE = Object.freeze({ input_tokens: 13,output_tokens: 5,cost_usd: 0.003 });

type Stored = Readonly<Record<string, unknown>>;
type CompletionFactory = (system: string) => string;

function snapshot(entry: HelpCorpusEntry): LoadedHelpCorpus {
  return Object.freeze({
    entries: Object.freeze([entry]),
    kbVersion: "b".repeat(64)
  }) as LoadedHelpCorpus;
}

function refs(system: string): Readonly<{ source: string; action: string }> {
  const source = /sourceIds=([^,\n]+)/u.exec(system)?.[1];
  const action = /actionIds=([^,\n]+)/u.exec(system)?.[1];
  assert.ok(source && source !== "none","source reference must be present");
  assert.ok(action && action !== "none","action reference must be present");
  return { source,action };
}

async function exercise(input: Readonly<{
  name: string;
  completion: CompletionFactory;
  fallback?: string;
}>) {
  const writes: Stored[] = [];
  const diagnostics: Stored[] = [];
  let modelCalls = 0;
  let system = "";
  const entry = Object.freeze({
    id: "getting-started-debate",
    lang: "en" as const,
    title: "Start a debate",
    status: "shipped" as const,
    sources: Object.freeze(["review-probe"]),
    verifiedAgainst: REVISION,
    ratifiedBy: "V" as const,
    ratifiedOn: "2026-09-16",
    body: "The visitor can start a debate using the reviewed creation flow.",
    modelProjection: "A visitor can choose Start a debate, then provide a topic and plan controls.",
    ...(input.fallback === undefined ? {} : { fallback: input.fallback })
  });
  const corpus = snapshot(entry);
  const service = createSupportAnswerService({
    entries: corpus.entries,
    snapshots: { get: (version: string) => version === corpus.kbVersion ? corpus : undefined },
    messages: {
      write: async (value: Stored) => { writes.push(value); return { ...value,redacted: false }; },
      writeAndTransit: async (value: Stored,transit: (text: string) => Promise<void>) => {
        writes.push(value);
        await transit(String(value.text));
        return { ...value,redacted: false };
      },
      read: async () => null,
      listSession: async () => []
    } as never,
    reportDraftDiagnostic: (value) => { diagnostics.push(value as unknown as Stored); },
    modelFor: () => ({ complete: async (request: Readonly<{ system: string }>) => {
      modelCalls += 1;
      system = request.system;
      return Object.freeze({ text: input.completion(request.system),usage: USAGE });
    } }) as never,
    clock: (() => { let at = Date.parse("2026-09-16T08:00:00.000Z"); return () => new Date(++at); })()
  });
  const result = await service.respond({
    sessionId: `review-${input.name}`,
    text: "How do I start my first debate?",
    language: "en",
    detectedLanguage: "en",
    overrideLanguage: null,
    modelRef: "inert-review-probe",
    kbVersion: corpus.kbVersion,
    snapshot: corpus,
    signedIn: false,
    receivedAt: new Date("2026-09-16T08:00:01.000Z")
  });
  return { name:input.name,result,writes,diagnostics,modelCalls,system };
}

const rejectedCases: ReadonlyArray<Readonly<{ name: string; completion: CompletionFactory }>> = [
  { name:"json",completion:() => "REJECTED_JSON_BYTES" },
  { name:"kind",completion:(system) => {
    const { source } = refs(system);
    return JSON.stringify({ kind:"tool",text:"REJECTED_KIND_BYTES",sourceIds:[source],actionIds:[] });
  } },
  { name:"schema",completion:(system) => {
    const { source } = refs(system);
    return JSON.stringify({ kind:"answer",text:"REJECTED_SCHEMA_BYTES",sourceIds:[source],actionIds:[],extra:true });
  } },
  { name:"source",completion:() => JSON.stringify({
    kind:"answer",text:"REJECTED_SOURCE_BYTES",sourceIds:["s-99999999999949998999999999999999-1"],actionIds:[]
  }) },
  { name:"unsafe_text",completion:(system) => {
    const { source } = refs(system);
    return JSON.stringify({
      kind:"answer",text:"REJECTED_UNSAFE_BYTES Type your password here.",sourceIds:[source],actionIds:[]
    });
  } }
];

const accepted = await exercise({
  name:"accepted",
  fallback:FALLBACK,
  completion:(system) => {
    const { source,action } = refs(system);
    return JSON.stringify({
      kind:"answer",text:"Choose Start a debate to continue.",sourceIds:[source],actionIds:[action]
    });
  }
});
assert.equal(accepted.modelCalls,1);
assert.equal(accepted.result.outcome,"ANSWER_GROUNDED");
assert.equal(accepted.result.text,"Choose Start a debate to continue.");
assert.deepEqual(accepted.result.sources,[{ id:"getting-started-debate",label:"Start a debate" }]);
assert.deepEqual(accepted.result.actions,[{
  id:"start-debate",label:"Start a debate",href:"/login?next=%2Fnew"
}]);
assert.deepEqual(accepted.result.usage,USAGE);
assert.equal(accepted.diagnostics.length,0);
assert.ok([...accepted.system].length <= 24_000);

const rejectedResults = [];
for (const fixture of rejectedCases) {
  const observed = await exercise({ ...fixture,fallback:FALLBACK });
  assert.equal(observed.modelCalls,1,`${fixture.name}: one model call`);
  assert.equal(observed.result.outcome,"ANSWER_GROUNDED",`${fixture.name}: grounded recovery`);
  assert.equal(observed.result.text,FALLBACK,`${fixture.name}: exact fallback`);
  assert.deepEqual(observed.result.sources,[{ id:"getting-started-debate",label:"Start a debate" }]);
  assert.deepEqual(observed.result.actions,[{
    id:"start-debate",label:"Start a debate",href:"/login?next=%2Fnew"
  }]);
  assert.deepEqual(observed.result.usage,USAGE);
  assert.equal(observed.diagnostics.length,1,`${fixture.name}: one bounded diagnostic`);
  const stored = JSON.stringify(observed.writes);
  assert.equal(stored.includes("REJECTED_"),false,`${fixture.name}: rejected bytes absent from storage`);
  assert.equal(JSON.stringify(observed.result).includes("REJECTED_"),false,`${fixture.name}: rejected bytes absent from response`);
  rejectedResults.push({ name:fixture.name,outcome:observed.result.outcome });
}

for (const fixture of [
  { name:"missing_fallback",fallback:undefined },
  { name:"unsafe_fallback",fallback:"Type your password here." }
] as const) {
  const observed = await exercise({
    name:fixture.name,
    ...(fixture.fallback === undefined ? {} : { fallback:fixture.fallback }),
    completion:() => "REJECTED_REFUSAL_BYTES"
  });
  assert.equal(observed.modelCalls,1);
  assert.equal(observed.result.outcome,"REFUSE_SAFETY");
  assert.deepEqual(observed.result.sources,[]);
  assert.deepEqual(observed.result.actions,[]);
  assert.deepEqual(observed.result.usage,USAGE);
  assert.equal(JSON.stringify(observed.writes).includes("REJECTED_REFUSAL_BYTES"),false);
  assert.equal(JSON.stringify(observed.result).includes("REJECTED_REFUSAL_BYTES"),false);
}

const reviewManifest = JSON.parse(readFileSync(`${PRODUCT}/packages/support-kb/reviews/manifest.json`,"utf8"));
const recoveryComponents = readFileSync(`${PRODUCT}/packages/support-kb/recovery/components.json`);
const loaded = loadHelpCorpus(`${PRODUCT}/packages/support-kb/content`,{
  reviewManifest,recoveryComponents,requireReviewedRecovery:true
});
assert.equal(loaded.entries.length,36);
assert.equal(loaded.entries.filter(({ lang }) => lang === "en").length,18);
assert.equal(loaded.entries.filter(({ lang }) => lang === "ro").length,18);
assert.equal(new Set(loaded.entries.map(({ id,lang }) => `${id}.${lang}`)).size,36);
assert.equal(Object.isFrozen(loaded),true);
assert.equal(Object.isFrozen(loaded.entries),true);
for (const entry of loaded.entries) {
  assert.equal(typeof entry.modelProjection,"string");
  assert.equal(typeof entry.fallback,"string");
  assert.equal(entry.recoveryReview !== undefined,true);
  assert.equal(isSupportRecoveryTextSafe(entry.modelProjection!),true,`${entry.id}.${entry.lang}: projection`);
  assert.equal(isSupportRecoveryTextSafe(entry.fallback!),true,`${entry.id}.${entry.lang}: fallback`);
}

const canonicalIds = [
  ...SUPPORT_ACTION_IDS,
  ...SUPPORT_CAPABILITIES.map(({ id }) => id),
  ...SUPPORT_CAPABILITIES.flatMap(({ articleIds }) => articleIds)
].filter((value) => value.includes("-"));
const routes = [
  ...SUPPORT_PAGE_ROUTES.filter((route) => route !== "/"),
  ...SUPPORT_ACTION_CATALOG.flatMap(({ href }) => href === null ? [] : [href]).filter((href) => href !== "/")
];
let contexts = 0;
for (const language of ["en","ro"] as const) {
  for (const capability of SUPPORT_CAPABILITIES) {
    const context = buildSupportKnowledgeContext({
      entries:loaded.entries,
      capabilities:SUPPORT_CAPABILITIES,
      language,
      query:`${capability.labels[language]} ${capability.searchTerms[language].join(" ")}`,
      historyText:"",
      maxCodePoints:24_000,
      availableActionIds:SUPPORT_ACTION_IDS,
      referenceFor:(kind,index) => `${kind === "source" ? "sprobe" : "aprobe"}-${index + 1}`
    });
    assert.ok([...context.text].length <= 24_000);
    assert.ok(context.sourceIds.length <= 3);
    for (const id of canonicalIds) assert.equal(context.text.includes(id),false,`${language}/${capability.id}: ${id}`);
    for (const route of routes) assert.equal(context.text.includes(route),false,`${language}/${capability.id}: ${route}`);
    assert.equal(/(?:apps|packages|tests|tools)\/[a-z0-9_.\/[\]-]+/iu.test(context.text),false);
    contexts += 1;
  }
}

process.stdout.write(JSON.stringify({
  status:"PASS",
  frozenProduct:REVISION,
  directService:{
    accepted:{ modelCalls:accepted.modelCalls,outcome:accepted.result.outcome },
    recovered:rejectedResults,
    refusalControls:["missing_fallback","unsafe_fallback"],
    exactUsage:USAGE
  },
  exactCorpus:{
    entries:loaded.entries.length,
    en:loaded.entries.filter(({ lang }) => lang === "en").length,
    ro:loaded.entries.filter(({ lang }) => lang === "ro").length,
    contexts
  }
}) + "\n");
