import { randomBytes, randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { WorkItemRepository } from "@debateai/battery";
import { PostgresRecentRunUsageSource, RecentRunsCostEstimator, type RunSettingsClass } from "@debateai/budget";
import {
  RunRepository,
  ServeDisclosureRepository,
  migrate,
  type DiscoveredPanelMember,
  type ServeDisclosureBodyStop,
  type ServeDisclosureServeStop
} from "@debateai/db";
import { fixtureDiscoveredPanel, fixtureStructuralCeiling } from "../support/discoveredPanel.js";
import { startTestDatabase, type TestDatabase } from "../support/testDatabase.js";

/**
 * Budget spec §2.5 — the SAMPLE the estimate is read from, in real SQL: the last
 * N runs of one settings class that settled inside the window, and every RUN
 * and STORY charge of each, re-priced at today's prices.
 */
let database: TestDatabase;

beforeAll(async () => {
  database = await startTestDatabase();
  await migrate(database.pool);
}, 600_000);

afterAll(async () => {
  await database?.stop();
});

type RunShape = Readonly<{
  depth?: number;
  planTier?: "free" | "premium";
  makers?: number;
  panel?: readonly DiscoveredPanelMember[];
  compositionBudgetTier?: "low" | "medium" | "high";
  depthParams?: Readonly<Record<string, unknown>>;
  envelopeBasis?: Readonly<Record<string, unknown>>;
}>;

async function run(shape: RunShape = {}): Promise<string> {
  return new RunRepository(database.pool).startRun({
    questionLine: "Does a sample run price itself at today's prices?",
    principal: { kind: "legacy", legacyAskerId: `estimator:${randomUUID()}` },
    sessionId: randomUUID(),
    callerScope: "ASKER",
    asOf: new Date(),
    askerRiskTier: "casual",
    effectiveRiskTier: "casual",
    tierSource: "ASKER",
    tierProvenanceRef: "asker:test",
    compositionBudgetTier: shape.compositionBudgetTier ?? "low",
    planTier: shape.planTier ?? "free",
    depthParams: shape.depthParams ?? { depth: shape.depth ?? 1 },
    discoveredPanel: shape.panel ?? fixtureDiscoveredPanel(shape.makers ?? 2),
    strangerSampleRate: 0,
    envelopeBasis: shape.envelopeBasis ?? fixtureStructuralCeiling(4),
    registerVersion: 1,
    batteryVersion: "test",
    askContract: {},
    batteryRows: []
  });
}

async function job(runId: string, finish: "DONE" | "FAILED" | "READY"): Promise<void> {
  const work = new WorkItemRepository(database.pool);
  const workItemId = await work.enqueue({ runId, batteryRowId: "Q1", commandKey: `S00:${runId}:Q1`, nodeSet: [] });
  if (finish === "DONE") await work.settle({ workItemId, attemptId: randomUUID(), artifactRef: randomUUID() });
  if (finish === "FAILED") {
    await work.recordSetupFailure({ runId, batteryRowId: "Q1", commandKey: `S00:${runId}:Q1`, reason: "TEST_FAILED" });
  }
}

async function spend(input: Readonly<{
  runId: string; source?: "RUN" | "STORY"; providerRef?: string;
  inputTokens?: number; outputTokens?: number; recordedAt: Date;
}>): Promise<void> {
  await database.pool.query(
    `INSERT INTO ledger.model_spend
       (spend_id, spend_source, run_id, provider_ref, charged_on, charge_micros, input_tokens, output_tokens, recorded_at)
     VALUES ($1,$2,$3,$4,$5::date,1,$6,$7,$8)`,
    [randomUUID(), input.source ?? "RUN", input.runId, input.providerRef ?? "provider:cheap",
      input.recordedAt.toISOString().slice(0, 10), input.inputTokens ?? 1, input.outputTokens ?? 1, input.recordedAt]
  );
}

const HOUR = 3_600_000;

describe("B2 the recent-runs sample (budget spec §2.5)", () => {
  it("samples only settled runs of the same class whose last charge is inside the window, newest first", async () => {
    const now = new Date();
    const cls: RunSettingsClass = Object.freeze({ planTier: "free", compositionBudgetTier: "low", makerCount: 2, depth: 1 });
    const sampled: string[] = [];
    for (const hoursAgo of [26, 25, 24]) {
      const runId = await run();
      await job(runId, "DONE");
      await spend({ runId, recordedAt: new Date(now.getTime() - hoursAgo * HOUR) });
      sampled.unshift(runId);
    }
    const noise: Array<[RunShape, "DONE" | "FAILED" | "READY" | null, number]> = [
      [{ depth: 2 }, "DONE", 1],
      [{ planTier: "premium" }, "DONE", 1],
      [{ makers: 3 }, "DONE", 1],
      [{}, "READY", 1],
      [{}, "FAILED", 1],
      [{}, "DONE", 31 * 24],
      [{}, null, 1]
    ];
    for (const [shape, finish, hoursAgo] of noise) {
      const runId = await run(shape);
      if (finish !== null) await job(runId, finish);
      await spend({ runId, recordedAt: new Date(now.getTime() - hoursAgo * HOUR) });
    }

    const read = await new PostgresRecentRunUsageSource(database.pool).readRecentRunUsage({
      settings: cls, since: new Date(now.getTime() - 30 * 24 * HOUR), limit: 20
    });
    expect(read.map((sample) => sample.runId)).toEqual(sampled);
  });

  it("limits the sample to the newest N and prices RUN and STORY charges at today's prices", async () => {
    const now = new Date();
    const cls: RunSettingsClass = Object.freeze({ planTier: "free", compositionBudgetTier: "medium", makerCount: 2, depth: 1 });
    for (let k = 1; k <= 21; k += 1) {
      const runId = await run({ compositionBudgetTier: "medium" });
      await job(runId, "DONE");
      const recordedAt = new Date(now.getTime() - (22 - k) * 60_000);
      // k × 10 000 input tokens at 0.1 USD / million = k × 1 000 micro-units …
      await spend({ runId, inputTokens: k * 10_000, outputTokens: 0, recordedAt });
      // … and a story on a vendor no longer configured: 100 output tokens at the highest output price (0.5 USD / million) = 50.
      await spend({ runId, source: "STORY", providerRef: "provider:gone", inputTokens: 0, outputTokens: 100, recordedAt });
    }
    const estimator = new RecentRunsCostEstimator({
      source: new PostgresRecentRunUsageSource(database.pool),
      prices: new Map([["provider:cheap", { inputMicrosPerMillionTokens: 100_000, outputMicrosPerMillionTokens: 500_000 }]]),
      maximumMicros: 300_000,
      clock: () => now
    });
    // The newest 20 are k = 2 … 21; rank 15 of those is k = 16: 16 000 + 50.
    await expect(estimator.estimateMicros(cls)).resolves.toBe(16_050);
  });

  it("counts a panel's MODELS, so two models of one maker are still the class of a two-model roster", async () => {
    const now = new Date();
    // The ask side counts PLAN_TIER_ROSTERS[tier].length (models); the stored side must count the same.
    const cls: RunSettingsClass = Object.freeze({ planTier: "free", compositionBudgetTier: "high", makerCount: 2, depth: 1 });
    const oneMaker = fixtureDiscoveredPanel(2).map((member) => Object.freeze({ ...member, maker: "maker:shared" }));
    const runId = await run({ compositionBudgetTier: "high", panel: oneMaker });
    await job(runId, "DONE");
    await spend({ runId, recordedAt: new Date(now.getTime() - HOUR) });
    const read = await new PostgresRecentRunUsageSource(database.pool).readRecentRunUsage({
      settings: cls, since: new Date(now.getTime() - 24 * HOUR), limit: 20
    });
    expect(read.map((sample) => sample.runId)).toEqual([runId]);
  });

  it("debate shape: shaped runs and today's runs of one depth are sampled apart, and a shaped class by its plan", async () => {
    const now = new Date();
    const shapedParams = { depth: 1, depthMode: "adaptive", scrutiny: "standard", answerLength: "standard" };
    const receipt = (plan: string) => ({ ...fixtureStructuralCeiling(4), shape: { plan } });
    const today = await run({ compositionBudgetTier: "medium", makers: 3 });
    const pro = await run({ compositionBudgetTier: "medium", makers: 3, depthParams: shapedParams, envelopeBasis: receipt("pro") });
    const max = await run({ compositionBudgetTier: "medium", makers: 3, depthParams: shapedParams, envelopeBasis: receipt("max") });
    // M1: a one-maker run asked with the row stores the four settings but mints no shape (M < 2); its models still
    // make it a three-model class, and it must never join a shaped class's sample.
    const sharedMaker = fixtureDiscoveredPanel(3).map((member) => Object.freeze({ ...member, maker: "maker:shared" }));
    const oneMaker = await run({ compositionBudgetTier: "medium", panel: sharedMaker, depthParams: shapedParams });
    for (const runId of [today, pro, max, oneMaker]) {
      await job(runId, "DONE");
      await spend({ runId, recordedAt: new Date(now.getTime() - HOUR) });
    }
    const read = (settings: RunSettingsClass) => new PostgresRecentRunUsageSource(database.pool).readRecentRunUsage({
      settings, since: new Date(now.getTime() - 24 * HOUR), limit: 20
    }).then((samples) => samples.map((sample) => sample.runId));
    const base: RunSettingsClass = { planTier: "free", compositionBudgetTier: "medium", makerCount: 3, depth: 1 };
    await expect(read(base)).resolves.toEqual([today]);
    await expect(read({ ...base, shape: { plan: "pro", depthMode: "adaptive", scrutiny: "standard", answerLength: "standard" } }))
      .resolves.toEqual([pro]);
    await expect(read({ ...base, shape: { plan: "pro", depthMode: "fixed", scrutiny: "standard", answerLength: "standard" } }))
      .resolves.toEqual([]);
    // T7: each of the other two settings filters on its own.
    await expect(read({ ...base, shape: { plan: "pro", depthMode: "adaptive", scrutiny: "deep", answerLength: "standard" } }))
      .resolves.toEqual([]);
    await expect(read({ ...base, shape: { plan: "pro", depthMode: "adaptive", scrutiny: "standard", answerLength: "detailed" } }))
      .resolves.toEqual([]);
    // M1: no plan's shaped class samples the shapeless one-maker run, whatever its plan.
    for (const plan of ["free", "plus", "pro", "max", "premium"] as const) {
      const sample = await read({ ...base, shape: { plan, depthMode: "adaptive", scrutiny: "standard", answerLength: "standard" } });
      expect(sample).not.toContain(oneMaker);
    }
  });
});

/**
 * NV-49 (security audit run 3) — ONE OWNER CANNOT SET A CLASS'S ESTIMATE. At most one run per owner joins a class's
 * sample, the owner read as core.run_waiting_v reads it (the latest ownership event, else an `owner:` asker id; a legacy
 * asker is its own owner); and no run a DAILY or ALLOWANCE wall stopped is sampled, whether the runner recorded that stop
 * as a condition mark (a non-DEFECT answer) or only on the disclosure row (a DEFECT answer carries no mark). A MONEY
 * stop stays: it marks an expensive run. Each case uses a class no other case seeds.
 */
describe("NV-49 one owner cannot set a class's estimate", () => {
  const MINUTE = 60_000;
  const prices = new Map([["provider:cheap", { inputMicrosPerMillionTokens: 100_000, outputMicrosPerMillionTokens: 500_000 }]]);
  /** 1 000 000 input tokens at 0.1 USD / million = 100 000 micro-units; 10 000 = 1 000. */
  const DEAR = 1_000_000;
  const CHEAP = 10_000;

  async function activeOwner(): Promise<string> {
    const ownerRef = randomUUID();
    await database.pool.query(
      `INSERT INTO identity."user" (
         user_id,email_blind_index,email_ciphertext,recovery_email_ciphertext,
         phone_ciphertext,password_hash,pseudonym,audit_token,owner_ref,state,
         adult_affirmed_at,created_at
       ) VALUES ($1,$2,'{}'::jsonb,'{}'::jsonb,NULL,'test-password-hash',$3,$4,$5,'active',now(),now())`,
      [randomUUID(), randomBytes(32), `estimator-${randomUUID()}`, randomUUID(), ownerRef]
    );
    return ownerRef;
  }

  async function ownedRun(ownerRef: string, shape: RunShape): Promise<string> {
    const runId = await run(shape);
    await database.pool.query("SELECT core.append_run_ownership_event($1,$2)", [runId, ownerRef]);
    return runId;
  }

  /** A settled run of `ownerRef` (null: a legacy asker of its own) with one RUN charge of `inputTokens`. */
  async function settled(ownerRef: string | null, shape: RunShape, inputTokens: number, recordedAt: Date): Promise<string> {
    const runId = ownerRef === null ? await run(shape) : await ownedRun(ownerRef, shape);
    await job(runId, "DONE");
    await spend({ runId, inputTokens, outputTokens: 0, recordedAt });
    return runId;
  }

  type AnswerRef = Readonly<{ answerId: string; answerVersion: number }>;

  /** The run's answer on its one job, carrying `marks` as the answer's condition_marks. */
  async function answerOf(runId: string, marks: readonly string[]): Promise<AnswerRef> {
    const work = await database.pool.query<{ work_item_id: string }>(
      "SELECT work_item_id FROM core.work_item WHERE run_id=$1", [runId]
    );
    const bundle = await database.pool.query<{ fact_bundle_id: string }>(
      `INSERT INTO serve.fact_bundle (run_id, facts, residual_objections, content_hash, version)
       VALUES ($1,'[]'::jsonb,'[]'::jsonb,$2,1) RETURNING fact_bundle_id`,
      [runId, `hash:nv49:${randomUUID()}`]
    );
    const answer = await database.pool.query<{ answer_id: string }>(
      `INSERT INTO serve.answer (
         answer_version, run_id, work_item_id, terminal, serve_state, verdict_state, answer_form,
         condition_marks, fact_bundle_id, sealed_at_seq
       ) VALUES (1,$1,$2,'SERVED','COMPOSED','SUPPORTED',$3::jsonb,$4::jsonb,$5,ledger.allocate_sequence())
       RETURNING answer_id`,
      [runId, work.rows[0]!.work_item_id, JSON.stringify({ kind: "test-layer" }), JSON.stringify(marks),
        bundle.rows[0]!.fact_bundle_id]
    );
    return Object.freeze({ answerId: answer.rows[0]!.answer_id, answerVersion: 1 });
  }

  /** The envelope record the runner writes on a non-DEFECT answer: `reason` is ENVELOPE_STOP_REASONS[kind]. */
  async function envelopeMark(answer: AnswerRef, runId: string, reason: string): Promise<void> {
    await database.pool.query(
      `INSERT INTO serve.condition_mark (answer_id, answer_version, mark, scope, subject_ref, reason, at_seq)
       VALUES ($1,$2,'ENVELOPE_EXHAUSTED','answer',$3,$4,ledger.allocate_sequence())`,
      [answer.answerId, answer.answerVersion, runId, reason]
    );
  }

  /** The answer's disclosure row (the runner writes one for every answer), with the given stops. */
  async function disclosure(answer: AnswerRef, runId: string, stops: Readonly<{
    bodyStop?: ServeDisclosureBodyStop; serveStop?: ServeDisclosureServeStop;
  }>): Promise<void> {
    await new ServeDisclosureRepository(database.pool).insert({
      answerId: answer.answerId, answerVersion: answer.answerVersion, runId,
      writerPlannedRef: "p:writer", checkerPlannedRef: "p:checker",
      writerServedRef: "p:writer", checkerServedRef: "p:checker",
      writerFallback: false, checkerFallback: false, fallbackReason: null, checkerSameAsWriter: false,
      bodyStop: stops.bodyStop ?? null, pointsWithoutReview: null, serveStop: stops.serveStop ?? null,
      digestRung: null, digestPointsOmitted: null, floorVerdictState: null, floorLeadingNodeId: null, floorReason: null
    });
  }

  /**
   * A settled run of `ownerRef` with NO ownership event and an `owner:` asker id: the owner key's fallback branch.
   * Copied from a fresh legacy run by the installer under `session_replication_role = replica` (core.run is insert-only
   * and refuses an unencrypted `owner:` insert; replica mode lifts both triggers for this transaction only), as
   * tests/integration/owner-concurrent-debates.test.ts's noEventOwnerRun does, with a DONE job and a RUN charge.
   */
  async function noEventOwnerRun(ownerRef: string, shape: RunShape, inputTokens: number, recordedAt: Date): Promise<string> {
    const source = await run(shape);
    const runId = randomUUID();
    const client = await database.pool.connect();
    try {
      await client.query("BEGIN");
      await client.query("SET LOCAL session_replication_role = replica");
      await client.query(
        `INSERT INTO core.run SELECT (jsonb_populate_record(NULL::core.run, to_jsonb(r) || jsonb_build_object(
           'run_id', $2::uuid, 'asker_id', 'owner:' || $3::uuid::text, 'created_at_seq', ledger.allocate_sequence()))).*
         FROM core.run AS r WHERE r.run_id = $1`,
        [source, runId, ownerRef]
      );
      await client.query(
        `INSERT INTO core.work_item (run_id, battery_row_id, node_set, command_key, state, created_at_seq)
         VALUES ($1::uuid, 'Q1', '[]'::jsonb, 'S00:' || $1::uuid::text || ':Q1', 'DONE', ledger.allocate_sequence())`,
        [runId]
      );
      await client.query(
        `INSERT INTO ledger.model_spend
           (spend_id, spend_source, run_id, provider_ref, charged_on, charge_micros, input_tokens, output_tokens, recorded_at)
         VALUES ($1,'RUN',$2,'provider:cheap',$3::date,1,$4,0,$5)`,
        [randomUUID(), runId, recordedAt.toISOString().slice(0, 10), inputTokens, recordedAt]
      );
      await client.query("COMMIT");
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
    return runId;
  }

  const read = (settings: RunSettingsClass, now: Date, maxPerOwner?: number) =>
    new PostgresRecentRunUsageSource(database.pool).readRecentRunUsage({
      settings, since: new Date(now.getTime() - 30 * 24 * HOUR), limit: 20, ...(maxPerOwner === undefined ? {} : { maxPerOwner })
    }).then((samples) => samples.map((sample) => sample.runId));

  it("(red) fifteen cheap runs of one owner among twenty no longer set the class's P75", async () => {
    const now = new Date();
    const shape: RunShape = { planTier: "free", compositionBudgetTier: "high", depth: 3 };
    const cls: RunSettingsClass = Object.freeze({ planTier: "free", compositionBudgetTier: "high", makerCount: 2, depth: 3 });
    const ownerB = await activeOwner();
    const ownerA = await activeOwner();
    let newestB = "";
    for (let minutesAgo = 30; minutesAgo >= 26; minutesAgo -= 1) {
      newestB = await settled(ownerB, shape, DEAR, new Date(now.getTime() - minutesAgo * MINUTE));
    }
    let newestA = "";
    for (let minutesAgo = 25; minutesAgo >= 11; minutesAgo -= 1) {
      newestA = await settled(ownerA, shape, CHEAP, new Date(now.getTime() - minutesAgo * MINUTE));
    }
    const estimator = new RecentRunsCostEstimator({
      source: new PostgresRecentRunUsageSource(database.pool), prices, maximumMicros: 300_000, clock: () => now
    });
    // Two owners: two samples, below 20, so the maximum. Before NV-49: rank 15 of 20 was one of A's, 1 000.
    await expect(estimator.estimateMicros(cls)).resolves.toBe(300_000);
    await expect(read(cls, now, 1)).resolves.toEqual([newestA, newestB]);
  });

  it("(red) with the start policy, four cheap runs of one owner among five no longer set the class's P75", async () => {
    const now = new Date();
    const shape: RunShape = { planTier: "free", compositionBudgetTier: "high", depth: 2 };
    const cls: RunSettingsClass = Object.freeze({ planTier: "free", compositionBudgetTier: "high", makerCount: 2, depth: 2 });
    const ownerB = await activeOwner();
    const ownerA = await activeOwner();
    await settled(ownerB, shape, DEAR, new Date(now.getTime() - 10 * MINUTE));
    for (let minutesAgo = 9; minutesAgo >= 6; minutesAgo -= 1) {
      await settled(ownerA, shape, CHEAP, new Date(now.getTime() - minutesAgo * MINUTE));
    }
    const estimator = new RecentRunsCostEstimator({
      source: new PostgresRecentRunUsageSource(database.pool), prices, maximumMicros: 300_000, clock: () => now,
      start: { minSamples: 5, startMicrosByDepth: new Map() }
    });
    // Two samples, below the trusted five, and no figure for the depth: the maximum. Before NV-49: rank 4 of 5, 1 000.
    await expect(estimator.estimateMicros(cls)).resolves.toBe(300_000);
  });

  it("(red) a run a DAILY or ALLOWANCE wall stopped is not sampled, by its condition mark; a MONEY stop is", async () => {
    const now = new Date();
    const shape: RunShape = { planTier: "premium", compositionBudgetTier: "medium", depth: 2 };
    const cls: RunSettingsClass = Object.freeze({ planTier: "premium", compositionBudgetTier: "medium", makerCount: 2, depth: 2 });
    const at = (minutesAgo: number) => new Date(now.getTime() - minutesAgo * MINUTE);
    const f = await settled(await activeOwner(), shape, DEAR, at(4));
    await answerOf(f, []);
    const e = await settled(await activeOwner(), shape, DEAR, at(3));
    await envelopeMark(await answerOf(e, ["ENVELOPE_EXHAUSTED"]), e, "RUN_COST_ENVELOPE_MONEY_REACHED");
    const d = await settled(await activeOwner(), shape, CHEAP, at(2));
    await envelopeMark(await answerOf(d, ["ENVELOPE_EXHAUSTED"]), d, "PERSON_ALLOWANCE_REACHED");
    const c = await settled(await activeOwner(), shape, CHEAP, at(1));
    await envelopeMark(await answerOf(c, ["ENVELOPE_EXHAUSTED"]), c, "DAILY_COST_ENVELOPE_REACHED");
    await expect(read(cls, now)).resolves.toEqual([e, f]);
  });

  it("(red) a DEFECT answer's wall stop, recorded only on its disclosure row, keeps the run out; MONEY and no stop stay", async () => {
    const now = new Date();
    const shape: RunShape = { planTier: "premium", compositionBudgetTier: "medium", depth: 3 };
    const cls: RunSettingsClass = Object.freeze({ planTier: "premium", compositionBudgetTier: "medium", makerCount: 2, depth: 3 });
    const at = (minutesAgo: number) => new Date(now.getTime() - minutesAgo * MINUTE);
    const j = await settled(await activeOwner(), shape, DEAR, at(4));
    await disclosure(await answerOf(j, []), j, {});
    const i = await settled(await activeOwner(), shape, DEAR, at(3));
    await disclosure(await answerOf(i, []), i, { bodyStop: "MONEY" });
    const h = await settled(await activeOwner(), shape, CHEAP, at(2));
    await disclosure(await answerOf(h, ["DEFECT"]), h, { serveStop: "ALLOWANCE" });
    const g = await settled(await activeOwner(), shape, CHEAP, at(1));
    await disclosure(await answerOf(g, ["DEFECT"]), g, { bodyStop: "DAILY" });
    await expect(read(cls, now)).resolves.toEqual([i, j]);
  });

  it("(red) an owner's run with no ownership event is keyed by its owner: asker id, as the waiting line keys it", async () => {
    const now = new Date();
    const shape: RunShape = { planTier: "premium", compositionBudgetTier: "high", depth: 1 };
    const cls: RunSettingsClass = Object.freeze({ planTier: "premium", compositionBudgetTier: "high", makerCount: 2, depth: 1 });
    const ownerA = await activeOwner();
    const older = await noEventOwnerRun(ownerA, shape, CHEAP, new Date(now.getTime() - 5 * MINUTE));
    const newer = await settled(ownerA, shape, CHEAP, new Date(now.getTime() - 4 * MINUTE));
    // Both are candidates (a cap of two samples both) …
    await expect(read(cls, now, 2)).resolves.toEqual([newer, older]);
    // … and one owner's: only the newer joins the sample.
    await expect(read(cls, now)).resolves.toEqual([newer]);
  });

  it("(guard) both API roles may read every table the sample now reads", async () => {
    const tables = ["serve.answer", "serve.condition_mark", "serve.serve_disclosure", "core.run", "core.run_ownership_event"];
    for (const role of ["debateai_runtime", "debateai_billing_runtime"]) {
      for (const table of tables) {
        const privilege = await database.pool.query<{ allowed: boolean }>(
          "SELECT has_table_privilege($1, $2, 'SELECT') AS allowed", [role, table]
        );
        expect({ role, table, allowed: privilege.rows[0]!.allowed }).toEqual({ role, table, allowed: true });
      }
    }
  });
});
