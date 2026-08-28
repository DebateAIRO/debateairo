import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { RunRepository, migrate } from "@debateai/db";
import {
  SettlementRepository,
  type CalibrationStrategy,
  type RecordedProperScore,
  type RegisteredProperScore,
  type SettlementOutcomeInput
} from "@debateai/settlement";
import { startTestDatabase, type TestDatabase } from "../support/testDatabase.js";
import { fixtureDiscoveredPanel } from "../support/discoveredPanel.js";

let database: TestDatabase;

const properScore: RegisteredProperScore = Object.freeze({
  rowKey: "test-layer:proper-score",
  registerVersion: 404_012,
  sourceRef: "test-layer:FX-S22-03",
  score(input: { readonly posterior: number; readonly resolvedOutcome: boolean }) {
    const error = input.posterior - (input.resolvedOutcome ? 1 : 0);
    const total = 1 - error * error;
    return Object.freeze({ total, reliability: total, resolution: 0, uncertainty: 0 });
  }
});

const calibration: CalibrationStrategy = Object.freeze({
  rowKey: "test-layer:calibration",
  registerVersion: 404_012,
  sourceRef: "test-layer:FX-S22-03",
  deriveValue: (scores: readonly RecordedProperScore[]) => scores.reduce((sum, score) => sum + score.total, 0) / scores.length,
  deriveInterval: (scores: readonly RecordedProperScore[]) => {
    const values = scores.map((score) => score.total);
    return Object.freeze({ lower: Math.min(...values), upper: Math.max(...values) });
  }
});

async function createCompletedAnswer(label: string): Promise<{ readonly runId: string; readonly answerId: string }> {
  const runId = await new RunRepository(database.pool).startRun({
    questionLine: `Settlement fixture ${label}`,
    principal: { kind: "legacy", legacyAskerId: `asker:${label}` },
    sessionId: `session:${label}`,
    callerScope: "ASKER",
    asOf: new Date("2026-08-08T00:00:00.000Z"),
    askerRiskTier: "casual",
    effectiveRiskTier: "casual",
    tierSource: "ASKER",
    tierProvenanceRef: `asker:${label}`,
    compositionBudgetTier: "low",
    depthParams: { depth: 1 },
    discoveredPanel: fixtureDiscoveredPanel(1),
    strangerSampleRate: 1,
    envelopeBasis: { source: "test-layer" },
    registerVersion: 1,
    batteryVersion: "s12-test-layer",
    batteryRows: []
  });
  const carriers = await database.pool.query<{ work_item_id: string; fact_bundle_id: string }>(
    `WITH work AS (
       INSERT INTO core.work_item (
         run_id, battery_row_id, node_set, command_key, state, created_at_seq
       ) VALUES ($1,'Q61','[]'::jsonb,$2,'DONE',ledger.allocate_sequence())
       RETURNING work_item_id
     ), bundle AS (
       INSERT INTO serve.fact_bundle (run_id, facts, residual_objections, content_hash, version)
       VALUES ($1,'[]'::jsonb,'[]'::jsonb,$3,1)
       RETURNING fact_bundle_id
     ) SELECT work_item_id, fact_bundle_id FROM work CROSS JOIN bundle`,
    [runId, `settlement:${label}:${randomUUID()}`, `hash:${label}`]
  );
  const answer = await database.pool.query<{ answer_id: string }>(
    `INSERT INTO serve.answer (
       answer_version, run_id, work_item_id, terminal, serve_state, verdict_state, answer_form,
       condition_marks, fact_bundle_id, sealed_at_seq
     ) VALUES (1,$1,$2,'SERVED','COMPOSED','SUPPORTED',$3::jsonb,'[]'::jsonb,$4,ledger.allocate_sequence())
     RETURNING answer_id`,
    [runId, carriers.rows[0]!.work_item_id, JSON.stringify({ kind: "test-layer" }), carriers.rows[0]!.fact_bundle_id]
  );
  await database.pool.query(
    `INSERT INTO core.run_progress_event (run_id, at_seq, kind, value_json)
     VALUES ($1,ledger.allocate_sequence(),'TERMINAL','"SERVED"'::jsonb)`,
    [runId]
  );
  return Object.freeze({ runId, answerId: answer.rows[0]!.answer_id });
}

beforeAll(async () => {
  database = await startTestDatabase();
  await migrate(database.pool);
});

afterAll(async () => database?.stop());

describe("S12 / AC-40..43 / AC-73 — real PostgreSQL settlement carriers", () => {
  it("keeps the first settlement, records the loser as superseded, freezes a scorecard, and leaves attempt budget unchanged", async () => {
    const { runId, answerId } = await createCompletedAnswer("first-settled-wins");
    const repository = new SettlementRepository(database.pool);
    const base: Omit<SettlementOutcomeInput, "outcomeAttemptId" | "resolvedOutcome" | "resolverRef"> = {
      answerId,
      answerVersion: 1,
      asOf: new Date("2026-08-08T00:00:00.000Z"),
      runId,
      modelId: "model:test-layer",
      modelVersion: "version:test-layer:1",
      provider: "provider:test-layer",
      taskClass: "class:test-layer",
      prior: 0.5,
      posterior: 0.8,
      basis: "test-layer:external-resolution",
      resolverIsExternal: true,
      resolvedAt: new Date("2026-08-08T01:00:00.000Z"),
      provenanceRef: "resolver-artifact:test-layer",
      scoreability: "SCOREABLE",
      actorRef: "settlement-watch:test-layer"
    };
    const before = await database.pool.query<{ attempts: string }>(
      "SELECT count(*)::text AS attempts FROM ledger.ledger_entry WHERE run_id=$1 AND action_kind='MODEL_CALL'",
      [runId]
    );
    const winner = await repository.settle({
      ...base, outcomeAttemptId: randomUUID(), resolvedOutcome: true, resolverRef: "resolver:first"
    }, { properScore, calibration, metric: "judge_weight" });
    const loser = await repository.settle({
      ...base, outcomeAttemptId: randomUUID(), resolvedOutcome: false, resolverRef: "resolver:late"
    }, { properScore, calibration, metric: "judge_weight" });
    expect(winner).toMatchObject({ kind: "SETTLED" });
    expect(loser).toMatchObject({ kind: "SUPERSEDED_ATTEMPT" });

    const persisted = await database.pool.query<{
      accepted: boolean; superseded_by_answer_outcome_id: string | null; score_count: string; actions: string[]; attempts: string;
    }>(
      `SELECT outcome.accepted, outcome.superseded_by_answer_outcome_id,
              (SELECT count(*)::text FROM scorecard.scorecard_cell WHERE model_id='model:test-layer') AS score_count,
              (SELECT array_agg(action_kind ORDER BY sequence) FROM ledger.ledger_entry WHERE run_id=$1) AS actions,
              (SELECT count(*)::text FROM ledger.ledger_entry WHERE run_id=$1 AND action_kind='MODEL_CALL') AS attempts
       FROM scorecard.answer_outcome AS outcome
       WHERE outcome.run_id=$1 ORDER BY outcome.at_seq DESC LIMIT 1`,
      [runId]
    );
    expect(persisted.rows[0]).toMatchObject({
      accepted: false,
      score_count: "1",
      attempts: before.rows[0]!.attempts
    });
    expect(persisted.rows[0]!.superseded_by_answer_outcome_id).toBeTruthy();
    expect(persisted.rows[0]!.actions).toEqual(expect.arrayContaining([
      "SETTLEMENT_OUTCOME_RECORDED", "SETTLEMENT_ATTEMPT_SUPERSEDED",
      "SETTLEMENT_READ_BACK_VERIFIED", "SCORECARD_DERIVED_FROM_LEDGER"
    ]));
    await expect(database.pool.query(
      "UPDATE scorecard.answer_outcome SET resolver_ref='mutation' WHERE run_id=$1", [runId]
    )).rejects.toThrow(/append-only|immutable/);
  });

  it("does not fire against an incomplete run", async () => {
    const runId = await new RunRepository(database.pool).startRun({
      questionLine: "Incomplete settlement fixture",
      principal: { kind: "legacy", legacyAskerId: "asker:incomplete" }, sessionId: "session:incomplete",
      callerScope: "ASKER", asOf: new Date("2026-08-08T00:00:00.000Z"), askerRiskTier: "casual",
      effectiveRiskTier: "casual", tierSource: "ASKER", tierProvenanceRef: "asker:incomplete",
      compositionBudgetTier: "low", depthParams: { depth: 1 }, discoveredPanel: fixtureDiscoveredPanel(1), strangerSampleRate: 1,
      envelopeBasis: { source: "test-layer" }, registerVersion: 1, batteryVersion: "s12-test-layer", batteryRows: []
    });
    const result = await new SettlementRepository(database.pool).settle({
      outcomeAttemptId: randomUUID(), answerId: randomUUID(), answerVersion: 1,
      asOf: new Date("2026-08-08T00:00:00.000Z"), runId, modelId: "model:test-layer",
      modelVersion: "v1", provider: "provider:test-layer", taskClass: "class:test-layer",
      prior: 0.5, posterior: 0.5, basis: "test-layer", resolverRef: "resolver:test-layer",
      resolverIsExternal: true, resolvedOutcome: true, resolvedAt: new Date("2026-08-08T01:00:00.000Z"),
      provenanceRef: "artifact:test-layer", scoreability: "SCOREABLE", actorRef: "watch:test-layer"
    }, { properScore, calibration, metric: "judge_weight" });
    expect(result).toEqual({ kind: "INCOMPLETE_RUN_SKIPPED", runId });
    const rows = await database.pool.query<{ count: string }>(
      "SELECT count(*)::text AS count FROM scorecard.answer_outcome WHERE run_id=$1", [runId]
    );
    expect(rows.rows[0]!.count).toBe("0");
  });

  it("keeps terminal scorecard facts run-bound and denies runtime direct probe writes", async () => {
    const migration = await readFile("migrations/0049_terminal_recorded_facts.sql", "utf8");
    await database.pool.query(migration);
    await database.pool.query(migration);
    const { runId: foreignRunId, answerId } = await createCompletedAnswer("terminal-facts-foreign");
    const outcome = await new SettlementRepository(database.pool).settle({
      outcomeAttemptId: randomUUID(), answerId, answerVersion: 1,
      asOf: new Date("2026-08-08T00:00:00.000Z"), runId: foreignRunId,
      modelId: "model:terminal-facts", modelVersion: "v1",
      provider: "provider:terminal-facts", taskClass: "class:shared-terminal-facts",
      prior: 0.5, posterior: 0.8, basis: "test-layer:external-resolution",
      resolverRef: "resolver:terminal-facts", resolverIsExternal: true,
      resolvedOutcome: true, resolvedAt: new Date("2026-08-08T01:00:00.000Z"),
      provenanceRef: "artifact:terminal-facts", scoreability: "SCOREABLE",
      actorRef: "watch:terminal-facts"
    }, { properScore, calibration, metric: "judge_weight" });
    expect(outcome).toMatchObject({ kind: "SETTLED" });

    const subjectRunId = await new RunRepository(database.pool).startRun({
      questionLine: "Terminal facts must ignore a foreign scorecard",
      principal: { kind: "legacy", legacyAskerId: "asker:terminal-facts-subject" },
      sessionId: "session:terminal-facts-subject", callerScope: "ASKER",
      asOf: new Date("2026-08-08T00:00:00.000Z"), askerRiskTier: "casual",
      effectiveRiskTier: "casual", tierSource: "ASKER",
      tierProvenanceRef: "asker:terminal-facts-subject", compositionBudgetTier: "low",
      depthParams: { depth: 1 }, discoveredPanel: fixtureDiscoveredPanel(1),
      strangerSampleRate: 1, envelopeBasis: { source: "test-layer" },
      registerVersion: 1, batteryVersion: "s12-test-layer", batteryRows: []
    });
    const privileges = await database.pool.query<{ runtime_insert: boolean }>(
      "SELECT has_table_privilege('debateai_runtime','core.provider_probe','INSERT') AS runtime_insert"
    );
    expect(privileges.rows[0]!.runtime_insert).toBe(false);
    const runtime = await database.pool.connect();
    try {
      await runtime.query("SET ROLE debateai_runtime");
      const facts = await runtime.query<{ scorecard_cells: string }>(
        `SELECT scorecard_cells FROM core.read_terminal_recorded_facts($1)
         UNION ALL
         SELECT scorecard_cells FROM core.read_terminal_recorded_facts($2)`,
        [foreignRunId, subjectRunId]
      );
      expect(facts.rows.map((row) => row.scorecard_cells)).toEqual(["1", "0"]);
      await expect(runtime.query(
        `INSERT INTO core.provider_probe (
           probe_id,provider_ref,maker,state,model_id,failure_code,probed_at
         ) VALUES ($1,'forged','forged','HEALTHY','forged',NULL,clock_timestamp())`,
        [randomUUID()]
      )).rejects.toMatchObject({ code: "42501" });
    } finally {
      await runtime.query("RESET ROLE").catch(() => undefined);
      runtime.release();
    }
  });
});
