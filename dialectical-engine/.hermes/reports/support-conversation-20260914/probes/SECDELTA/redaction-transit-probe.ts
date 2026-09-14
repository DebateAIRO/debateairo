import { createSupportCaseService,createSupportMessageCipher,type SupportEncryptedMessageRead } from "/Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine/.worktrees/support-conversation-cp1/dialectical-engine/apps/api/src/support/session.ts";

async function run(id: string,text: string) {
  const rows: SupportEncryptedMessageRead[] = [];
  const cipher = createSupportMessageCipher({
    unwrapDataKey: async () => Buffer.alloc(32,1),
    sealContent: (_aad: unknown,_key: Uint8Array,plaintext: Uint8Array) => Buffer.from(plaintext),
    openContent: (_aad: unknown,_key: Uint8Array,ciphertext: Uint8Array) => Buffer.from(ciphertext)
  } as never,{
    readSessionKey: async () => Buffer.from("wrapped"),
    write: async (input) => { rows.push(Object.freeze({
      ...input,contentCiphertext: Buffer.from(input.contentCiphertext),wrappedKey: Buffer.from("wrapped")
    })); },
    read: async ({ messageId }) => rows.find((row) => row.messageId === messageId) ?? null,
    listSession: async () => Object.freeze([...rows])
  });
  let transit = "";
  const stored = await cipher.writeAndTransit({
    messageId: "10000000-0000-4000-8000-000000000003",
    sessionId: "10000000-0000-4000-8000-000000000001",role: "user",
    text,outcome: "REFUSE_ZONE",language: "en",detectedLanguage: "en",overrideLanguage: null,
    receivedAt: new Date("2026-09-14T10:00:00.000Z"),firstTokenAt: null,completedAt: null
  },async (safeText) => { transit = safeText; });
  let snapshot = "";
  let summaryTransit = "";
  let summaryResolve!: () => void;
  const summarized = new Promise<void>((resolve) => { summaryResolve = resolve; });
  const cases = createSupportCaseService({
    messages: cipher,
    create: async (input) => {
      snapshot = Buffer.from(input.transcriptSnapshot).toString("utf8");
      return Object.freeze({
        caseId: input.caseId,sessionId: input.sessionId,identityOwnerRef: input.identityOwnerRef,
        language: input.language,createdAt: input.createdAt,triggerPredicate: input.triggerPredicate,
        toolCalls: input.toolCalls,kbVersion: input.kbVersion,slaHours: input.slaHours,state: "NEW" as const
      });
    },
    summaries: Object.freeze({ summarize: async (input) => {
      summaryTransit = input.transcript;summaryResolve();
    } }),
    reportSummaryFailure: () => undefined
  });
  await cases.open({
    sessionId: "10000000-0000-4000-8000-000000000001",language: "en",
    createdAt: new Date("2026-09-14T10:00:00.000Z"),triggerPredicate: "E3",
    kbVersion: "a".repeat(64),slaHours: 48
  });
  await summarized;
  return {
    id,redacted: stored.redacted,storedText: stored.text,relayTransit: transit,
    encryptedPersistencePlaintextForProbe: rows[0]!.contentCiphertext.toString(),
    caseSnapshot: snapshot,advisorySummaryTransit: summaryTransit
  };
}

console.log(JSON.stringify(await Promise.all([
  run("covered-en", "My password is inert-orchid-7"),
  run("uncovered-control-obfuscation", "My pass\u200Bword is inert-birch-7"),
  run("uncovered-otp-label", "OTP is INERTABC")
]),null,2));
