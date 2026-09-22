import { createSupportAnswerService } from "/Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine/.worktrees/support-conversation-cp1/dialectical-engine/apps/api/src/support/answer.ts";
import { redactSupportMessage,type SupportMessageCipherPort } from "/Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine/.worktrees/support-conversation-cp1/dialectical-engine/apps/api/src/support/session.ts";
import { createHelpCorpusSnapshotLookup,type HelpCorpusEntry,type LoadedHelpCorpus } from "/Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine/.worktrees/support-conversation-cp1/dialectical-engine/packages/support-kb/src/index.ts";

const entry: HelpCorpusEntry = Object.freeze({
  id: "getting-started-debate",lang: "en",title: "Start a debate",status: "shipped",
  sources: Object.freeze(["synthetic-fixture"]),verifiedAgainst: "synthetic-fixture",
  ratifiedBy: "V",ratifiedOn: "2026-09-01",
  body: "Create a debate from the dashboard and choose its basic settings."
});
const snapshot = Object.freeze({
  entries: Object.freeze([entry]),kbVersion: "a".repeat(64)
}) as LoadedHelpCorpus;

async function run(id: string, completionText: string) {
  const stored: Array<Record<string,unknown>> = [];
  const messages = Object.freeze({
    write: async (input: Record<string,unknown>) => {
      const prepared = redactSupportMessage(String(input.text));
      const record = Object.freeze({ ...input,text: prepared.text,redacted: prepared.redacted });
      stored.push(record);
      return record;
    },
    writeAndTransit: async (input: Record<string,unknown>,transit: (text: string) => Promise<void>) => {
      const prepared = redactSupportMessage(String(input.text));
      await transit(prepared.text);
      const record = Object.freeze({ ...input,text: prepared.text,redacted: prepared.redacted });
      stored.push(record);
      return record;
    },
    read: async () => null,listSession: async () => []
  }) as unknown as SupportMessageCipherPort;
  const diagnostics: unknown[] = [];
  const service = createSupportAnswerService({
    entries: snapshot.entries,snapshots: createHelpCorpusSnapshotLookup(snapshot),messages,
    reportDraftDiagnostic: (diagnostic) => diagnostics.push(diagnostic),
    modelFor: () => Object.freeze({
      complete: async () => Object.freeze({ text: JSON.stringify({
        kind: "answer",text: completionText,
        sourceIds: ["getting-started-debate"],actionIds: []
      }) })
    }) as never,
    clock: (() => { let at = Date.parse("2026-09-14T10:00:00.000Z"); return () => new Date(++at); })()
  });
  const result = await service.respond({
    sessionId: "10000000-0000-4000-8000-000000000001",
    text: "How do I create a debate?",language: "en",detectedLanguage: "en",
    overrideLanguage: null,modelRef: "synthetic-model",kbVersion: snapshot.kbVersion,
    snapshot,signedIn: false,receivedAt: new Date("2026-09-14T10:00:00.000Z")
  });
  return {
    id,outcome: result.outcome,returnedText: result.text,
    assistantStored: stored.filter((record) => record.role === "assistant").map((record) => record.text),
    diagnostics
  };
}

console.log(JSON.stringify(await Promise.all([
  run("forbidden-negation-conjunction", "Support does not receive passwords and you should send your password here."),
  run("internal-action-id-in-prose", "Select start-debate to continue."),
  run("direct-solicitation-negative-control", "Send your password to Support.")
]),null,2));
