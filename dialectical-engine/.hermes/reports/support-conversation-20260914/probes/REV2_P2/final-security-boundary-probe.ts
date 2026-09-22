import { redactSupportText } from "/Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine/.worktrees/support-conversation-cp1/dialectical-engine/packages/kernel/src/index.ts";
import {
  diagnoseSupportDraft,parseSupportCaseSummaryDraft,parseSupportDraft,projectSupportDraftReport
} from "/Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine/.worktrees/support-conversation-cp1/dialectical-engine/apps/api/src/support/response-policy.ts";
import {
  createSupportModelReferenceFactory,translateSupportDraftReferences
} from "/Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine/.worktrees/support-conversation-cp1/dialectical-engine/apps/api/src/support/model-references.ts";
import { createSupportAnswerService } from "/Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine/.worktrees/support-conversation-cp1/dialectical-engine/apps/api/src/support/answer.ts";
import { redactSupportMessage,type SupportMessageCipherPort } from "/Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine/.worktrees/support-conversation-cp1/dialectical-engine/apps/api/src/support/session.ts";
import {
  createHelpCorpusSnapshotLookup,type HelpCorpusEntry,type LoadedHelpCorpus
} from "/Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine/.worktrees/support-conversation-cp1/dialectical-engine/packages/support-kb/src/index.ts";
import {
  SUPPORT_ACTION_CATALOG,SUPPORT_ACTION_IDS,SUPPORT_CAPABILITIES
} from "/Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine/.worktrees/support-conversation-cp1/dialectical-engine/packages/support-kb/src/catalog.ts";

const REVISION = "e0dcfe77f49655bea774bdfacf988b911be4ff06";
const REQUEST_A = "10000000-0000-4000-8000-000000000001";
const REQUEST_B = "20000000-0000-4000-8000-000000000002";

function raw(text: string,sourceIds: string[] = ["s-10000000000040008000000000000001-1"],actionIds: string[] = []) {
  return JSON.stringify({ kind:"answer",text,sourceIds,actionIds });
}

function summary(text: string) {
  return JSON.stringify({ kind:"case_summary",text,sourceIds:[],actionIds:[] });
}

function policy(text: string) {
  const value = raw(text);
  const diagnostic = diagnoseSupportDraft(value,["s-10000000000040008000000000000001-1"],[]);
  return Object.freeze({
    text,accepted:parseSupportDraft(value) !== null,
    code:diagnostic.code,predicate:diagnostic.predicate
  });
}

const redactionInputs = Object.freeze([
  "My recovery code is «inert amber fern».",
  "My recovery code is \"inert amber fern",
  "My recovery code is amber birch cedar dogwood elm fir grove; keep it private.",
  "My reset token is inert.alpha.beta; keep it private.",
  "I forgot my password and need the ordinary recovery instructions.",
  "Am uitat parola și am nevoie de instrucțiuni obișnuite."
]);

const policyInputs = Object.freeze([
  "Support does not request or receive passwords.",
  "Support cannot receive passwords. You can change your display name in Settings.",
  "Support cannot receive passwords. You can change this display name in Settings.",
  "Support cannot receive passwords. Send those here.",
  "Support does not ask for passwords and may receive them.",
  "Support does not ask for passwords, plus it may receive them.",
  "Asistența nu cere parole și poate primi acestea.",
  "Send your %2525252570assword to Support.",
  "Open https%252525253A%252525252F%252525252Fexample.test/reset",
  "Open %5Csettings to continue.",
  "Open https%3G%2F%2Fexample.test/reset",
  "Progress is 87.5% complete.",
  "Select start%2Ddebate to continue.",
  "Select Forgot password to continue."
]);

const closedHyphenatedIds = Object.freeze([...new Set([
  ...SUPPORT_ACTION_IDS,
  ...SUPPORT_CAPABILITIES.map(({ id }) => id),
  ...SUPPORT_CAPABILITIES.flatMap(({ articleIds }) => articleIds)
])].filter((id) => id.includes("-")));

const exactIdResults = closedHyphenatedIds.map((id) => Object.freeze({
  id,accepted:parseSupportDraft(raw(`Select ${id} to continue.`)) !== null
}));
const transformedIdResults = [
  "Select START-DEBATE to continue.",
  "Select start%2Ddebate to continue.",
  "Select start-\u200Bdebate to continue."
].map((text) => Object.freeze({ text,accepted:parseSupportDraft(raw(text)) !== null }));
const labelResults = [
  ...SUPPORT_ACTION_CATALOG.flatMap(({ labels }) => [labels.en,labels.ro]),
  ...SUPPORT_CAPABILITIES.flatMap(({ labels }) => [labels.en,labels.ro])
].map((label) => Object.freeze({
  label,accepted:parseSupportDraft(raw(`Feature label: ${label}.`)) !== null
}));

const directA = createSupportModelReferenceFactory(REQUEST_A);
const directB = createSupportModelReferenceFactory(REQUEST_B);
const aSource = directA.referenceFor("source",0);
const aAction = directA.referenceFor("action",0);
const bSource = directB.referenceFor("source",0);
const bAction = directB.referenceFor("action",0);
const directMap = Object.freeze({
  sources:Object.freeze([{ reference:aSource,canonicalId:"getting-started-debate" }]),
  actions:Object.freeze([{ reference:aAction,canonicalId:"start-debate" as const }])
});
const directDraft = Object.freeze({
  kind:"answer" as const,text:"Choose Start a debate to continue.",
  sourceIds:Object.freeze([aSource]),actionIds:Object.freeze([aAction])
});

const entry: HelpCorpusEntry = Object.freeze({
  id:"getting-started-debate",lang:"en",title:"Start a debate",status:"shipped",
  sources:Object.freeze(["synthetic-fixture"]),verifiedAgainst:"synthetic-fixture",
  ratifiedBy:"V",ratifiedOn:"2026-09-01",
  body:"A visitor can create a debate from the dashboard and choose its plan controls."
});
const snapshot = Object.freeze({
  entries:Object.freeze([entry]),kbVersion:"a".repeat(64)
}) as LoadedHelpCorpus;

function references(system: string): Readonly<{ sources:string[];actions:string[] }> {
  const read = (key: string) => system.match(new RegExp(`^${key}=(.*)$`,"mu"))?.[1]
    ?.split(",").filter((value) => value !== "" && value !== "none") ?? [];
  return Object.freeze({ sources:read("sourceIds"),actions:read("actionIds") });
}

type DraftBuilder = (refs: Readonly<{ sources:string[];actions:string[] }>) => Readonly<{
  text:string;sourceIds:string[];actionIds:string[];
}>;

async function answerCase(
  id: string,requestId: string,userText: string,draftFor: DraftBuilder
) {
  const stored: Array<Record<string,unknown>> = [];
  const transit: string[] = [];
  const systems: string[] = [];
  const diagnostics: unknown[] = [];
  const messages = Object.freeze({
    write: async (input: Record<string,unknown>) => {
      const prepared = redactSupportMessage(String(input.text));
      const record = Object.freeze({ ...input,text:prepared.text,redacted:prepared.redacted });
      stored.push(record);
      return record;
    },
    writeAndTransit: async (
      input: Record<string,unknown>,send: (text: string) => Promise<void>
    ) => {
      const prepared = redactSupportMessage(String(input.text));
      transit.push(prepared.text);
      await send(prepared.text);
      const record = Object.freeze({ ...input,text:prepared.text,redacted:prepared.redacted });
      stored.push(record);
      return record;
    },
    read: async () => null,listSession: async () => []
  }) as unknown as SupportMessageCipherPort;
  const service = createSupportAnswerService({
    entries:snapshot.entries,snapshots:createHelpCorpusSnapshotLookup(snapshot),messages,
    modelReferenceFactory:() => createSupportModelReferenceFactory(requestId),
    reportDraftDiagnostic:(diagnostic) => diagnostics.push(projectSupportDraftReport(diagnostic)),
    modelFor:() => Object.freeze({ complete:async (input: Readonly<{system:string}>) => {
      systems.push(input.system);
      const draft = draftFor(references(input.system));
      return Object.freeze({ text:JSON.stringify({ kind:"answer",...draft }) });
    } }) as never,
    clock:(() => { let at = Date.parse("2026-09-14T10:00:00.000Z");return () => new Date(++at); })()
  });
  const result = await service.respond({
    sessionId:"30000000-0000-4000-8000-000000000003",
    text:userText,language:"en",detectedLanguage:"en",overrideLanguage:null,
    modelRef:"synthetic-model",kbVersion:snapshot.kbVersion,snapshot,signedIn:false,
    receivedAt:new Date("2026-09-14T10:00:00.000Z")
  });
  return Object.freeze({
    id,outcome:result.outcome,returnedText:result.text,
    sources:result.sources,actions:result.actions,
    userStored:stored.filter((row) => row.role === "user").map((row) => row.text),
    assistantStored:stored.filter((row) => row.role === "assistant").map((row) => row.text),
    transit,diagnostics,systems
  });
}

const validDraft: DraftBuilder = (refs) => ({
  text:"Choose Start a debate to continue.",sourceIds:[refs.sources[0]!],
  actionIds:refs.actions.length === 0 ? [] : [refs.actions[0]!]
});

const answerCases = await Promise.all([
  answerCase("valid-current-map",REQUEST_A,"How do I create a debate?",validDraft),
  answerCase("stale-cross-request",REQUEST_B,"How do I create a debate?",() => ({
    text:"Choose Start a debate to continue.",sourceIds:[aSource],actionIds:[aAction]
  })),
  answerCase("unknown-reference",REQUEST_A,"How do I create a debate?",() => ({
    text:"Choose Start a debate to continue.",
    sourceIds:["s-ffffffffffffffffffffffffffffffff-1"],actionIds:[]
  })),
  answerCase("duplicate-reference",REQUEST_A,"How do I create a debate?",(refs) => ({
    text:"Choose Start a debate to continue.",
    sourceIds:[refs.sources[0]!,refs.sources[0]!],actionIds:[]
  })),
  answerCase("current-alias-in-prose",REQUEST_A,"How do I create a debate?",(refs) => ({
    text:`Use ${refs.sources[0]} to continue.`,sourceIds:[refs.sources[0]!],actionIds:[]
  })),
  answerCase("canonical-id-in-prose",REQUEST_A,"How do I create a debate?",(refs) => ({
    text:"Use getting-started-debate to continue.",sourceIds:[refs.sources[0]!],actionIds:[]
  })),
  answerCase("transformed-coordinator",REQUEST_A,"How do I create a debate?",(refs) => ({
    text:"Support does not ask for passwords and may receive them.",
    sourceIds:[refs.sources[0]!],actionIds:[]
  })),
  answerCase("encoded-backslash",REQUEST_A,"How do I create a debate?",(refs) => ({
    text:"Open %5Csettings to continue.",sourceIds:[refs.sources[0]!],actionIds:[]
  })),
  answerCase("bounded-deep-credential",REQUEST_A,"How do I create a debate?",(refs) => ({
    text:"Send your %2525252570assword to Support.",sourceIds:[refs.sources[0]!],actionIds:[]
  })),
  answerCase("bounded-deep-link",REQUEST_A,"How do I create a debate?",(refs) => ({
    text:"Open https%252525253A%252525252F%252525252Fexample.test/reset",
    sourceIds:[refs.sources[0]!],actionIds:[]
  })),
  answerCase("encoded-exact-id",REQUEST_A,"How do I create a debate?",(refs) => ({
    text:"Select start%2Ddebate to continue.",sourceIds:[refs.sources[0]!],actionIds:[]
  })),
  answerCase("input-redaction-sink",REQUEST_A,
    "How do I create a debate? My recovery code is \"inert amber fern",validDraft)
]);

const currentSystem = answerCases.find(({ id }) => id === "valid-current-map")!.systems[0]!;
const forbiddenContextTokens = [
  ...closedHyphenatedIds,
  ...SUPPORT_CAPABILITIES.map(({ route }) => route),
  ...SUPPORT_ACTION_CATALOG.flatMap(({ href }) => href === null ? [] : [href]),
  "route=","repository","verifiedAgainst","synthetic-fixture"
];
const contextLeaks = [...new Set(forbiddenContextTokens)]
  .filter((token) => token !== "/" && token.length > 1 && currentSystem.includes(token));

const summaryResults = [
  "Support cannot receive passwords. You can change your display name in Settings.",
  "Support cannot receive passwords. You can change this display name in Settings.",
  "Support does not ask for passwords and may receive them.",
  "Open %5Csettings to continue.",
  "Send your %2525252570assword to Support.",
  "Open https%252525253A%252525252F%252525252Fexample.test/reset",
  "Select start%2Ddebate to continue.",
  "Select Forgot password to continue."
].map((text) => Object.freeze({
  text,accepted:parseSupportCaseSummaryDraft(summary(text)) !== null
}));

const diagnostic = diagnoseSupportDraft(
  raw("Send your %2525252570assword to Support."),[aSource],[]
);
const projection = projectSupportDraftReport({
  ...diagnostic,attemptId:REQUEST_A,rawCompletion:"must-not-project",
  sourceId:"must-not-project",actionId:"must-not-project"
} as never);

console.log(JSON.stringify({
  revision:REVISION,
  substrate:"actual TypeScript modules; in-memory model and cipher/message ports; no socket, HTTP, database, browser, preview, relay, provider, or account traffic",
  redaction:redactionInputs.map((input) => ({ input,...redactSupportText(input) })),
  policy:policyInputs.map(policy),
  identifiers:{
    exactHyphenatedCount:closedHyphenatedIds.length,
    exactAccepted:exactIdResults.filter(({ accepted }) => accepted),
    transformed:transformedIdResults,
    labelCount:labelResults.length,labelRejected:labelResults.filter(({ accepted }) => !accepted)
  },
  mapping:{
    requestA:{ source:aSource,action:aAction },requestB:{ source:bSource,action:bAction },
    valid:translateSupportDraftReferences(directDraft,directMap),
    stale:translateSupportDraftReferences({ ...directDraft,sourceIds:[bSource] },directMap),
    unknown:translateSupportDraftReferences({ ...directDraft,sourceIds:["s-ffffffffffffffffffffffffffffffff-1"] },directMap),
    duplicate:translateSupportDraftReferences({ ...directDraft,sourceIds:[aSource,aSource] },directMap)
  },
  context:{ codePoints:[...currentSystem].length,leaks:contextLeaks },
  answerCases:answerCases.map(({ systems,...row }) => ({ ...row,systemCodePoints:[...systems[0]!].length })),
  summary:summaryResults,
  diagnosticProjection:{ keys:Object.keys(projection).sort(),value:projection }
},null,2));
