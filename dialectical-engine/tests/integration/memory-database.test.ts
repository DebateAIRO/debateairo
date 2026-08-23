import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { RunRepository, migrate } from "@debateai/db";
import {
  MemoryRepository,
  canonicalizeQuestionText,
  renderMemorySentence,
  type MemoryQuestionKey
} from "@debateai/memory";
import { ServeRepository } from "@debateai/serve";
import {
  SettlementRepository,
  type CalibrationStrategy,
  type RegisteredProperScore
} from "@debateai/settlement";
import { persistTerminalRun } from "../support/settledRun.js";
import { startTestDatabase, type TestDatabase } from "../support/testDatabase.js";
import { fixtureDiscoveredPanel } from "../support/discoveredPanel.js";

let database: TestDatabase;

const properScore: RegisteredProperScore = Object.freeze({
  rowKey: "test-layer:proper-score", registerVersion: 404_013, sourceRef: "test-layer:FX-S22-04",
  score: () => Object.freeze({ total: 0, reliability: 0, resolution: 0, uncertainty: 0 })
});
const calibration: CalibrationStrategy = Object.freeze({
  rowKey: "test-layer:calibration", registerVersion: 404_013, sourceRef: "test-layer:FX-S22-04",
  deriveValue: () => 0, deriveInterval: () => Object.freeze({ lower: 0, upper: 0 })
});

async function createRun(label: string, questionLine: string): Promise<string> {
  return new RunRepository(database.pool).startRun({
    questionLine, principal: { kind: "legacy", legacyAskerId: "asker:s13-test-layer" },
    sessionId: `session:${label}`, callerScope: "ASKER",
    asOf: new Date("2026-08-08T00:00:00.000Z"), askerRiskTier: "casual", effectiveRiskTier: "casual",
    tierSource: "ASKER", tierProvenanceRef: `asker:${label}`, compositionBudgetTier: "low",
    depthParams: { depth: 1 }, discoveredPanel: fixtureDiscoveredPanel(1), strangerSampleRate: 1,
    envelopeBasis: { source: "test-layer" }, registerVersion: 1,
    batteryVersion: "s13-test-layer", batteryRows: []
  });
}

function questionKey(runId: string, question: string): MemoryQuestionKey {
  return Object.freeze({
    runId, canonicalQuestionText: canonicalizeQuestionText(question), callerScope: "ASKER",
    askerScope: "asker:s13-test-layer", settlementAct: null, questionType: null,
    declaredField: null, normalizedBinding: Object.freeze({}), frozenTerms: Object.freeze([]),
    frozenQuerySetHash: null, asOf: "2026-08-08T00:00:00.000Z", policyVersion: 1, keyVersion: 1
  });
}

beforeAll(async () => {
  database = await startTestDatabase();
  await migrate(database.pool);
});
afterAll(async () => database?.stop());

describe("S13 / FX-S22-04 / FX-PT-MEM — real PostgreSQL memory path", () => {
  it("derives immutable memory scope from authenticated ownership and rejects a raw user carrier", async () => {
    const question = `Can a raw identity enter memory ${randomUUID()}?`;
    const runId = await createRun("raw-scope", question);
    const rawScope = `user:${randomUUID()}`;
    await expect(new MemoryRepository(database.pool).recordQuestionAndMatch({
      key: Object.freeze({ ...questionKey(runId, question), askerScope: rawScope }),
      decidedBy: "test-layer:raw-scope",
      ownership: "asker:s13-test-layer"
    })).rejects.toMatchObject({ code: "MEMORY_ASKER_SCOPE_MISMATCH" });
    expect((await database.pool.query<{ count: string }>(
      `SELECT count(*) FROM memory.question_key WHERE run_id=$1`, [runId]
    )).rows[0]!.count).toBe("0");
  });

  it("links one settled exact question, pins the pull, serves disclosure, never closes transitively, and unlinks append-only", async () => {
    const question = "Should the city build a tram?";
    const memory = new MemoryRepository(database.pool);
    const priorRunId = await createRun("prior", question);
    await expect(memory.recordQuestionAndMatch({
      key: questionKey(priorRunId, question), decidedBy: "test-layer:matcher",
      ownership: "asker:s13-test-layer"
    })).resolves.toBeNull();
    const priorAnswerId = (await persistTerminalRun({
      pool: database.pool,
      runId: priorRunId,
      fixtureKey: "s13-prior",
      factBundle: {
        facts: ["fact:prior"], residualObjections: [], badges: [], conditionMarks: [],
        reversalPoint: "reversal:prior", buildsOnPrevious: { value: false, answerRef: null },
        memoryDisclosure: null
      }
    })).answerId;
    await new SettlementRepository(database.pool).settle({
      outcomeAttemptId: randomUUID(), answerId: priorAnswerId, answerVersion: 1,
      asOf: new Date("2026-08-08T00:00:00.000Z"), runId: priorRunId,
      modelId: "model:s13-test-layer", modelVersion: "v1", provider: "provider:s13-test-layer",
      taskClass: "class:s13-test-layer", prior: 0.5, posterior: 0.7,
      basis: "test-layer:resolver", resolverRef: "resolver:s13-test-layer", resolverIsExternal: true,
      resolvedOutcome: true, resolvedAt: new Date("2026-08-08T01:00:00.000Z"),
      provenanceRef: "artifact:s13-test-layer", scoreability: "PERMANENTLY_UNSCOREABLE",
      actorRef: "settlement-watch:s13-test-layer"
    }, { properScore, calibration, metric: "judge_weight" });

    const currentRunId = await createRun("current", question);
    const disclosure = await memory.recordQuestionAndMatch({
      key: questionKey(currentRunId, question), decidedBy: "test-layer:matcher",
      ownership: "asker:s13-test-layer",
      pullPolicy: {
        bound: 1, rowKey: "test-layer:memory-pull-cap", registerVersion: 404_013,
        sourceRef: "test-layer:FX-S22-04"
      }
    });
    expect(disclosure).toMatchObject({
      matched: true, tier: "EXACT_QUESTION", relation: "REPEATS",
      prior: { answer_id: priorAnswerId, staleness_state: "FRESH" }
    });
    expect(disclosure!.pulls).toHaveLength(1);
    expect(disclosure!.pulls[0]!.contentHash).toMatch(/^[a-f0-9]{64}$/);
    expect(renderMemorySentence(disclosure!)).toContain("EXACT_QUESTION");

    const currentAnswerId = (await persistTerminalRun({
      pool: database.pool,
      runId: currentRunId,
      fixtureKey: "s13-current",
      factBundle: {
        facts: ["fact:current"], residualObjections: [], badges: [], conditionMarks: [],
        reversalPoint: "reversal:current",
        buildsOnPrevious: { value: disclosure?.matched === true, answerRef: disclosure?.prior?.answer_id ?? null },
        memoryDisclosure: disclosure
      }
    })).answerId;
    const projection = await new ServeRepository(database.pool).readAnswerProjection(
      currentAnswerId, "asker:s13-test-layer"
    );
    expect(projection?.memory_disclosure).toMatchObject({ matched: true, tier: "EXACT_QUESTION" });
    const direct = await database.pool.query<{ count: string; transitive: string }>(
      `SELECT count(*)::text AS count,
              count(*) FILTER (WHERE source_run_id=$1 AND prior_run_id<>$2)::text AS transitive
       FROM memory.memory_link WHERE source_run_id=$1`, [currentRunId, priorRunId]
    );
    expect(direct.rows[0]).toEqual({ count: "1", transitive: "0" });

    const unlinked = await memory.unlinkForAnswer(currentAnswerId, "asker:s13-test-layer", "asker:s13-test-layer");
    expect(unlinked).not.toBeNull();
    expect(unlinked!.memoryLinkId).toBe(disclosure!.memory_link_id);
    const after = await new ServeRepository(database.pool).readAnswerProjection(currentAnswerId, "asker:s13-test-layer");
    expect(after?.memory_disclosure).toBeNull();
    expect(after?.builds_on_previous).toEqual({ value: false, answer_ref: null });
    await expect(database.pool.query(
      "UPDATE memory.memory_link SET relation='RELATED_ONLY' WHERE memory_link_id=$1", [unlinked!.memoryLinkId]
    )).rejects.toThrow(/append-only|immutable/);
  });

  it("does not link a legacy candidate after an ownership claim changes its effective scope", async () => {
    const question = `Can a claimed prior run leak through memory ${randomUUID()}?`;
    const memory = new MemoryRepository(database.pool);
    const priorRunId = await createRun("claimed-prior", question);
    await expect(memory.recordQuestionAndMatch({
      key: questionKey(priorRunId, question),
      decidedBy: "test-layer:matcher",
      ownership: "asker:s13-test-layer"
    })).resolves.toBeNull();
    const priorAnswerId = (await persistTerminalRun({
      pool: database.pool,
      runId: priorRunId,
      fixtureKey: "s7-claimed-prior",
      factBundle: {
        facts: ["fact:claimed-prior"], residualObjections: [], badges: [], conditionMarks: [],
        reversalPoint: "reversal:claimed-prior", buildsOnPrevious: { value: false, answerRef: null },
        memoryDisclosure: null
      }
    })).answerId;
    await new SettlementRepository(database.pool).settle({
      outcomeAttemptId: randomUUID(), answerId: priorAnswerId, answerVersion: 1,
      asOf: new Date("2026-08-08T00:00:00.000Z"), runId: priorRunId,
      modelId: "model:s7-claim", modelVersion: "v1", provider: "provider:s7-claim",
      taskClass: "class:s7-claim", prior: 0.5, posterior: 0.7,
      basis: "test-layer:resolver", resolverRef: "resolver:s7-claim", resolverIsExternal: true,
      resolvedOutcome: true, resolvedAt: new Date("2026-08-08T01:00:00.000Z"),
      provenanceRef: "artifact:s7-claim", scoreability: "PERMANENTLY_UNSCOREABLE",
      actorRef: "settlement-watch:s7-claim"
    }, { properScore, calibration, metric: "judge_weight" });

    const ownerRef = randomUUID();
    const auditToken = randomUUID();
    await database.pool.query(
      `INSERT INTO identity."user" (
         email_blind_index,email_ciphertext,recovery_email_ciphertext,phone_ciphertext,
         password_hash,pseudonym,audit_token,owner_ref,state,adult_affirmed_at,created_at
       ) VALUES ($1,'{}'::jsonb,'{}'::jsonb,NULL,'test-password-hash',$2,$3,$4,'active',now(),now())`,
      [Buffer.alloc(32, 0x4d), `s7-memory-claim-${randomUUID()}`, auditToken, ownerRef]
    );
    const currentRunId = await createRun("claim-current", question);
    const blocker = await database.pool.connect();
    const claimant = await database.pool.connect();
    let disclosure: Awaited<ReturnType<MemoryRepository["recordQuestionAndMatch"]>> | undefined;
    let claim: Promise<unknown> | undefined;
    let matching: Promise<Awaited<ReturnType<MemoryRepository["recordQuestionAndMatch"]>>> | undefined;
    try {
      await blocker.query("BEGIN");
      await blocker.query("SELECT run_id FROM core.run WHERE run_id=$1 FOR UPDATE", [priorRunId]);
      await claimant.query("BEGIN");
      const claimantPid = (await claimant.query<{ pid: number }>("SELECT pg_backend_pid() AS pid")).rows[0]!.pid;
      claim = claimant.query(
        `SELECT core.append_run_ownership_event($1,$2) AS at_seq`, [priorRunId, ownerRef]
      );
      let claimWait: string | null = null;
      for (let attempt = 0; attempt < 30 && claimWait !== "Lock"; attempt += 1) {
        claimWait = (await database.pool.query<{ wait_event_type: string | null }>(
          "SELECT wait_event_type FROM pg_stat_activity WHERE pid=$1", [claimantPid]
        )).rows[0]?.wait_event_type ?? null;
        if (claimWait !== "Lock") await new Promise((resolve) => setTimeout(resolve, 5));
      }
      expect(claimWait).toBe("Lock");

      matching = memory.recordQuestionAndMatch({
        key: questionKey(currentRunId, question),
        decidedBy: "test-layer:matcher",
        ownership: "asker:s13-test-layer"
      });
      let lockWaiters = 0;
      for (let attempt = 0; attempt < 30 && lockWaiters < 2; attempt += 1) {
        lockWaiters = Number((await database.pool.query<{ count: string }>(
          `SELECT count(*) FROM pg_stat_activity
           WHERE wait_event_type='Lock'
             AND (query LIKE '%run_ownership_event%' OR query LIKE '%core.run WHERE run_id%FOR UPDATE%')`
        )).rows[0]!.count);
        if (lockWaiters < 2) await new Promise((resolve) => setTimeout(resolve, 5));
      }
      expect(lockWaiters).toBeGreaterThanOrEqual(2);
      await blocker.query("COMMIT");
      await claim;
      await claimant.query("COMMIT");
      disclosure = await matching;
    } finally {
      await blocker.query("ROLLBACK").catch(() => undefined);
      await claimant.query("ROLLBACK").catch(() => undefined);
      await claim?.catch(() => undefined);
      await matching?.catch(() => undefined);
      blocker.release();
      claimant.release();
    }
    expect(disclosure).toBeNull();
    expect((await database.pool.query<{ count: string }>(
      `SELECT count(*) FROM memory.memory_link WHERE source_run_id=$1`, [currentRunId]
    )).rows[0]!.count).toBe("0");
  }, 60_000);
});
