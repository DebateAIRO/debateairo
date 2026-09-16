import assert from "node:assert/strict";
import { createSupportAnswerService } from "/Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine/.worktrees/support-cp1-p3-correctness/dialectical-engine/apps/api/src/support/answer.ts";
import { SupportDegradedState } from "/Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine/.worktrees/support-cp1-p3-correctness/dialectical-engine/apps/api/src/support/degraded.ts";
import { createHelpCorpusSnapshotLookup } from "/Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine/.worktrees/support-cp1-p3-correctness/dialectical-engine/packages/support-kb/src/index.ts";

const baseEntry = Object.freeze({
  id: "getting-started-debate",
  lang: "en" as const,
  title: "Start a debate",
  status: "shipped" as const,
  sources: ["review-probe"],
  verifiedAgainst: "5cbfc6d483aae0f56eabfdee00a6829e09e76c3d",
  ratifiedBy: "V" as const,
  ratifiedOn: "2026-09-16",
  body: "Open the new debate page to start your first debate."
});

type Stored = Readonly<Record<string, unknown>>;

async function exercise(includeProjection: boolean) {
  const writes: Stored[] = [];
  let modelCalls = 0;
  const messages = {
    write: async (input: Stored) => { writes.push(input); return { ...input,redacted: false }; },
    writeAndTransit: async (input: Stored,transit: (text: string) => Promise<void>) => {
      writes.push(input);
      await transit(String(input.text));
      return { ...input,redacted: false };
    },
    read: async () => null,
    listSession: async () => []
  };
  const entry = Object.freeze(includeProjection
    ? { ...baseEntry,modelProjection: "Open the new debate page to start your first debate." }
    : { ...baseEntry });
  const snapshot = Object.freeze({
    entries: Object.freeze([entry]),
    kbVersion: "a".repeat(64)
  });
  const degraded = new SupportDegradedState();
  degraded.markUnavailable(new Date("2026-09-16T08:00:00.000Z"),"relay");
  const answer = createSupportAnswerService({
    entries: [entry] as never,
    snapshots: createHelpCorpusSnapshotLookup(snapshot as never),
    messages: messages as never,
    degraded,
    modelFor: () => ({ complete: async () => {
      modelCalls += 1;
      return {
        text: JSON.stringify({
          kind: "answer",
          text: "Type your password here.",
          sourceIds: [entry.id],
          actionIds: []
        }),
        usage: { input_tokens: 3,output_tokens: 4,cost_usd: 0.001 }
      };
    } })
  });
  const result = await answer.respond({
    sessionId: includeProjection ? "projection-present" : "projection-absent",
    text: "How do I start my first debate?",
    language: "en",
    detectedLanguage: "en",
    overrideLanguage: null,
    modelRef: "inert-review-probe",
    kbVersion: snapshot.kbVersion,
    signedIn: false,
    receivedAt: new Date("2026-09-16T08:00:01.001Z")
  });
  return { result,writes,modelCalls,degraded: degraded.isDegraded() };
}

const admitted = await exercise(true);
assert.equal(admitted.modelCalls,1);
assert.equal(admitted.result.outcome,"REFUSE_SAFETY");
assert.deepEqual(admitted.result.usage,{ input_tokens: 3,output_tokens: 4,cost_usd: 0.001 });
assert.deepEqual(admitted.degraded,{ degraded: false });
assert.equal(admitted.writes.at(-1)?.outcome,"REFUSE_SAFETY");
assert.equal(admitted.writes.at(-1)?.modelCalled,true);
assert.equal(admitted.writes.at(-1)?.inputTokens,3);
assert.equal(admitted.writes.at(-1)?.outputTokens,4);
assert.equal(admitted.writes.at(-1)?.costUsd,0.001);

const excluded = await exercise(false);
assert.equal(excluded.modelCalls,0);
assert.equal(excluded.result.outcome,"NO_SOURCE");
assert.equal("usage" in excluded.result,false);
assert.deepEqual(excluded.degraded,{
  degraded: true,
  reason: "relay",
  since: new Date("2026-09-16T08:00:00.000Z")
});
assert.equal(excluded.writes.at(-1)?.outcome,"NO_SOURCE");
assert.equal(excluded.writes.at(-1)?.modelCalled,undefined);

process.stdout.write(JSON.stringify({
  status: "PASS",
  frozenProduct: "5cbfc6d483aae0f56eabfdee00a6829e09e76c3d",
  positive: {
    modelCalls: admitted.modelCalls,
    outcome: admitted.result.outcome,
    usage: admitted.result.usage,
    degraded: admitted.degraded
  },
  negative: {
    modelCalls: excluded.modelCalls,
    outcome: excluded.result.outcome,
    hasUsage: "usage" in excluded.result,
    degraded: excluded.degraded
  }
}) + "\n");
