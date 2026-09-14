import { redactSupportText } from "/Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine/.worktrees/support-conversation-cp1/dialectical-engine/packages/kernel/src/index.ts";
import {
  diagnoseSupportDraft,parseSupportCaseSummaryDraft,parseSupportDraft,projectSupportDraftReport
} from "/Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine/.worktrees/support-conversation-cp1/dialectical-engine/apps/api/src/support/response-policy.ts";
import { createSupportAnswerService } from "/Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine/.worktrees/support-conversation-cp1/dialectical-engine/apps/api/src/support/answer.ts";
import { redactSupportMessage,type SupportMessageCipherPort } from "/Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine/.worktrees/support-conversation-cp1/dialectical-engine/apps/api/src/support/session.ts";
import { createHelpCorpusSnapshotLookup,type HelpCorpusEntry,type LoadedHelpCorpus } from "/Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine/.worktrees/support-conversation-cp1/dialectical-engine/packages/support-kb/src/index.ts";

function raw(text: string,sourceIds = ["getting-started-debate"],actionIds: string[] = []) {
  return JSON.stringify({ kind: "answer",text,sourceIds,actionIds });
}

const redactionCases = [
  ["fixed-control-obfuscation", "My pass\u200Bword is inert-birch-7"],
  ["fixed-otp", "OTP is INERTABC"],
  ["fixed-ro-inflection", "Passwordul meu este inert-stejar-7"],
  ["quoted-spaced-value", "My password is \"inert horse battery\""],
  ["benign-en", "I forgot my password"],
  ["benign-ro", "Am uitat parola"]
] as const;

const policyCases = [
  ["fixed-en-plural", "Send your passwords to Support."],
  ["fixed-ro-plural", "Trimite parolele către Asistență."],
  ["fixed-en-coordinator", "Support does not receive passwords and you should send your password here."],
  ["fixed-ro-coordinator", "Asistența nu primește parole și trebuie să trimiți parola aici."],
  ["coordinator-and-also", "Support does not receive passwords and also asks you to send them here."],
  ["coordinator-so", "Support does not receive passwords, so send them here."],
  ["encoded-credential-term", "Send your p%61ssword to Support."],
  ["double-encoded-link-control", "Open https%253A%252F%252Fexample.test/reset"],
  ["triple-encoded-link", "Open https%25253A%25252F%25252Fexample.test/reset"],
  ["closed-id-control", "Select start-debate to continue."],
  ["excluded-id-forgot", "Select forgot-password to continue."],
  ["excluded-id-privacy", "Select privacy-preferences to continue."],
  ["excluded-id-sign-in", "Select sign-in to continue."],
  ["excluded-id-status", "Read support-status to continue."],
  ["safe-human-label", "Select Forgot password to continue."],
  ["safe-en-limitation", "You can change your account name in Settings. Support cannot receive your password."],
  ["safe-ro-limitation", "Poți schimba numele contului în Setări. Asistența nu poate primi parola."]
] as const;

const entry: HelpCorpusEntry = Object.freeze({
  id: "getting-started-debate",lang: "en",title: "Start a debate",status: "shipped",
  sources: Object.freeze(["synthetic-fixture"]),verifiedAgainst: "synthetic-fixture",
  ratifiedBy: "V",ratifiedOn: "2026-09-01",
  body: "Create a debate from the dashboard and choose its basic settings."
});
const snapshot = Object.freeze({ entries: Object.freeze([entry]),kbVersion: "a".repeat(64) }) as LoadedHelpCorpus;

async function answerSink(id: string,completionText: string) {
  const stored: Array<Record<string,unknown>> = [];
  const messages = Object.freeze({
    write: async (input: Record<string,unknown>) => {
      const prepared = redactSupportMessage(String(input.text));
      const record = Object.freeze({ ...input,text: prepared.text,redacted: prepared.redacted });
      stored.push(record);return record;
    },
    writeAndTransit: async (input: Record<string,unknown>,transit: (text: string) => Promise<void>) => {
      const prepared = redactSupportMessage(String(input.text));
      await transit(prepared.text);
      const record = Object.freeze({ ...input,text: prepared.text,redacted: prepared.redacted });
      stored.push(record);return record;
    },
    read: async () => null,listSession: async () => []
  }) as unknown as SupportMessageCipherPort;
  const diagnostics: unknown[] = [];
  const service = createSupportAnswerService({
    entries: snapshot.entries,snapshots: createHelpCorpusSnapshotLookup(snapshot),messages,
    reportDraftDiagnostic: (diagnostic) => diagnostics.push(projectSupportDraftReport(diagnostic)),
    modelFor: () => Object.freeze({ complete: async () => Object.freeze({ text: raw(completionText) }) }) as never,
    clock: (() => { let at = Date.parse("2026-09-14T10:00:00.000Z");return () => new Date(++at); })()
  });
  const result = await service.respond({
    sessionId: "10000000-0000-4000-8000-000000000001",
    text: "How do I create a debate?",language: "en",detectedLanguage: "en",overrideLanguage: null,
    modelRef: "synthetic-model",kbVersion: snapshot.kbVersion,snapshot,signedIn: false,
    receivedAt: new Date("2026-09-14T10:00:00.000Z")
  });
  return {
    id,outcome: result.outcome,returnedText: result.text,
    assistantStored: stored.filter((record) => record.role === "assistant").map((record) => record.text),
    diagnostics
  };
}

const diagnostic = diagnoseSupportDraft(raw("Send your passwords to Support."),["getting-started-debate"],[]);
const closedProjection = projectSupportDraftReport({
  ...diagnostic,attemptId: "10000000-0000-4000-8000-000000000099",
  rawCompletion: "must-not-project",authorization: "must-not-project"
} as never);

console.log(JSON.stringify({
  redaction: redactionCases.map(([id,input]) => ({ id,...redactSupportText(input) })),
  policy: policyCases.map(([id,text]) => {
    const value = raw(text);
    const result = diagnoseSupportDraft(value,["getting-started-debate"],[]);
    return { id,code: result.code,predicate: result.predicate,parsed: parseSupportDraft(value,["getting-started-debate"]) !== null };
  }),
  summary: policyCases.filter(([id]) => [
    "coordinator-and-also","coordinator-so","encoded-credential-term","triple-encoded-link",
    "excluded-id-forgot","safe-human-label"
  ].includes(id)).map(([id,text]) => ({ id,accepted: parseSupportCaseSummaryDraft(JSON.stringify({
    kind: "case_summary",text,sourceIds: [],actionIds: []
  })) !== null })),
  answerSink: await Promise.all(policyCases.filter(([id]) => [
    "coordinator-and-also","encoded-credential-term","triple-encoded-link","excluded-id-forgot",
    "fixed-en-plural"
  ].includes(id)).map(([id,text]) => answerSink(id,text))),
  closedProjection:{ keys:Object.keys(closedProjection).sort(),value:closedProjection }
},null,2));
