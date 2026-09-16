import { redactSupportText } from "/Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine/.worktrees/support-cp1-p3-security/dialectical-engine/packages/kernel/src/index.ts";
import {
  diagnoseSupportDraft,parseSupportCaseSummaryDraft,parseSupportDraft,projectSupportDraftReport
} from "/Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine/.worktrees/support-cp1-p3-security/dialectical-engine/apps/api/src/support/response-policy.ts";
import {
  createSupportModelReferenceFactory,translateSupportDraftReferences
} from "/Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine/.worktrees/support-cp1-p3-security/dialectical-engine/apps/api/src/support/model-references.ts";
import { createSupportAnswerService } from "/Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine/.worktrees/support-cp1-p3-security/dialectical-engine/apps/api/src/support/answer.ts";
import { redactSupportMessage,type SupportMessageCipherPort } from "/Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine/.worktrees/support-cp1-p3-security/dialectical-engine/apps/api/src/support/session.ts";
import {
  createHelpCorpusSnapshotLookup,type HelpCorpusEntry,type LoadedHelpCorpus
} from "/Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine/.worktrees/support-cp1-p3-security/dialectical-engine/packages/support-kb/src/index.ts";
import {
  SUPPORT_ACTION_CATALOG,SUPPORT_ACTION_IDS,SUPPORT_CAPABILITIES
} from "/Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine/.worktrees/support-cp1-p3-security/dialectical-engine/packages/support-kb/src/catalog.ts";
import { consumeSupportDiagnosticWindow } from "/Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine/.hermes/reports/support-conversation-20260914/probes/HARNESS_P2/diagnostic-consumer.mjs";
import { classifySupportResponseEvidence } from "/Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine/.hermes/reports/support-conversation-20260914/probes/LIVE_P2/response-evidence.mjs";

const REVISION = "5cbfc6d483aae0f56eabfdee00a6829e09e76c3d";
const REQUEST_A = "31000000-0000-4000-8000-000000000031";
const REQUEST_B = "32000000-0000-4000-8000-000000000032";
const SOURCE_ALIAS = "s-31000000000040008000000000000031-1";

function raw(text: string,sourceIds: string[] = [SOURCE_ALIAS],actionIds: string[] = []) {
  return JSON.stringify({ kind:"answer",text,sourceIds,actionIds });
}
function summary(text: string) {
  return JSON.stringify({ kind:"case_summary",text,sourceIds:[],actionIds:[] });
}
function policy(text: string) {
  const encoded = raw(text);
  const diagnostic = diagnoseSupportDraft(encoded,[SOURCE_ALIAS],[]);
  return Object.freeze({ text,accepted:parseSupportDraft(encoded) !== null,
    code:diagnostic.code,predicate:diagnostic.predicate });
}

const redactionCases = Object.freeze([
  { id:"closed-quote",input:"My recovery code is «quartz amber fern»; keep it private.",fragments:["quartz","amber","fern"] },
  { id:"unmatched-quote",input:"My recovery code is \"willow amber fern cedar; keep it private.",fragments:["willow","amber","fern","cedar"] },
  { id:"over-bound",input:"My reset token is amber birch cedar dogwood elm fir grove hazel ivy; keep it private.",fragments:["amber","birch","cedar","dogwood","elm","fir","grove","hazel","ivy"] },
  { id:"punctuation",input:"My reset token is quartz.alpha-beta_gamma; keep it private.",fragments:["quartz.alpha-beta_gamma"] },
  { id:"coordinator-in-value",input:"My reset token is quartz and ember; keep it private.",fragments:["quartz","ember"] },
  { id:"safe-negative",input:"My password is unavailable; show ordinary recovery guidance.",fragments:[] }
]);
const redaction = redactionCases.map((item) => {
  const result = redactSupportText(item.input);
  const lowered = result.text.toLocaleLowerCase("en-US");
  return Object.freeze({ ...item,result,residualFragments:item.fragments.filter((part) =>
    lowered.includes(part.toLocaleLowerCase("en-US"))) });
});

const policyCases = Object.freeze([
  { id:"safe-negative",expected:"accept",text:"Support never asks for OTP codes." },
  { id:"positive-finite-after-negative",expected:"reject",text:"Support never asks for OTP codes, plus it accepts them." },
  { id:"positive-modal-after-negative",expected:"reject",text:"Support does not request passwords, plus it could receive them." },
  { id:"positive-additive-ro",expected:"reject",text:"Asistența nu cere parole, plus le poate primi." },
  { id:"safe-display-object",expected:"accept",text:"You may change this display name in Settings." },
  { id:"safe-profile-object",expected:"accept",text:"Support cannot change passwords; you can update the profile name." },
  { id:"unsafe-password-object",expected:"reject",text:"You can change the password and display name." },
  { id:"encoded-credential",expected:"reject",text:"Send your p%61ssword to Support." },
  { id:"deep-encoded-credential",expected:"reject",text:"Send your %2525252570assword to Support." },
  { id:"spaced-backslash",expected:"reject",text:"Open %5Csettings to continue." },
  { id:"equals-backslash",expected:"reject",text:"Open=%5Csettings to continue." },
  { id:"equals-drive",expected:"reject",text:"Path=C:%5Csettings to continue." },
  { id:"equals-unc",expected:"reject",text:"Network=%5C%5Cserver%5Cshare to continue." },
  { id:"decode-exhaustion",expected:"reject",text:"Open https%25252525253A%25252525252F%25252525252Fexample.test/reset" },
  { id:"benign-percent",expected:"accept",text:"Progress is 84% complete." },
  { id:"benign-malformed-percent",expected:"accept",text:"The label uses literal %5G text." }
]);
const policyResults = policyCases.map((item) => Object.freeze({ ...item,...policy(item.text) }));

const closedHyphenatedIds = Object.freeze([...new Set([
  ...SUPPORT_ACTION_IDS,
  ...SUPPORT_CAPABILITIES.map(({ id }) => id),
  ...SUPPORT_CAPABILITIES.flatMap(({ articleIds }) => articleIds)
])].filter((id) => id.includes("-")));
const exactIdResults = closedHyphenatedIds.map((id) => Object.freeze({
  id,accepted:parseSupportDraft(raw(`Choose ${id} to continue.`)) !== null
}));
const transformedIdResults = [
  "Choose START-DEBATE to continue.",
  "Choose start%2Ddebate to continue.",
  "Choose start-\u200Bdebate to continue."
].map((text) => Object.freeze({ text,accepted:parseSupportDraft(raw(text)) !== null }));
const labelResults = [
  ...SUPPORT_ACTION_CATALOG.flatMap(({ labels }) => [labels.en,labels.ro]),
  ...SUPPORT_CAPABILITIES.flatMap(({ labels }) => [labels.en,labels.ro])
].map((label) => Object.freeze({ label,accepted:parseSupportDraft(raw(`Feature label: ${label}.`)) !== null }));

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
const mapping = Object.freeze({
  requestA:{ source:aSource,action:aAction },requestB:{ source:bSource,action:bAction },
  valid:translateSupportDraftReferences(directDraft,directMap),
  stale:translateSupportDraftReferences({ ...directDraft,sourceIds:[bSource] },directMap),
  unknown:translateSupportDraftReferences({ ...directDraft,sourceIds:["s-ffffffffffffffffffffffffffffffff-1"] },directMap),
  duplicate:translateSupportDraftReferences({ ...directDraft,sourceIds:[aSource,aSource] },directMap)
});

const baseEntry: HelpCorpusEntry = Object.freeze({
  id:"getting-started-debate",lang:"en",title:"Start a debate",status:"shipped",
  sources:Object.freeze(["synthetic-fixture"]),verifiedAgainst:"synthetic-fixture",
  ratifiedBy:"V",ratifiedOn:"2026-09-01",
  body:"A visitor can create a debate from the dashboard and choose its plan controls.",
  modelProjection:"A visitor can start a debate after providing a topic and description.",
  fallback:"Use Start a debate after entering a topic and description."
});

function references(system: string): Readonly<{ sources:string[];actions:string[] }> {
  const read = (key: string) => system.match(new RegExp(`^${key}=(.*)$`,"mu"))?.[1]
    ?.split(",").filter((value) => value !== "" && value !== "none") ?? [];
  return Object.freeze({ sources:read("sourceIds"),actions:read("actionIds") });
}
type DraftBuilder = (refs: Readonly<{ sources:string[];actions:string[] }>) => Readonly<{
  text:string;sourceIds:string[];actionIds:string[];
}>;

async function answerCase(input: Readonly<{
  id:string;requestId:string;userText:string;draftFor:DraftBuilder;fallback:"valid"|"missing"|"invalid";
}>) {
  const entry = Object.freeze({ ...baseEntry,
    ...(input.fallback === "missing" ? { fallback:undefined }
      : input.fallback === "invalid" ? { fallback:"Send your password to Support." } : {})
  }) as HelpCorpusEntry;
  const snapshot = Object.freeze({ entries:Object.freeze([entry]),kbVersion:"a".repeat(64) }) as LoadedHelpCorpus;
  const stored: Array<Record<string,unknown>> = [];
  const transit: string[] = [];
  const systems: string[] = [];
  const diagnostics: unknown[] = [];
  const completions: string[] = [];
  let modelCalls = 0;
  const messages = Object.freeze({
    write: async (message: Record<string,unknown>) => {
      const prepared = redactSupportMessage(String(message.text));
      const record = Object.freeze({ ...message,text:prepared.text,redacted:prepared.redacted });
      stored.push(record);return record;
    },
    writeAndTransit: async (message: Record<string,unknown>,send: (text:string) => Promise<void>) => {
      const prepared = redactSupportMessage(String(message.text));transit.push(prepared.text);
      await send(prepared.text);
      const record = Object.freeze({ ...message,text:prepared.text,redacted:prepared.redacted });
      stored.push(record);return record;
    },
    read: async () => null,listSession: async () => []
  }) as unknown as SupportMessageCipherPort;
  const service = createSupportAnswerService({
    entries:snapshot.entries,snapshots:createHelpCorpusSnapshotLookup(snapshot),messages,
    modelReferenceFactory:() => createSupportModelReferenceFactory(input.requestId),
    reportDraftDiagnostic:(diagnostic) => diagnostics.push(projectSupportDraftReport(diagnostic)),
    modelFor:() => Object.freeze({ complete:async (request: Readonly<{system:string}>) => {
      modelCalls += 1;systems.push(request.system);
      const draft = input.draftFor(references(request.system));
      const completion = JSON.stringify({ kind:"answer",...draft });
      completions.push(completion);return Object.freeze({ text:completion });
    } }) as never,
    clock:(() => { let at=Date.parse("2026-09-16T10:00:00.000Z");return () => new Date(++at); })()
  });
  const result = await service.respond({
    sessionId:"33000000-0000-4000-8000-000000000033",text:input.userText,
    language:"en",detectedLanguage:"en",overrideLanguage:null,modelRef:"synthetic-model",
    kbVersion:snapshot.kbVersion,snapshot,signedIn:false,
    receivedAt:new Date("2026-09-16T10:00:00.000Z")
  });
  const sink = JSON.stringify({ result,stored,transit,diagnostics });
  const completion = completions[0] ?? "";
  const completionDraft = completion === "" ? null : JSON.parse(completion) as Record<string,unknown>;
  const rejectedIds = completionDraft === null ? [] : [
    ...(Array.isArray(completionDraft.sourceIds) ? completionDraft.sourceIds : []),
    ...(Array.isArray(completionDraft.actionIds) ? completionDraft.actionIds : [])
  ].filter((value):value is string => typeof value === "string");
  return Object.freeze({
    id:input.id,fallback:input.fallback,modelCalls,outcome:result.outcome,
    returnedText:result.text,sources:result.sources,actions:result.actions,
    userStored:stored.filter((row) => row.role === "user").map((row) => row.text),
    assistantStored:stored.filter((row) => row.role === "assistant").map((row) => row.text),
    transit,diagnostics,completionText:completionDraft?.text,
    completionTextInSink:typeof completionDraft?.text === "string" && sink.includes(completionDraft.text),
    rejectedIdsInSink:rejectedIds.filter((id) => sink.includes(id)),
    systemCodePoints:systems[0] === undefined ? null : [...systems[0]].length
  });
}

const validDraft: DraftBuilder = (refs) => ({
  text:"Choose Start a debate to continue.",sourceIds:[refs.sources[0]!],
  actionIds:refs.actions.length === 0 ? [] : [refs.actions[0]!]
});
const answerCases = [];
for (const item of [
  { id:"valid-current-map",requestId:REQUEST_A,userText:"How do I create a debate?",fallback:"valid" as const,draftFor:validDraft },
  { id:"stale-cross-request",requestId:REQUEST_B,userText:"How do I create a debate?",fallback:"valid" as const,draftFor:() => ({ text:"Ordinary guidance.",sourceIds:[aSource],actionIds:[aAction] }) },
  { id:"unknown-reference",requestId:REQUEST_A,userText:"How do I create a debate?",fallback:"valid" as const,draftFor:() => ({ text:"Ordinary guidance.",sourceIds:["s-ffffffffffffffffffffffffffffffff-1"],actionIds:["a-ffffffffffffffffffffffffffffffff-1"] }) },
  { id:"duplicate-reference",requestId:REQUEST_A,userText:"How do I create a debate?",fallback:"valid" as const,draftFor:(refs:ReturnType<typeof references>) => ({ text:"Ordinary guidance.",sourceIds:[refs.sources[0]!,refs.sources[0]!],actionIds:[] }) },
  { id:"alias-in-prose",requestId:REQUEST_A,userText:"How do I create a debate?",fallback:"valid" as const,draftFor:(refs:ReturnType<typeof references>) => ({ text:`Use ${refs.sources[0]} to continue.`,sourceIds:[refs.sources[0]!],actionIds:[] }) },
  { id:"canonical-id-in-prose",requestId:REQUEST_A,userText:"How do I create a debate?",fallback:"valid" as const,draftFor:(refs:ReturnType<typeof references>) => ({ text:"Use getting-started-debate to continue.",sourceIds:[refs.sources[0]!],actionIds:[] }) },
  { id:"positive-modal-after-negative",requestId:REQUEST_A,userText:"How do I create a debate?",fallback:"valid" as const,draftFor:(refs:ReturnType<typeof references>) => ({ text:"Support does not request passwords, plus it could receive them.",sourceIds:[refs.sources[0]!],actionIds:[] }) },
  { id:"equals-unc",requestId:REQUEST_A,userText:"How do I create a debate?",fallback:"valid" as const,draftFor:(refs:ReturnType<typeof references>) => ({ text:"Network=%5C%5Cserver%5Cshare to continue.",sourceIds:[refs.sources[0]!],actionIds:[] }) },
  { id:"rejected-bytes-arrays",requestId:REQUEST_A,userText:"How do I create a debate?",fallback:"valid" as const,draftFor:() => ({ text:"Send must-not-survive password to Support.",sourceIds:["s-ffffffffffffffffffffffffffffffff-1"],actionIds:["a-ffffffffffffffffffffffffffffffff-1"] }) },
  { id:"missing-fallback",requestId:REQUEST_A,userText:"How do I create a debate?",fallback:"missing" as const,draftFor:(refs:ReturnType<typeof references>) => ({ text:"Send your password to Support.",sourceIds:[refs.sources[0]!],actionIds:[] }) },
  { id:"invalid-fallback",requestId:REQUEST_A,userText:"How do I create a debate?",fallback:"invalid" as const,draftFor:(refs:ReturnType<typeof references>) => ({ text:"Send your password to Support.",sourceIds:[refs.sources[0]!],actionIds:[] }) },
  { id:"input-redaction",requestId:REQUEST_A,userText:"How do I create a debate? My reset token is quartz and ember; keep it private.",fallback:"valid" as const,draftFor:validDraft }
]) answerCases.push(await answerCase(item));

const summaryResults = policyCases.map((item) => Object.freeze({
  id:item.id,expected:item.expected,text:item.text,
  accepted:parseSupportCaseSummaryDraft(summary(item.text)) !== null
}));

const diagnostic = diagnoseSupportDraft(raw("Send your p%61ssword to Support."),[aSource],[]);
const producerProjection = projectSupportDraftReport({ ...diagnostic,attemptId:REQUEST_A });
const diagnosticBlock = `{
  code: 'SUPPORT_DRAFT_${diagnostic.code}',
  attemptId: '${REQUEST_A}',
  predicate: '${diagnostic.predicate}',
  jsonValid: ${diagnostic.jsonValid},
  fenced: ${diagnostic.fenced},
  exactKeys: ${diagnostic.exactKeys},
  kindValid: ${diagnostic.kindValid},
  textCodePoints: ${String(diagnostic.textCodePoints)},
  sourceIdCount: ${diagnostic.sourceIdCount},
  allowedSourceIdCount: ${diagnostic.allowedSourceIdCount},
  actionIdCount: ${diagnostic.actionIdCount},
  allowedActionIdCount: ${diagnostic.allowedActionIdCount},
}
`;
const evidence = classifySupportResponseEvidence({
  outcome:"ANSWER_GROUNDED",text:baseEntry.fallback!,sourceIds:[baseEntry.id]
},{
  requestVersion:"snapshot-final",pinnedVersion:"snapshot-final",pinnedSourceId:baseEntry.id,
  reviewedFallback:{ version:"snapshot-final",sourceId:baseEntry.id,text:baseEntry.fallback! }
});
const consumerControls = Object.freeze({
  exact:consumeSupportDiagnosticWindow(Buffer.from(diagnosticBlock),{
    cursorStart:0,cursorEnd:Buffer.byteLength(diagnosticBlock),seenAttemptIds:new Set(),responseEvidence:evidence
  }),
  duplicate:consumeSupportDiagnosticWindow(Buffer.from(`${diagnosticBlock}${diagnosticBlock}`),{
    cursorStart:0,cursorEnd:Buffer.byteLength(`${diagnosticBlock}${diagnosticBlock}`),seenAttemptIds:new Set(),responseEvidence:evidence
  }),
  extraResponseKey:consumeSupportDiagnosticWindow(Buffer.from(diagnosticBlock),{
    cursorStart:0,cursorEnd:Buffer.byteLength(diagnosticBlock),seenAttemptIds:new Set(),
    responseEvidence:{ ...evidence,raw:"discarded" }
  }),
  noEvent:consumeSupportDiagnosticWindow(Buffer.from("ordinary log line\n"),{
    cursorStart:0,cursorEnd:Buffer.byteLength("ordinary log line\n"),seenAttemptIds:new Set(),responseEvidence:evidence
  })
});

const output = Object.freeze({
  revision:REVISION,
  substrate:"actual final TypeScript modules with in-memory model/message ports; frozen diagnostic consumer; no socket, HTTP, database, browser, preview, provider, relay, auth, reset, or account traffic",
  redaction,
  policy:policyResults,
  policyMismatches:policyResults.filter((row) => row.accepted !== (row.expected === "accept")),
  identifiers:{
    exactHyphenatedCount:closedHyphenatedIds.length,
    exactAccepted:exactIdResults.filter(({ accepted }) => accepted),
    transformed:transformedIdResults,labelCount:labelResults.length,
    labelRejected:labelResults.filter(({ accepted }) => !accepted)
  },
  mapping,
  answerCases,
  summary:summaryResults,
  summaryMismatches:summaryResults.filter((row) => row.accepted !== (row.expected === "accept")),
  diagnostics:{ producerKeys:Object.keys(producerProjection).sort(),producerProjection,consumerControls }
});
process.stdout.write(`${JSON.stringify(output,null,2)}\n`);
