import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { readTerminalRecordedFacts } from "@debateai/battery";
import { LedgerRepository, type AppendRawArtifactInput } from "@debateai/ledger";
import { RunRepository, migrate } from "../../packages/db/src/index.js";
import { fixtureDiscoveredPanel, fixtureStructuralCeiling } from "../support/discoveredPanel.js";
import { startTestDatabase, type TestDatabase } from "../support/testDatabase.js";

/**
 * LG-A (INTERFACE §4): migration 0120's six columns, written once by the ledger's one INSERT, held by six CHECKs; and its
 * redefined terminal recorded facts, which count a structure-repaired call's OK row (pre-flight PF-A44, ruling R8). Run alone.
 */
let database: TestDatabase;
beforeAll(async () => { database = await startTestDatabase(); await migrate(database.pool); }, 600_000);
afterAll(async () => { await database?.stop(); });

async function run(): Promise<string> {
  return new RunRepository(database.pool).startRun({
    questionLine: "Do the reply measures hold?", principal: { kind: "legacy", legacyAskerId: `test:${randomUUID()}` },
    sessionId: randomUUID(), callerScope: "ASKER", asOf: new Date(), askerRiskTier: "casual", effectiveRiskTier: "casual",
    tierSource: "ASKER", tierProvenanceRef: "asker:test", compositionBudgetTier: "low", depthParams: { depth: 1 },
    discoveredPanel: fixtureDiscoveredPanel(1), strangerSampleRate: 0, envelopeBasis: fixtureStructuralCeiling(4), registerVersion: 1,
    batteryVersion: "test", askContract: {}, batteryRows: []
  });
}
// (pre-flight PF-A38) Typed as the ledger's own input, so the spread into `appendRawArtifact` typechecks.
const artifact = (runId: string, extra: Partial<AppendRawArtifactInput>): AppendRawArtifactInput => ({
  artifactId: randomUUID(), attemptId: randomUUID(), runId, providerRef: "provider:lg-a", provider: "openai-compatible-http",
  model: "model:lg-a", maker: "maker:lg-a", modelVersion: "v1", rawText: "{}", metadata: {}, parseStatus: "PARSED" as const,
  inputHash: "4".repeat(64), contractHash: "5".repeat(64), contentHash: "6".repeat(64), ...extra
});

describe("migration 0120 — the reply measures", () => {
  it("writes every measure once with the artifact, and nulls when none is given", async () => {
    const runId = await run();
    const ledger = new LedgerRepository(database.pool);
    const full = await ledger.appendRawArtifact(artifact(runId, { replyRepairs: ["CODE_FENCE", "INNER_UNASKED_KEYS"], replyFailureClass: null,
      replyForm: "STRUCTURE", cachedInputTokens: 120, guidedWords: 250, actualWords: 311 }));
    const bare = await ledger.appendRawArtifact(artifact(runId, {}));
    const rows = (await database.pool.query(
      `SELECT raw_artifact_id::text id, reply_repairs, reply_failure_class, reply_form, cached_input_tokens, guided_words, actual_words
         FROM ledger.raw_artifact WHERE raw_artifact_id = ANY($1::uuid[]) ORDER BY at_seq`, [[full, bare]])).rows;
    expect(rows).toEqual([
      { id: full, reply_repairs: ["CODE_FENCE", "INNER_UNASKED_KEYS"], reply_failure_class: null, reply_form: "STRUCTURE",
        cached_input_tokens: 120, guided_words: 250, actual_words: 311 },
      { id: bare, reply_repairs: null, reply_failure_class: null, reply_form: null, cached_input_tokens: null, guided_words: null, actual_words: null }
    ]);
  });

  // (Task 10 review) The ledger fits the list to the CHECK, so a billed reply is never refused for its repair codes.
  it("writes an empty repair list as null, a repeated code once, and the first sixteen of a longer list, in order", async () => {
    const runId = await run();
    const ledger = new LedgerRepository(database.pool);
    const twenty = Array.from({ length: 20 }, (_, index) => `CODE_${index}`);
    const ids = [
      await ledger.appendRawArtifact(artifact(runId, { replyRepairs: [] })),
      await ledger.appendRawArtifact(artifact(runId, { replyRepairs: twenty })),
      await ledger.appendRawArtifact(artifact(runId, { replyRepairs: ["CODE_FENCE", "INNER_UNASKED_KEYS", "CODE_FENCE"] })),
      await ledger.appendRawArtifact(artifact(runId, { replyRepairs: Array.from({ length: 17 }, () => "CODE_FENCE") }))
    ];
    const rows = (await database.pool.query(
      "SELECT reply_repairs FROM ledger.raw_artifact WHERE raw_artifact_id = ANY($1::uuid[]) ORDER BY at_seq", [ids])).rows;
    expect(rows.map((row) => row.reply_repairs)).toEqual([
      null, twenty.slice(0, 16), ["CODE_FENCE", "INNER_UNASKED_KEYS"], ["CODE_FENCE"]
    ]);
  });

  it.each([
    ["a repair that is not a code", { replyRepairs: ["code_fence"] }, "raw_artifact_reply_repairs_code_shaped"],
    ["an unknown class", { replyFailureClass: "BROKEN" }, "raw_artifact_reply_failure_class_known"],
    ["an unknown form", { replyForm: "RETRY" }, "raw_artifact_reply_form_known"],
    ["a negative cached count", { cachedInputTokens: -1 }, "raw_artifact_cached_input_tokens_non_negative"],
    ["negative guided words", { guidedWords: -1 }, "raw_artifact_guided_words_non_negative"],
    ["negative actual words", { actualWords: -1 }, "raw_artifact_actual_words_non_negative"]
  ] as const)("refuses %s", async (_name, extra, constraint) => {
    const runId = await run();
    await expect(new LedgerRepository(database.pool).appendRawArtifact(artifact(runId, extra))).rejects.toThrow(constraint);
  });
});

/** One MODEL_CALL ledger row of `runId` under `callSiteKey` (no artifact: the terminal facts count ledger rows only). */
async function modelCall(runId: string, callSiteKey: string, outcome: "OK" | "FAILED"): Promise<void> {
  const now = new Date();
  await new LedgerRepository(database.pool).append({
    runId, attemptId: randomUUID(), actionKind: "MODEL_CALL", callSiteKey, subjectItemId: `item:${runId}`,
    stanceAtAction: "UNASSIGNED", outcome, actorRef: "provider:lg-a", inputHash: "7".repeat(64),
    contractHash: "8".repeat(64), startedAt: now, finishedAt: now
  });
}

// (pre-flight PF-A44, ruling R8) The structure-repair call records its accepted reply under REPAIR:STRUCTURE:<key>.
describe("migration 0120 — the terminal recorded facts count a structure-repaired call", () => {
  it("a debate whose only accepted writer row is REPAIR:STRUCTURE:COMPOSER:SYNTHESIZER reads composerCallCount = 1", async () => {
    const runId = await run();
    await modelCall(runId, "COMPOSER:SYNTHESIZER", "FAILED");
    await modelCall(runId, "REPAIR:STRUCTURE:COMPOSER:SYNTHESIZER", "OK");
    expect((await readTerminalRecordedFacts(database.pool, runId)).ledger.composerCallCount).toBe(1);
  });

  it("counts a repaired judge, conformance and post-compose call the same way through the runtime role; a refused repair or another repair counts nowhere", async () => {
    const runId = await run();
    for (const [callSiteKey, outcome] of [
      ["JUDGE", "FAILED"], ["REPAIR:STRUCTURE:JUDGE", "OK"],
      ["REPAIR:STRUCTURE:CONFORMANCE:SEGMENT", "OK"],
      ["POST_COMPOSE_R9:EVALUATOR:1", "FAILED"], ["REPAIR:STRUCTURE:POST_COMPOSE_R9:EVALUATOR:1", "OK"],
      ["REPAIR:STRUCTURE:COMPOSER:SYNTHESIZER", "FAILED"], ["REPAIR:STRUCTURE:STORY:WRITER", "OK"]
    ] as const) await modelCall(runId, callSiteKey, outcome);
    expect((await readTerminalRecordedFacts(database.pool, runId)).ledger).toMatchObject({
      judgeCallCount: 1, composerCallCount: 0, conformanceCallCount: 1, postComposeR9CallCount: 1 });
    // 0049's grant re-asserted: the runtime role still calls it, and it still runs as its definer.
    const runtime = await database.pool.connect();
    try {
      await runtime.query("SET ROLE debateai_runtime");
      expect((await runtime.query(
        "SELECT judge_calls, composer_calls, conformance_calls, r9_calls FROM core.read_terminal_recorded_facts($1)", [runId])).rows)
        .toEqual([{ judge_calls: "1", composer_calls: "0", conformance_calls: "1", r9_calls: "1" }]);
    } finally {
      await runtime.query("RESET ROLE").catch(() => undefined);
      runtime.release();
    }
    expect((await database.pool.query(
      "SELECT prosecdef, proconfig, provolatile FROM pg_proc WHERE oid = 'core.read_terminal_recorded_facts(uuid)'::regprocedure")).rows)
      .toEqual([{ prosecdef: true, proconfig: ["search_path=pg_catalog, core, ledger, evidence, scorecard, serve, register"], provolatile: "s" }]);
  });
});
