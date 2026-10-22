import { randomBytes, randomUUID } from "node:crypto";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import type { PoolClient } from "pg";
import { PostgresAskApplication, type Dispatcher, type RunCreationSettings } from "@debateai/api";
import { WorkItemRepository } from "@debateai/battery";
import { PostgresModelSpendStore } from "@debateai/budget";
import { PLAN_TIER_ROSTERS, type AskRequest, type Session } from "@debateai/contract";
import {
  EntitlementRepository, RunRepository, RunWaitRepository, type ReadmissionPrincipal, type RunOwnershipAccess, type StartRunInput
} from "@debateai/db";
import { ServeRepository } from "@debateai/serve";
import {
  BILLING_PLANS_DEPLOYMENT_REGISTER_ROW, billingPlansFromValue, debateShapePolicyStartValues, parseDebateShapePolicy,
  parseRegisterVersionText, registerVersionToSafeLegacyNumber
} from "@debateai/register";
import { createActiveSettingsVersionReader, readActiveSettingsVersionOn } from "../../apps/api/src/active-settings-version.js";
import type { AdmissionRunMembers } from "../../apps/api/src/admission-settings.js";
import { AskRoom, type AskRoomOptions } from "../../apps/api/src/ask-room.js";
import { PostgresAskAdmissionGate } from "../../apps/api/src/release-state.js";
import { importHistoricalRegisterFixture, publishReplacementRegisterFixture, registerFixtureRow } from "../support/registerFixtures.js";
import { startContentRunFixture, type ContentRunFixture } from "../support/contentRunFixture.js";
import { fixtureDiscoveredPanel, fixtureStructuralCeiling } from "../support/discoveredPanel.js";
import { TEST_RELEASE_KEY } from "../support/releaseKey.js";
import { createTestAskAdmissionPoolFacades } from "../support/testDatabase.js";

/**
 * Side-by-side uploads spec 2026-10-21 §4, O3 — RE-ADMISSION, the database half. Plan C task C10: a waiting debate's
 * stored ask is read back whole (`RunRepository.readStoredAsk`, under the run's content lease, decrypted like
 * `readFrozenHead`), and the waker's line carries each run's own release (`WaitingRun.releaseKey`), so the API can tell
 * a run another release admitted. Plan C task C11: the START that re-admits — the current release's waker starts a
 * debate another release admitted as a NEW run, superseding the old one (core.run_supersession), or tells the person to
 * ask again, or leaves it waiting. Over embedded Postgres and migration 0123, with the content cipher configured
 * (tests/support/contentRunFixture.ts). CI skips this directory; run it alone.
 */
let fixture: ContentRunFixture;

beforeAll(async () => {
  fixture = await startContentRunFixture("side-by-side-c10");
}, 600_000);

afterAll(async () => {
  await fixture?.stop();
});

describe("RunRepository.readStoredAsk (side-by-side C10)", () => {
  it("reads a legacy-principal run's question and contract unchanged, with its stamp and stored choices", async () => {
    const question = "Should a legacy run keep its question when it is re-admitted?";
    const runId = await fixture.createLegacyRun(question, { releaseKey: TEST_RELEASE_KEY });
    const stored = await new RunRepository(fixture.database.pool).readStoredAsk(runId);
    const row = (await fixture.database.pool.query<{ asker_id: string; session_id: string }>(
      "SELECT asker_id, session_id FROM core.run WHERE run_id = $1", [runId]
    )).rows[0]!;
    expect(stored).toEqual({
      runId,
      releaseKey: TEST_RELEASE_KEY,
      registerVersion: 1,
      questionLine: question,
      askContract: { audience: "side-by-side-c10" },
      askerId: row.asker_id,
      sessionId: row.session_id,
      callerScope: "ASKER",
      asOf: new Date("2026-09-26T00:00:00.000Z"),
      askerRiskTier: "casual",
      tierSource: "ASKER",
      tierProvenanceRef: "side-by-side-c10:integration",
      compositionBudgetTier: "low",
      planTier: null,
      depthParams: { depth: 1 },
      argumentLanguageTag: "und",
      argumentLanguageName: "the same language as the question",
      contentEncrypted: false
    });
    expect(row.asker_id.startsWith("legacy-side-by-side-c10-")).toBe(true);
    expect(Object.isFrozen(stored)).toBe(true);
  });

  it("decrypts an encrypted server run: the plaintext question and contract, contentEncrypted true", async () => {
    const question = "Should an encrypted run be read back in plain words for its re-admission?";
    const runId = await fixture.createEncryptedRun(question, { releaseKey: TEST_RELEASE_KEY });
    const columns = (await fixture.database.pool.query<{ question_line: string }>(
      "SELECT question_line FROM core.run WHERE run_id = $1", [runId]
    )).rows[0]!;
    expect(columns.question_line).not.toBe(question);
    const stored = await new RunRepository(fixture.database.pool).readStoredAsk(runId);
    expect(stored).toMatchObject({
      runId, releaseKey: TEST_RELEASE_KEY, questionLine: question, askContract: { audience: "side-by-side-c10" },
      askerId: `owner:${fixture.ownerRef}`, contentEncrypted: true
    });
  });

  it("returns null for a run that does not exist", async () => {
    await expect(new RunRepository(fixture.database.pool).readStoredAsk(randomUUID())).resolves.toBeNull();
  });
});

describe("WaitingRun.releaseKey (side-by-side C10)", () => {
  it("a run read through wakeCandidates carries its own release key", async () => {
    const runId = await fixture.createLegacyRun("Which release admitted this waiting run?", { releaseKey: TEST_RELEASE_KEY });
    const legacy = await fixture.createLegacyRun("And this one, written before any stamp?");
    const waits = new RunWaitRepository(fixture.database.pool);
    const client = await fixture.database.pool.connect();
    try {
      await client.query("BEGIN");
      await waits.enterWait(client, runId, new Date("2026-10-22T08:00:00.000Z"));
      await waits.enterWait(client, legacy, new Date("2026-10-22T08:00:01.000Z"));
      await client.query("COMMIT");
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
    const line = await waits.wakeCandidates({ now: new Date("2026-10-22T09:00:00.000Z"), after: null, limit: 100, everyPerson: true });
    const keys = new Map(line.map((run) => [run.runId, run.releaseKey]));
    expect(keys.get(runId)).toBe(TEST_RELEASE_KEY);
    expect(keys.get(legacy)).toBe("legacy");
  });
});

/**
 * Side-by-side uploads spec 2026-10-21 §4, O3 (Q1 → a; plan C task C11) — RE-ADMISSION AT START. Two applications share
 * one database: "old" admits under r16 (register version 16) and "new" under r17 (17), and r17 is CURRENT. A debate the
 * old one placed in line is started by the new one's waker only as a NEW run under r17: the new run row, the supersession
 * edge, the hold on the new run and its first job, all in the START (the new row itself committed just before, as
 * `#submitWithRoom` commits its run). A closed room writes nothing and plans nothing; a choice the new version no longer
 * offers closes the old run with "please ask again"; a START that fails after the new row committed leaves that row
 * FAILED and the old run in line; and a new row whose START never committed at all (a crash) is closed FAILED by a later
 * tick under the owner's lease (C11 review), so the debate is re-admitted after all.
 */
// Built from pieces, so no line pairs a *_KEY name with a literal (gitleaks).
const OLD_RELEASE = ["r16", "0123456789ab"].join("-");
const NEW_RELEASE = ["r17", "0123456789ab"].join("-");
const PLANS = billingPlansFromValue(BILLING_PLANS_DEPLOYMENT_REGISTER_ROW.value, BILLING_PLANS_DEPLOYMENT_REGISTER_ROW.sourceRef);
const ESTIMATE = 1_000;
const FULL_DAY = 1_000;
const RAISED_DAY = 10_000_000;
let now = new Date("2034-05-01T10:00:00.000Z");

const freeAsk: AskRequest = {
  question_line: "Should a debate that waited through an upload start under the new release?",
  risk_tier: "casual",
  tier_source: "ASKER",
  tier_provenance_ref: "asker-declaration:side-by-side-c11",
  composition_budget_tier: "low",
  depth_params: { depth: 1 },
  decision_scope: "side-by-side C11 integration test",
  as_of: "2026-10-22T00:00:00.000Z",
  steering_presets: [],
  plan_tier: "free",
  steering_annotations: []
};

function roomOf(input: Readonly<{ releaseKey?: string; ceiling: number }> & Partial<AskRoomOptions>): AskRoom {
  const { releaseKey, ceiling, ...extra } = input;
  return new AskRoom({
    lockPool: fixture.database.pool,
    spend: new PostgresModelSpendStore(fixture.database.pool),
    line: new RunWaitRepository(fixture.database.pool),
    estimator: { estimateMicros: async () => ESTIMATE },
    personAllowance: { read: async () => [] },
    entitlements: null,
    dailyCeilingMicros: ceiling,
    closeBasisPoints: 9_500,
    waitingLinePerPerson: 1,
    clock: () => now,
    // The old release's room is built without a gate: it only places the question in line, as T-1 did.
    ...(releaseKey === undefined ? {} : { gate: new PostgresAskAdmissionGate({ releaseKey, hosted: false }) }),
    ...extra
  });
}

/** An application of one release: its key, the register version its number names, its room and its spies. */
function applicationOf(input: Readonly<{
  releaseKey: string; registerVersion: number; room: AskRoom; dispatched?: string[];
  probes?: { count: number }; extra?: Partial<RunCreationSettings>;
}>): PostgresAskApplication {
  const dispatcher: Dispatcher = { dispatch: async ({ runId }) => { input.dispatched?.push(runId); } };
  const settings: RunCreationSettings = {
    ...input.extra,
    strangerSampleRate: 0,
    registerVersion: input.registerVersion,
    releaseKey: input.releaseKey,
    batteryVersion: "side-by-side-c11",
    settlementWatchHandle: "side-by-side-c11",
    // The probe: discovery is what a re-admission plan pays for, so the tests count it.
    resolveDiscoveredPanel: async () => {
      if (input.probes !== undefined) input.probes.count += 1;
      return [...new Set([...PLAN_TIER_ROSTERS.free, ...PLAN_TIER_ROSTERS.premium])].map((modelId, index) => Object.freeze({
        provider_ref: `provider:c11:${String(index + 1)}`, maker: `maker:c11:${String(index + 1)}`, model_id: modelId,
        probe_evidence_ref: randomUUID(), probed_at: "2026-10-22T00:00:00.000Z"
      }));
    },
    resolveEnvelopeBasis: async ({ panelSize }) => fixtureStructuralCeiling(12, panelSize, 1),
    resolveRisk: (effectiveRiskTier, tierSource, tierProvenanceRef) => ({
      effectiveRiskTier, tierSource: tierSource as "ASKER" | "MACHINE_DEFAULT" | "DEPLOYMENT_POLICY", tierProvenanceRef
    }),
    room: input.room,
    waitingLine: input.room
  };
  return new PostgresAskApplication(
    fixture.database.pool, dispatcher, settings, undefined, fixture.database.pool,
    createTestAskAdmissionPoolFacades(fixture.database.pool)
  );
}

const oldApplication = (room: AskRoom) => applicationOf({ releaseKey: OLD_RELEASE, registerVersion: 16, room });
const newApplication = (room: AskRoom, spies: Readonly<{ dispatched?: string[]; probes?: { count: number }; extra?: Partial<RunCreationSettings> }> = {}) =>
  applicationOf({ releaseKey: NEW_RELEASE, registerVersion: 17, room, ...spies });

function legacySession(askerId: string): Session {
  return {
    asker_id: askerId, session_id: `session:c11:${randomUUID()}`, caller_scope: "ASKER",
    ownership_provenance: "user_dev_token", provisional_identity_model: true
  } as unknown as Session;
}

function submitAs(application: PostgresAskApplication, askerId: string) {
  return application.submit(freeAsk, legacySession(askerId), { kind: "legacy", legacyAskerId: askerId });
}

async function fillDay(day: string, micros: number): Promise<void> {
  await fixture.database.pool.query(
    `INSERT INTO ledger.model_spend
       (spend_id, spend_source, run_id, provider_ref, charged_on, charge_micros, input_tokens, output_tokens)
     VALUES ($1,'SUPPORT',NULL,'provider-1',$2::date,$3,1,1)`,
    [randomUUID(), day, micros]
  );
}

async function inTransaction<T>(use: (client: PoolClient) => Promise<T>): Promise<T> {
  const client = await fixture.database.pool.connect();
  try {
    await client.query("BEGIN");
    const result = await use(client);
    await client.query("COMMIT");
    return result;
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

/** A run the old release stored and placed in line (waiting for the site), written directly, as T-1 left it. */
async function storedWaiting(input: Partial<StartRunInput> & Pick<StartRunInput, "principal" | "sessionId">): Promise<string> {
  const runId = await new RunRepository(fixture.database.pool).startRun({
    questionLine: "Should a stored waiting debate be re-admitted by the new release?",
    callerScope: "ASKER", asOf: new Date("2026-10-22T00:00:00.000Z"),
    askerRiskTier: "casual", effectiveRiskTier: "casual", tierSource: "ASKER", tierProvenanceRef: "asker:side-by-side-c11",
    compositionBudgetTier: "low", planTier: "free", depthParams: { depth: 1 },
    discoveredPanel: fixtureDiscoveredPanel(2), strangerSampleRate: 0,
    envelopeBasis: fixtureStructuralCeiling(4), registerVersion: 16, releaseKey: OLD_RELEASE, batteryVersion: "side-by-side-c11",
    askContract: { decision_scope: "side-by-side C11 integration test", steering_presets: [], steering_annotations: [] },
    batteryRows: [],
    ...input
  });
  const line = new RunWaitRepository(fixture.database.pool);
  await inTransaction(async (client) => {
    await line.enterWait(client, runId, now);
    await line.recordReason(client, runId, { waitsFor: "SITE", personRecheckAt: null, at: now });
  });
  return runId;
}

/**
 * C11 review: a re-admission of `old` whose new row committed and whose START never did — the process died in between,
 * so neither the edge, the hold, the first job nor a FAILED record exists. Written as `#readmit` writes it, under r17.
 */
function crashedReadmission(old: string, principal: ReadmissionPrincipal, questionLine: string): Promise<string> {
  return new RunRepository(fixture.database.pool).startReadmittedRun({
    fromRunId: old, principal, questionLine,
    asOf: new Date("2026-10-22T00:00:00.000Z"),
    askerRiskTier: "casual", effectiveRiskTier: "casual", tierSource: "ASKER", tierProvenanceRef: "asker:side-by-side-c11",
    compositionBudgetTier: "low", planTier: "free", depthParams: { depth: 1 },
    discoveredPanel: fixtureDiscoveredPanel(2), strangerSampleRate: 0,
    envelopeBasis: fixtureStructuralCeiling(4), registerVersion: 17, releaseKey: NEW_RELEASE, batteryVersion: "side-by-side-c11",
    askContract: { decision_scope: "side-by-side C11 integration test", steering_presets: [], steering_annotations: [] },
    batteryRows: []
  });
}

/** The application's journal lines among console calls (the embedded database logs through console too). */
function journalLines(calls: ReadonlyArray<ReadonlyArray<unknown>>): Array<Record<string, unknown>> {
  return calls.map(([line]) => String(line)).filter((line) => line.startsWith("{"))
    .map((line) => JSON.parse(line) as Record<string, unknown>);
}

const count = async (sql: string, values: readonly unknown[] = []): Promise<number> =>
  (await fixture.database.pool.query<{ n: number }>(sql, [...values])).rows[0]!.n;
const runCount = () => count("SELECT count(*)::integer AS n FROM core.run");
const supersessionCount = () => count("SELECT count(*)::integer AS n FROM core.run_supersession");

async function supersessionOf(oldRunId: string) {
  return (await fixture.database.pool.query<{ old_run_id: string; new_run_id: string; reason: string }>(
    "SELECT old_run_id, new_run_id, reason FROM core.run_supersession WHERE old_run_id = $1", [oldRunId]
  )).rows;
}

async function waitingIds(): Promise<string[]> {
  return (await fixture.database.pool.query<{ run_id: string }>("SELECT run_id FROM core.run_waiting_v")).rows.map((row) => row.run_id);
}

async function jobsOf(runId: string) {
  return (await fixture.database.pool.query<{ command_key: string; state: string; terminal_reason: string | null }>(
    "SELECT command_key, state, terminal_reason FROM core.work_item WHERE run_id = $1 ORDER BY created_at_seq", [runId]
  )).rows;
}

async function holdOf(runId: string): Promise<number | null> {
  const row = (await fixture.database.pool.query<{ held_micros: string }>(
    "SELECT held_micros::text AS held_micros FROM ledger.model_spend_hold WHERE run_id = $1", [runId]
  )).rows[0];
  return row === undefined ? null : Number(row.held_micros);
}

async function stampOf(runId: string) {
  return (await fixture.database.pool.query<{ release_key: string; register_version: string }>(
    "SELECT release_key, register_version::text AS register_version FROM core.run WHERE run_id = $1", [runId]
  )).rows[0];
}

/**
 * Final fix wave P4: the person's library list as the route reads it (ServeRepository.readAnswerIndex), the runs it names
 * and its count. A large page, so `total` equals the runs named when nothing is left out of one but not the other.
 */
async function libraryOf(ownership: RunOwnershipAccess): Promise<Readonly<{ refs: readonly string[]; total: number }>> {
  const index = await new ServeRepository(fixture.database.pool).readAnswerIndex(ownership, 100, 0);
  return { refs: [...index.items.map((item) => item.run_ref), ...index.open_runs.map((run) => run.run_ref)], total: index.total };
}

/** The runs a person has besides `except`: a legacy re-admission keeps the old run's asker id. */
async function otherRunsOf(askerId: string, except: string): Promise<string[]> {
  return (await fixture.database.pool.query<{ run_id: string }>(
    "SELECT run_id FROM core.run WHERE asker_id = $1 AND run_id <> $2 ORDER BY created_at_seq", [askerId, except]
  )).rows.map((row) => row.run_id);
}

describe("side-by-side C11: a waiting debate is re-admitted under the current release when it starts", () => {
  beforeAll(async () => {
    await fixture.database.pool.query("SELECT core.record_release_event($1, 'STAGED', 'test', NULL)", [NEW_RELEASE]);
    await fixture.database.pool.query("SELECT core.record_release_switch($1, NULL, now(), 'test', NULL)", [NEW_RELEASE]);
  });

  // Each case starts with an empty line and no live job, so no other case's run is woken or counted.
  beforeEach(async () => {
    await fixture.database.pool.query(
      "UPDATE core.work_item SET state='DONE', claimed_by=NULL, claim_deadline=NULL WHERE state IN ('READY','CLAIMED')"
    );
    await fixture.database.pool.query(
      "INSERT INTO core.run_wait_start (run_id, started_at) SELECT run_id, clock_timestamp() FROM core.run_waiting_v"
    );
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("START re-admits: a new r17 run supersedes the old one, with its hold, its first job and its dispatch", async () => {
    now = new Date("2034-05-01T10:00:00.000Z");
    await fillDay("2034-05-01", FULL_DAY);
    const askerId = `c11:start:${randomUUID()}`;
    const waiting = await submitAs(oldApplication(roomOf({ ceiling: FULL_DAY })), askerId);
    expect(waiting.status).toBe("WAITING");
    const old = waiting.run_ref;
    expect(await stampOf(old)).toEqual({ release_key: OLD_RELEASE, register_version: "16" });

    now = new Date("2034-05-01T10:01:00.000Z");
    const dispatched: string[] = [];
    const tick = await newApplication(roomOf({ releaseKey: NEW_RELEASE, ceiling: RAISED_DAY }), { dispatched }).wakeWaitingRuns();
    expect(tick).toMatchObject({ started: 1, failed: 0 });

    const edges = await supersessionOf(old);
    expect(edges).toHaveLength(1);
    const created = edges[0]!.new_run_id;
    expect(edges).toEqual([{ old_run_id: old, new_run_id: created, reason: "READMITTED" }]);
    expect(await stampOf(created)).toEqual({ release_key: NEW_RELEASE, register_version: "17" });
    const runs = new RunRepository(fixture.database.pool);
    expect((await runs.readFrozenHead(created)).questionLine).toBe((await runs.readFrozenHead(old)).questionLine);
    expect(await holdOf(created)).toBe(ESTIMATE);
    expect(await holdOf(old)).toBeNull();
    expect(await jobsOf(created)).toEqual([{ command_key: `S00:${created}:Q1`, state: "READY", terminal_reason: null }]);
    expect(await jobsOf(old)).toEqual([]);
    expect(dispatched).toEqual([created]);
    expect(await waitingIds()).not.toContain(old);
    expect((await fixture.database.pool.query<{ run_id: string }>(
      "SELECT core.resolve_run_ref($1::uuid)::text AS run_id", [old]
    )).rows[0]!.run_id).toBe(created);
    // A legacy re-admission keeps the old run's asker id, session and caller scope.
    const identity = (await fixture.database.pool.query<{ asker_id: string; session_id: string; caller_scope: string }>(
      "SELECT asker_id, session_id, caller_scope FROM core.run WHERE run_id = ANY($1::uuid[]) ORDER BY created_at_seq", [[old, created]]
    )).rows;
    expect(identity[1]).toEqual(identity[0]);
    expect(identity[0]!.asker_id).toBe(askerId);
  });

  it("START re-admits an encrypted owner's run with billing on: the new run is pinned to the old run's funding", async () => {
    now = new Date("2034-05-02T10:00:00.000Z");
    await fillDay("2034-05-02", FULL_DAY);
    const entitlements = new EntitlementRepository(fixture.database.pool);
    const oldRoom = roomOf({ ceiling: FULL_DAY, entitlements, billingPlans: PLANS });
    const ownerRef = fixture.ownerRef;
    // Placed in line by the old room's own decision, so its funding is pinned as B6b pins a waiting run.
    const old = await oldRoom.decide({
      access: { ownerRef, legacyAskerId: null },
      settingsClass: { planTier: "free", compositionBudgetTier: "low", makerCount: 2, depth: 1 }
    }, async ({ admission, now: at, tx }) => {
      if (admission.kind !== "WAIT") throw new Error("test: this question must wait");
      const runId = await new RunRepository(fixture.database.pool).startRun({
        questionLine: "Should an encrypted waiting debate keep its funding when it is re-admitted?",
        principal: { kind: "server", userId: fixture.userId, ownerRef }, sessionId: fixture.authSessionId,
        callerScope: "ASKER", asOf: new Date("2026-10-22T00:00:00.000Z"),
        askerRiskTier: "casual", effectiveRiskTier: "casual", tierSource: "ASKER", tierProvenanceRef: "asker:side-by-side-c11",
        compositionBudgetTier: "low", planTier: "free", depthParams: { depth: 1 },
        discoveredPanel: fixtureDiscoveredPanel(2), strangerSampleRate: 0, envelopeBasis: fixtureStructuralCeiling(4),
        registerVersion: 16, releaseKey: OLD_RELEASE, batteryVersion: "side-by-side-c11",
        askContract: { decision_scope: "side-by-side C11 integration test", steering_presets: [], steering_annotations: [] },
        batteryRows: []
      });
      await oldRoom.enterWait(tx, runId, at);
      return runId;
    });
    const pinned = (await fixture.database.pool.query<{ plan_id: string }>(
      "SELECT plan_id FROM billing.run_charge_scope WHERE run_id = $1", [old]
    )).rows[0]?.plan_id;
    expect(pinned).toBe("FREE");

    now = new Date("2034-05-02T10:01:00.000Z");
    const dispatched: string[] = [];
    const newRoom = roomOf({ releaseKey: NEW_RELEASE, ceiling: RAISED_DAY, entitlements, billingPlans: PLANS });
    await expect(newApplication(newRoom, { dispatched }).wakeWaitingRuns()).resolves.toMatchObject({ started: 1, failed: 0 });
    const created = (await supersessionOf(old))[0]!.new_run_id;
    expect((await fixture.database.pool.query<{ plan_id: string }>(
      "SELECT plan_id FROM billing.run_charge_scope WHERE run_id = $1", [created]
    )).rows[0]?.plan_id).toBe("FREE");
    expect(await holdOf(created)).toBe(ESTIMATE);
    expect(await holdOf(old)).toBeNull();
    expect(dispatched).toEqual([created]);
    expect(await stampOf(created)).toEqual({ release_key: NEW_RELEASE, register_version: "17" });
  });

  it("a closed room writes nothing and plans nothing, tick after tick", async () => {
    now = new Date("2034-05-03T10:00:00.000Z");
    await fillDay("2034-05-03", FULL_DAY);
    const askerId = `c11:closed:${randomUUID()}`;
    const old = (await submitAs(oldApplication(roomOf({ ceiling: FULL_DAY })), askerId)).run_ref;
    const probes = { count: 0 };
    const readStoredAsk = vi.spyOn(RunRepository.prototype, "readStoredAsk");
    const application = newApplication(roomOf({ releaseKey: NEW_RELEASE, ceiling: FULL_DAY }), { probes });
    const runs = await runCount();
    const edges = await supersessionCount();
    const reasons = await count("SELECT count(*)::integer AS n FROM core.run_wait_reason WHERE run_id = $1", [old]);
    for (const minute of ["01", "02", "03"]) {
      now = new Date(`2034-05-03T10:${minute}:00.000Z`);
      await expect(application.wakeWaitingRuns()).resolves.toMatchObject({ started: 0, stopped: true });
      expect(await runCount()).toBe(runs);
      expect(await supersessionCount()).toBe(edges);
      expect(await count("SELECT count(*)::integer AS n FROM core.run_waiting_v WHERE legacy_asker_id = $1", [askerId])).toBe(1);
      expect(await count("SELECT count(*)::integer AS n FROM core.run_wait_reason WHERE run_id = $1", [old])).toBe(reasons);
    }
    expect(readStoredAsk).not.toHaveBeenCalled();
    expect(probes.count).toBe(0);
  });

  it("a choice the new version no longer offers: the old run closes CHOICE_UNAVAILABLE, with no new run, hold or waiver", async () => {
    now = new Date("2034-05-04T10:00:00.000Z");
    const askerId = `c11:choice:${randomUUID()}`;
    const old = await storedWaiting({
      principal: { kind: "legacy", legacyAskerId: askerId }, sessionId: randomUUID(), planTier: "premium",
      depthParams: { depth: 2, depthMode: "fixed", scrutiny: "standard", answerLength: "standard" }
    });
    const start = debateShapePolicyStartValues();
    // The new release's shape row no longer offers a fixed depth on premium: the stored "fixed" would become "adaptive".
    const debateShapePolicy = parseDebateShapePolicy({
      ...start, plans: { ...start.plans, premium: { ...start.plans.premium, fixedDepthAllowed: false } }
    });
    const runs = await runCount();
    now = new Date("2034-05-04T10:01:00.000Z");
    const dispatched: string[] = [];
    const tick = await newApplication(roomOf({ releaseKey: NEW_RELEASE, ceiling: RAISED_DAY }), {
      dispatched, extra: { debateShapePolicy }
    }).wakeWaitingRuns();
    expect(tick).toMatchObject({ started: 0, failed: 1 });
    expect(await jobsOf(old)).toEqual([{ command_key: `S00:${old}:Q1`, state: "FAILED", terminal_reason: "RUN_SETUP_FAILED:CHOICE_UNAVAILABLE" }]);
    expect(await runCount()).toBe(runs);
    expect(await supersessionOf(old)).toEqual([]);
    expect(await holdOf(old)).toBeNull();
    expect(await count("SELECT count(*)::integer AS n FROM ledger.model_spend_waiver WHERE run_id = $1", [old])).toBe(0);
    expect(await count("SELECT count(*)::integer AS n FROM ledger.model_spend WHERE run_id = $1", [old])).toBe(0);
    expect(await waitingIds()).not.toContain(old);
    expect(dispatched).toEqual([]);
  });

  it("an encrypted owner's run with no live session: the new run decrypts to the same question, bound to the old run's user", async () => {
    now = new Date("2034-05-05T10:00:00.000Z");
    // A session of its own, ended before the wake: the re-admission must not need it.
    const sessionId = randomUUID();
    await fixture.database.pool.query(
      `INSERT INTO identity.session(
         session_id,user_id,token_hash,csrf_token_hash,binding_context,
         created_at,last_seen_at,idle_expires_at,absolute_expires_at,last_mfa_at
       ) VALUES ($1,$2,$3,$4,'{}'::jsonb,now(),now(),now()+interval '1 hour',now()+interval '2 hours',now())`,
      [sessionId, fixture.userId, `sha256:${randomBytes(32).toString("hex")}`, `sha256:${randomBytes(32).toString("hex")}`]
    );
    const question = "Should an encrypted debate be re-admitted after its session has ended?";
    const old = await storedWaiting({
      questionLine: question, principal: { kind: "server", userId: fixture.userId, ownerRef: fixture.ownerRef }, sessionId
    });
    await fixture.database.pool.query("UPDATE identity.session SET revoked_at = now() WHERE session_id = $1", [sessionId]);

    now = new Date("2034-05-05T10:01:00.000Z");
    const dispatched: string[] = [];
    await expect(newApplication(roomOf({ releaseKey: NEW_RELEASE, ceiling: RAISED_DAY }), { dispatched }).wakeWaitingRuns())
      .resolves.toMatchObject({ started: 1, failed: 0 });
    const created = (await supersessionOf(old))[0]!.new_run_id;
    const stored = await new RunRepository(fixture.database.pool).readStoredAsk(created);
    expect(stored).toMatchObject({ questionLine: question, contentEncrypted: true, askerId: `owner:${fixture.ownerRef}`, releaseKey: NEW_RELEASE });
    expect((await fixture.database.pool.query<{ question_line: string }>(
      "SELECT question_line FROM core.run WHERE run_id = $1", [created]
    )).rows[0]!.question_line).not.toBe(question);
    expect((await fixture.database.pool.query<{ user_id: string; readmitted_from_run_id: string }>(
      "SELECT user_id::text AS user_id, readmitted_from_run_id::text AS readmitted_from_run_id FROM identity.run_execution_binding WHERE run_id = $1",
      [created]
    )).rows).toEqual([{ user_id: fixture.userId, readmitted_from_run_id: old }]);
    expect(await count(
      "SELECT count(*)::integer AS n FROM identity.session WHERE session_id = $1 AND revoked_at IS NULL", [sessionId]
    )).toBe(0);
    expect(dispatched).toEqual([created]);
  });

  it("the orphan path: a START that fails after the new row committed leaves it FAILED and the old run in line; the next tick re-admits", async () => {
    now = new Date("2034-05-06T10:00:00.000Z");
    const askerId = `c11:orphan:${randomUUID()}`;
    const old = await storedWaiting({ principal: { kind: "legacy", legacyAskerId: askerId }, sessionId: randomUUID() });
    const enqueueOn = WorkItemRepository.prototype.enqueueOn;
    vi.spyOn(WorkItemRepository.prototype, "enqueueOn")
      .mockRejectedValueOnce(new Error("test: the first job could not be queued"))
      .mockImplementation(function (this: WorkItemRepository, ...args: Parameters<WorkItemRepository["enqueueOn"]>) {
        return enqueueOn.apply(this, args);
      });
    const failures = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const dispatched: string[] = [];
    const application = newApplication(roomOf({ releaseKey: NEW_RELEASE, ceiling: RAISED_DAY }), { dispatched });

    now = new Date("2034-05-06T10:01:00.000Z");
    await expect(application.wakeWaitingRuns()).resolves.toMatchObject({ started: 0, failed: 1 });
    const [orphan] = await otherRunsOf(askerId, old);
    expect(orphan).toBeDefined();
    expect(await jobsOf(orphan!)).toEqual([{ command_key: `S00:${orphan!}:Q1`, state: "FAILED", terminal_reason: "RUN_SETUP_FAILED:READMISSION" }]);
    expect(await holdOf(orphan!)).toBeNull();
    expect(await waitingIds()).toContain(old);
    expect(await supersessionOf(old)).toEqual([]);
    expect(dispatched).toEqual([]);
    const lines = failures.mock.calls.map(([line]) => JSON.parse(String(line)) as Record<string, unknown>);
    expect(lines).toContainEqual({ event: "api.wait.readmission_failed", runId: old, newRunId: orphan, diagnostic: expect.any(String) });
    // Final fix wave P4: the person's list shows the waiting question once, never the FAILED copy beside it.
    expect(await libraryOf({ ownerRef: null, legacyAskerId: askerId })).toEqual({ refs: [old], total: 1 });

    now = new Date("2034-05-06T10:02:00.000Z");
    await expect(application.wakeWaitingRuns()).resolves.toMatchObject({ started: 1, failed: 0 });
    const edges = await supersessionOf(old);
    expect(edges).toHaveLength(1);
    expect(edges[0]!.new_run_id).not.toBe(orphan);
    expect(dispatched).toEqual([edges[0]!.new_run_id]);
    expect(await libraryOf({ ownerRef: null, legacyAskerId: askerId })).toEqual({ refs: [edges[0]!.new_run_id], total: 1 });
  });

  // C11 review, Important (controller ruling 2026-10-22): a re-admission whose START never committed (the process died
  // between the new row and the START, or its FAILED record never landed) never strands the debate. Under the old run's
  // owner lease, 0123's core.list_unstarted_readmissions names it, and the waker records it FAILED.
  it("a legacy re-admission whose START never committed (a crash) is closed FAILED by the next tick, which re-admits the run", async () => {
    now = new Date("2034-05-08T10:00:00.000Z");
    const askerId = `c11:crash:${randomUUID()}`;
    const question = "Should a crashed re-admission strand a legacy asker's waiting debate?";
    const old = await storedWaiting({ questionLine: question, principal: { kind: "legacy", legacyAskerId: askerId }, sessionId: randomUUID() });
    const orphan = await crashedReadmission(old, { kind: "legacy", legacyAskerId: askerId }, question);
    expect(await jobsOf(orphan)).toEqual([]);
    // Final fix wave P4: the copy that never started is no second debate in the person's list.
    expect(await libraryOf({ ownerRef: null, legacyAskerId: askerId })).toEqual({ refs: [old], total: 1 });
    const info = vi.spyOn(console, "info").mockImplementation(() => undefined);
    const dispatched: string[] = [];

    now = new Date("2034-05-08T10:01:00.000Z");
    await expect(newApplication(roomOf({ releaseKey: NEW_RELEASE, ceiling: RAISED_DAY }), { dispatched }).wakeWaitingRuns())
      .resolves.toMatchObject({ started: 1, failed: 0 });
    expect(await jobsOf(orphan)).toEqual([{ command_key: `S00:${orphan}:Q1`, state: "FAILED", terminal_reason: "RUN_SETUP_FAILED:READMISSION" }]);
    expect(await holdOf(orphan)).toBeNull();
    const edges = await supersessionOf(old);
    expect(edges).toHaveLength(1);
    expect(edges[0]!.new_run_id).not.toBe(orphan);
    expect(dispatched).toEqual([edges[0]!.new_run_id]);
    const lines = journalLines(info.mock.calls);
    expect(lines).toContainEqual({ event: "api.wait.readmission_orphan", runId: old, newRunId: orphan });
    // The re-admitted debate shows once, as its new run: not the superseded old one, not the FAILED copy.
    expect(await libraryOf({ ownerRef: null, legacyAskerId: askerId })).toEqual({ refs: [edges[0]!.new_run_id], total: 1 });
  });

  it("an owner's re-admission whose START never committed is closed FAILED when the next tick meets TAKEN; the tick after re-admits", async () => {
    now = new Date("2034-05-09T10:00:00.000Z");
    const question = "Should a crashed re-admission strand an encrypted waiting debate?";
    const old = await storedWaiting({
      questionLine: question, principal: { kind: "server", userId: fixture.userId, ownerRef: fixture.ownerRef },
      sessionId: fixture.authSessionId
    });
    const orphan = await crashedReadmission(old, { kind: "readmitted-owner", ownerRef: fixture.ownerRef }, question);
    expect((await fixture.database.pool.query<{ readmitted_from_run_id: string }>(
      "SELECT readmitted_from_run_id::text AS readmitted_from_run_id FROM identity.run_execution_binding WHERE run_id = $1", [orphan]
    )).rows).toEqual([{ readmitted_from_run_id: old }]);
    expect(await jobsOf(orphan)).toEqual([]);
    // Final fix wave P4: the owner's list names the waiting run and never the copy that did not start (the owner has
    // other runs from earlier cases, so the count is checked against the runs the list names).
    const owner: RunOwnershipAccess = { ownerRef: fixture.ownerRef, legacyAskerId: null };
    const before = await libraryOf(owner);
    expect(before.refs).toContain(old);
    expect(before.refs).not.toContain(orphan);
    expect(before.total).toBe(before.refs.length);
    const info = vi.spyOn(console, "info").mockImplementation(() => undefined);
    const dispatched: string[] = [];
    const application = newApplication(roomOf({ releaseKey: NEW_RELEASE, ceiling: RAISED_DAY }), { dispatched });

    // The first tick: the key provision refuses TAKEN (the orphan is alive: no FAILED job); under the lease the waker
    // records it FAILED, which frees the old run, and skips: nothing else written, the old run still in line.
    now = new Date("2034-05-09T10:01:00.000Z");
    await expect(application.wakeWaitingRuns()).resolves.toMatchObject({ started: 0, skipped: 1, failed: 0 });
    expect(await jobsOf(orphan)).toEqual([{ command_key: `S00:${orphan}:Q1`, state: "FAILED", terminal_reason: "RUN_SETUP_FAILED:READMISSION" }]);
    expect(await waitingIds()).toContain(old);
    expect(await supersessionOf(old)).toEqual([]);
    expect(dispatched).toEqual([]);
    const lines = journalLines(info.mock.calls);
    expect(lines).toContainEqual({ event: "api.wait.readmission_orphan", runId: old, newRunId: orphan });
    expect(lines).toContainEqual({ event: "api.wait.readmission_skipped", runId: old, code: "RUN_READMISSION_TAKEN" });
    // Recorded FAILED (RUN_SETUP_FAILED:READMISSION), the copy still stays out of the list; the old run is there once.
    const closed = await libraryOf(owner);
    expect(closed.refs.filter((ref) => ref === old)).toHaveLength(1);
    expect(closed.refs).not.toContain(orphan);
    expect(closed.total).toBe(closed.refs.length);

    // The next tick re-admits it.
    now = new Date("2034-05-09T10:02:00.000Z");
    await expect(application.wakeWaitingRuns()).resolves.toMatchObject({ started: 1, failed: 0 });
    const edges = await supersessionOf(old);
    expect(edges).toHaveLength(1);
    const created = edges[0]!.new_run_id;
    expect(created).not.toBe(orphan);
    expect(dispatched).toEqual([created]);
    expect((await new RunRepository(fixture.database.pool).readStoredAsk(created))?.questionLine).toBe(question);
  });

  it("the list's re-admission filter reads only what the API's runtime login may, with no migration (final fix wave P4)", async () => {
    // packages/serve readAnswerIndex runs on the API's runtime pool, whose login holds debateai_billing_runtime (a
    // member of debateai_runtime, 0093): each object its P4 clauses read, read as that role.
    const client = await fixture.database.pool.connect();
    try {
      await client.query("SET ROLE debateai_billing_runtime");
      await client.query(
        `SELECT listed.run_id FROM core.run_wait AS wait
         CROSS JOIN LATERAL core.list_unstarted_readmissions(wait.run_id) AS listed(run_id)
         WHERE NOT EXISTS (SELECT 1 FROM core.run_wait_start AS started WHERE started.run_id = wait.run_id)
           AND NOT EXISTS (SELECT 1 FROM core.run_supersession AS s WHERE s.old_run_id = wait.run_id)`
      );
      await client.query(
        "SELECT count(*) FROM core.work_item WHERE state = 'FAILED' AND terminal_reason = 'RUN_SETUP_FAILED:READMISSION'"
      );
    } finally {
      await client.query("RESET ROLE").catch(() => undefined);
      client.release();
    }
  });

  it("the same release: a waiting run stamped r17 starts on its own row, with no supersession and no new run", async () => {
    now = new Date("2034-05-07T10:00:00.000Z");
    await fillDay("2034-05-07", FULL_DAY);
    const askerId = `c11:same:${randomUUID()}`;
    const waiting = await submitAs(newApplication(roomOf({ releaseKey: NEW_RELEASE, ceiling: FULL_DAY })), askerId);
    expect(waiting.status).toBe("WAITING");
    expect((await stampOf(waiting.run_ref))?.release_key).toBe(NEW_RELEASE);
    const runs = await runCount();
    const edges = await supersessionCount();
    const probes = { count: 0 };
    now = new Date("2034-05-07T10:01:00.000Z");
    const dispatched: string[] = [];
    await expect(newApplication(roomOf({ releaseKey: NEW_RELEASE, ceiling: RAISED_DAY }), { dispatched, probes }).wakeWaitingRuns())
      .resolves.toMatchObject({ started: 1 });
    expect(dispatched).toEqual([waiting.run_ref]);
    expect(await runCount()).toBe(runs);
    expect(await supersessionCount()).toBe(edges);
    expect(await jobsOf(waiting.run_ref)).toEqual([{ command_key: `S00:${waiting.run_ref}:Q1`, state: "READY", terminal_reason: null }]);
    expect(probes.count).toBe(0);
  });
});

/**
 * Side-by-side spec §13 (C14, Task S13) — A WAITING DEBATE STARTED AFTER AN ACTIVATION IS RE-ADMITTED ON THE ACTIVE
 * VERSION, on migration 0124's real pointer. r17 stays current (above). A debate r17 placed in line on its own site
 * version (17) waits while the owners activate a sealed GENERAL version r17 has passed (a PASS verdict); the next tick
 * of r17's waker, built as main.ts builds it (the gate reads the pointer on the START transaction, the cached reader
 * plans the new run), starts it as a NEW run stamped with the active version: the edge, the hold at that version's
 * estimate, its first job, and the person still has exactly one place in line (none, once it started).
 */
describe("side-by-side S13: a debate waiting across an activation starts on the active version", () => {
  const SITE = 17;
  const DIGEST = "d".repeat(64);
  const ACTIVE_ESTIMATE = 2_345;

  beforeEach(async () => {
    await fixture.database.pool.query(
      "UPDATE core.work_item SET state='DONE', claimed_by=NULL, claim_deadline=NULL WHERE state IN ('READY','CLAIMED')"
    );
    await fixture.database.pool.query(
      "INSERT INTO core.run_wait_start (run_id, started_at) SELECT run_id, clock_timestamp() FROM core.run_waiting_v"
    );
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  /** A sealed GENERAL version (published over a historical v4), passed by r17 and activated: the pointer's new version. */
  async function activateGeneralVersion(): Promise<number> {
    const pool = fixture.database.pool;
    const sourceRef = "fixture:side-by-side-s13";
    await importHistoricalRegisterFixture(pool, 4, [registerFixtureRow("sideBySideS13Probe", "v4", sourceRef)]);
    const general = registerVersionToSafeLegacyNumber((await publishReplacementRegisterFixture(pool, parseRegisterVersionText("4"),
      [registerFixtureRow("sideBySideS13Probe", "general", sourceRef)], `${sourceRef}:general`)).registerVersion);
    await pool.query("SELECT register.record_settings_verdict($1::text, $2::bigint, 'PASS', $3::text)", [NEW_RELEASE, general, DIGEST]);
    await pool.query("SELECT register.activate_settings_version($1::bigint, NULL, $2::text, 'owner', 'side-by-side S13')",
      [general, NEW_RELEASE]);
    return general;
  }

  it("activated while it waits: the next START re-admits it as a new r17 run stamped with the active version, its hold at that version's estimate", async () => {
    now = new Date("2034-05-08T10:00:00.000Z");
    await fillDay("2034-05-08", FULL_DAY);
    const askerId = `s13:activation:${randomUUID()}`;
    const waiting = await submitAs(newApplication(roomOf({ releaseKey: NEW_RELEASE, ceiling: FULL_DAY })), askerId);
    expect(waiting.status).toBe("WAITING");
    const old = waiting.run_ref;
    expect(await stampOf(old)).toEqual({ release_key: NEW_RELEASE, register_version: String(SITE) });

    const active = await activateGeneralVersion();
    expect(active).not.toBe(SITE);
    // The API's runtime login (debateai_billing_runtime) reads the pointer on a transaction's own client, as the START does.
    const client = await fixture.database.pool.connect();
    try {
      await client.query("BEGIN");
      await client.query("SET LOCAL ROLE debateai_billing_runtime");
      expect(await readActiveSettingsVersionOn(client, SITE)).toBe(active);
      await client.query("COMMIT");
    } finally {
      client.release();
    }

    // r17's waker as main.ts composes it: the gate with the site version, the cached reader, each version's members.
    now = new Date("2034-05-08T10:01:00.000Z");
    const reader = createActiveSettingsVersionReader({ pool: fixture.database.pool, siteVersion: SITE });
    const members = (version: number): AdmissionRunMembers => Object.freeze({
      registerVersion: version,
      resolveEnvelopeBasis: async ({ panelSize }) => fixtureStructuralCeiling(12, panelSize, 1),
      resolveRisk: (effectiveRiskTier, tierSource, tierProvenanceRef) => ({
        effectiveRiskTier, tierSource: tierSource as "ASKER" | "MACHINE_DEFAULT" | "DEPLOYMENT_POLICY", tierProvenanceRef
      })
    });
    const room = roomOf({
      ceiling: RAISED_DAY,
      gate: new PostgresAskAdmissionGate({ releaseKey: NEW_RELEASE, hosted: false, siteVersion: SITE }),
      estimatorFor: async (version) => ({ estimateMicros: async () => version === active ? ACTIVE_ESTIMATE : ESTIMATE })
    });
    const dispatched: string[] = [];
    const tick = await newApplication(room, {
      dispatched,
      extra: { admissionSettings: { activeSettingsVersion: () => reader.current(), admissionSettingsFor: async (version) => members(version) } }
    }).wakeWaitingRuns();
    expect(tick).toMatchObject({ started: 1, failed: 0 });

    const edges = await supersessionOf(old);
    expect(edges).toHaveLength(1);
    const created = edges[0]!.new_run_id;
    expect(edges).toEqual([{ old_run_id: old, new_run_id: created, reason: "READMITTED" }]);
    expect(await stampOf(created)).toEqual({ release_key: NEW_RELEASE, register_version: String(active) });
    expect(await holdOf(created)).toBe(ACTIVE_ESTIMATE);
    expect(await holdOf(old)).toBeNull();
    expect(await jobsOf(created)).toEqual([{ command_key: `S00:${created}:Q1`, state: "READY", terminal_reason: null }]);
    expect(await jobsOf(old)).toEqual([]);
    expect(dispatched).toEqual([created]);
    // One place in line per person: the old run's row only (now out of the line, by its edge); the new run never had one.
    expect(await count(
      "SELECT count(*)::integer AS n FROM core.run_wait AS wait JOIN core.run AS run USING (run_id) WHERE run.asker_id = $1", [askerId]
    )).toBe(1);
    expect(await waitingIds()).not.toContain(old);
    expect(await waitingIds()).not.toContain(created);
  });
});
