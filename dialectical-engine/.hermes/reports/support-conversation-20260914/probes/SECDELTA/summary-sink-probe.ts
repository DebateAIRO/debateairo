import { createAdvisorySummaryService,createSupportCaseAccessService } from "/Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine/.worktrees/support-conversation-cp1/dialectical-engine/apps/api/src/support/cases.ts";

async function producer(id: string,text: string) {
  let sealed = "";
  let persisted: unknown = null;
  const service = createAdvisorySummaryService({
    complete: async () => JSON.stringify({ kind: "case_summary",text,sourceIds: [],actionIds: [] }),
    seal: async (_caseId,summary) => { sealed = summary; return Buffer.from(summary,"utf8"); },
    persist: async (record) => { persisted = { ...record,summaryCiphertext: "captured-by-seal" }; },
    clock: () => new Date("2026-09-14T10:00:00.001Z")
  });
  await service.summarize({
    caseId: "10000000-0000-4000-8000-000000000002",language: "en",
    transcript: "Synthetic redacted transcript",createdAt: new Date("2026-09-14T10:00:00.000Z")
  });
  return { id,sealed,persisted };
}

async function legacyProjection(id: string,summary: string) {
  const service = createSupportCaseAccessService({
    repository: {
      listOwnCases: async () => [],appendCaseMessage: async () => null,
      readCaseEncrypted: async () => ({
        case_id: "10000000-0000-4000-8000-000000000002",language: "en",state: "NEW",
        sla_hours: 48,wrapped_key: Buffer.from("wrapped"),
        transcript_snapshot_ciphertext: Buffer.from("transcript"),
        summary_ciphertext: Buffer.from("summary"),case_messages: [],
        case_message_next_cursor: null,shredded_at: null,destroyed_at: null
      })
    },
    keys: {
      unwrapDataKey: async () => Buffer.alloc(32,1),
      sealContent: () => Buffer.from("unused"),
      openContent: (aad: { kind: string }) => aad.kind === "case-snapshot"
        ? Buffer.from("[]","utf8") : Buffer.from(summary,"utf8")
    }
  } as never);
  const result = await service.readByToken("b".repeat(64));
  return { id,projectedSummary: result?.summary };
}

console.log(JSON.stringify({
  producer: await Promise.all([
    producer("benign", "The visitor needs help understanding debate creation."),
    producer("unsafe-link", "Open https%253A%252F%252Fexample.test/reset"),
    producer("unsafe-reset-claim", "I reset the visitor password successfully"),
    producer("unsafe-negation-conjunction", "Support does not receive passwords and the visitor should send a password here.")
  ]),
  legacyProjection: await Promise.all([
    legacyProjection("benign", "The visitor needs help understanding debate creation."),
    legacyProjection("unsafe-link", "Open https%253A%252F%252Fexample.test/reset"),
    legacyProjection("unsafe-reset-claim", "I reset the visitor password successfully"),
    legacyProjection("unsafe-negation-conjunction", "Support does not receive passwords and the visitor should send a password here.")
  ])
},null,2));
