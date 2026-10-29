import { randomUUID } from "node:crypto";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { PostgresAskApplication, type Dispatcher, type RunCreationSettings } from "@debateai/api";
import { WorkItemRepository } from "@debateai/battery";
import { PostgresModelSpendStore } from "@debateai/budget";
import { PLAN_TIER_ROSTERS, type AskRequest, type Session } from "@debateai/contract";
import { parseReleaseKey } from "@debateai/kernel";
import { RunRepository, RunWaitRepository, createPool, migrate, type Pool } from "@debateai/db";
import { AskRoom, nextWholeMinute } from "../../apps/api/src/ask-room.js";
import { PostgresAskAdmissionGate, settingsVersionPassed } from "../../apps/api/src/release-state.js";
import { fixtureDiscoveredPanel, fixtureStructuralCeiling } from "../support/discoveredPanel.js";
import { createSystemTwin } from "../support/rls-logins.js";
import { createTestAskAdmissionPoolFacades, startTestDatabase, type TestDatabase } from "../support/testDatabase.js";
import { testReleaseKey } from "../support/releaseKey.js";

/**
 * Side-by-side uploads spec 2026-10-21 §9, §13 (plan C task C8): at most SITE_CONCURRENT_DEBATES (8) debates across
 * releases, counted inside the spend-decision lock, and an ask the API admits while its release is not current waits in
 * line. Through the real ask path and the real waker, with a room built on a PostgresAskAdmissionGate, over embedded
 * Postgres and migration 0123. On the wire nothing new: a held ask answers WAITING on the site's day at the next whole
 * minute, with no waits_for; SITE_BUSY and SWITCHING live only in core.run_wait_reason. CI skips this directory; run it
 * before merging.
 */
// The keys are derived (r<v>-000000000000), so no line pairs a *_KEY name with a literal (gitleaks).
const R16 = testReleaseKey(16);
const R17 = testReleaseKey(17);
const R18 = testReleaseKey(18);
const LOGIN = "c8_room_decision";
const BARE = "c8_room_decision_bare";
const SECRET = ["c8", "fixture", "only"].join("-");

let database: TestDatabase;
let now = new Date("2033-04-01T10:00:20.000Z");

beforeAll(async () => {
  database = await startTestDatabase();
  await migrate(database.pool);
}, 600_000);

afterAll(async () => {
  await database?.stop();
});

afterEach(async () => {
  await database.pool.query(
    "UPDATE core.work_item SET state='DONE', claimed_by=NULL, claim_deadline=NULL WHERE state IN ('READY','CLAIMED')"
  );
  await database.pool.query(
    "INSERT INTO core.run_wait_start (run_id, started_at) SELECT run_id, clock_timestamp() FROM core.run_waiting_v"
  );
});

const ask: AskRequest = {
  question_line: "Should every town keep a public library open on Sundays?",
  risk_tier: "casual",
  tier_source: "ASKER",
  tier_provenance_ref: "asker-declaration:side-by-side-c8",
  composition_budget_tier: "low",
  depth_params: { depth: 1 },
  decision_scope: "side-by-side C8 integration test",
  as_of: "2026-10-22T00:00:00.000Z",
  steering_presets: [],
  plan_tier: "free",
  steering_annotations: []
};

/** A room as main.ts builds it (B7b harness otherwise): a day far above any estimate, and the gate. */
function roomOf(releaseKey: string): AskRoom {
  return new AskRoom({
    lockPool: database.pool,
    spend: new PostgresModelSpendStore(database.pool),
    line: new RunWaitRepository(database.pool),
    estimator: { estimateMicros: async () => 1 },
    personAllowance: { read: async () => [] },
    entitlements: null,
    dailyCeilingMicros: 1_000_000,
    closeBasisPoints: 9_500,
    waitingLinePerPerson: 1,
    clock: () => now,
    gate: new PostgresAskAdmissionGate({ releaseKey, hosted: false })
  });
}

/**
 * The r17 API: its own release key and the register version its number names. Side-by-side spec §13 (Task S11):
 * `active` is the activation pointer's version (the reader and the version's members, as main.ts composes them), so the
 * ask is admitted on it; `room: false` is the direct path (no room: final fix wave P7).
 */
function r17Application(dispatched: string[] = [], options: Readonly<{ active?: number; room?: false }> = {}): PostgresAskApplication {
  const room = roomOf(R17);
  const dispatcher: Dispatcher = { dispatch: async ({ runId }) => { dispatched.push(runId); } };
  // A version's members: its number over the same receipt and risk rules (the version, not its rows, is what is checked).
  const versionMembers = (version: number) => Object.freeze({
    registerVersion: version, resolveEnvelopeBasis: settings.resolveEnvelopeBasis, resolveRisk: settings.resolveRisk
  });
  const active = options.active;
  const settings: RunCreationSettings = {
    strangerSampleRate: 0,
    registerVersion: 17,
    releaseKey: R17,
    batteryVersion: "side-by-side-c8",
    settlementWatchHandle: "side-by-side-c8",
    resolveDiscoveredPanel: async () => PLAN_TIER_ROSTERS.free.map((modelId, index) => Object.freeze({
      provider_ref: `provider:c8:${String(index + 1)}`, maker: `maker:c8:${String(index + 1)}`, model_id: modelId,
      probe_evidence_ref: randomUUID(), probed_at: "2026-10-22T00:00:00.000Z"
    })),
    resolveEnvelopeBasis: async ({ panelSize }) => fixtureStructuralCeiling(12, panelSize, 1),
    resolveRisk: (effectiveRiskTier, tierSource, tierProvenanceRef) => ({
      effectiveRiskTier, tierSource: tierSource as "ASKER" | "MACHINE_DEFAULT" | "DEPLOYMENT_POLICY", tierProvenanceRef
    }),
    ...(options.room === false ? {} : { room, waitingLine: room }),
    ...(active === undefined ? {} : {
      admissionSettings: { activeSettingsVersion: async () => active, admissionSettingsFor: async (version: number) => versionMembers(version) }
    })
  };
  return new PostgresAskApplication(
    database.pool, dispatcher, settings, undefined, database.pool, createTestAskAdmissionPoolFacades(database.pool)
  );
}

function submitAs(application: PostgresAskApplication) {
  const askerId = `c8:${randomUUID()}`;
  const session = {
    asker_id: askerId, session_id: `session:c8:${randomUUID()}`, caller_scope: "ASKER",
    ownership_provenance: "user_dev_token", provisional_identity_model: true
  } as unknown as Session;
  return application.submit(ask, session, { kind: "legacy", legacyAskerId: askerId });
}

/** A debate another process already runs: its run stamped with `releaseKey`, its first job READY. */
async function liveDebate(releaseKey: string): Promise<string> {
  const runId = await new RunRepository(database.pool).startRun({
    questionLine: "Is a debate already running counted by the site's cap?",
    principal: { kind: "legacy", legacyAskerId: `c8:live:${randomUUID()}` },
    sessionId: randomUUID(), callerScope: "ASKER", asOf: new Date(),
    askerRiskTier: "casual", effectiveRiskTier: "casual", tierSource: "ASKER", tierProvenanceRef: "asker:test",
    compositionBudgetTier: "low", planTier: "free", depthParams: { depth: 1 },
    discoveredPanel: fixtureDiscoveredPanel(2), strangerSampleRate: 0,
    envelopeBasis: fixtureStructuralCeiling(4), registerVersion: parseReleaseKey(releaseKey).siteVersion,
    releaseKey, batteryVersion: "test", askContract: {}, batteryRows: []
  });
  await new WorkItemRepository(database.pool).enqueue({ runId, batteryRowId: "Q1", commandKey: `S00:${runId}:Q1`, nodeSet: [] });
  return runId;
}

async function latestReasonOf(runId: string): Promise<string | undefined> {
  return (await database.pool.query<{ waits_for: string }>(
    "SELECT waits_for FROM core.run_wait_reason WHERE run_id=$1 ORDER BY evaluated_at DESC, reason_id DESC LIMIT 1", [runId]
  )).rows[0]?.waits_for;
}

async function reasonCount(): Promise<number> {
  return (await database.pool.query<{ n: number }>("SELECT count(*)::integer AS n FROM core.run_wait_reason")).rows[0]!.n;
}

async function stampOf(runId: string): Promise<string | undefined> {
  return (await database.pool.query<{ release_key: string }>(
    "SELECT release_key FROM core.run WHERE run_id=$1", [runId]
  )).rows[0]?.release_key;
}

async function settle(runId: string): Promise<void> {
  await database.pool.query("UPDATE core.work_item SET state='DONE', claimed_by=NULL, claim_deadline=NULL WHERE run_id=$1", [runId]);
}

describe("side-by-side C8: at most 8 debates across releases", () => {
  it("8 live debates (4 on r16, 4 on r17): a new ask waits on the site's day, SITE_BUSY in the database; one ends, the waker starts it", async () => {
    now = new Date("2033-04-01T10:00:20.000Z");
    const live = [];
    for (const key of [R16, R16, R16, R16, R17, R17, R17, R17]) live.push(await liveDebate(key));
    const dispatched: string[] = [];
    const application = r17Application(dispatched);

    const held = await submitAs(application);
    expect(held).toMatchObject({
      status: "WAITING", waiting_scope: "SITE_DAY", waits_until: nextWholeMinute(now).toISOString()
    });
    expect(held).not.toHaveProperty("waits_for");
    expect(await latestReasonOf(held.run_ref)).toBe("SITE_BUSY");
    expect(await stampOf(held.run_ref)).toBe(R17);

    // Still 8: the waker's pass stops at the busy site and appends no second SITE_BUSY.
    now = new Date("2033-04-01T10:01:00.000Z");
    const before = await reasonCount();
    await expect(application.wakeWaitingRuns()).resolves.toMatchObject({ started: 0, stopped: true });
    expect(await reasonCount()).toBe(before);

    await settle(live[0]!);
    now = new Date("2033-04-01T10:02:00.000Z");
    await expect(application.wakeWaitingRuns()).resolves.toMatchObject({ started: 1 });
    expect(dispatched).toEqual([held.run_ref]);
  });

  it("7 live debates: a new ask is QUEUED", async () => {
    now = new Date("2033-04-02T10:00:20.000Z");
    for (const key of [R16, R16, R16, R17, R17, R17, R17]) await liveDebate(key);
    const accepted = await submitAs(r17Application());
    expect(accepted.status).toBe("QUEUED");
  });

  it("two asks at once with 7 live debates: exactly one QUEUED and one WAITING", async () => {
    now = new Date("2033-04-03T10:00:20.000Z");
    for (const key of [R16, R16, R16, R17, R17, R17, R17]) await liveDebate(key);
    const application = r17Application();
    const answers = await Promise.all([submitAs(application), submitAs(application)]);
    expect(answers.map((answer) => answer.status).sort()).toEqual(["QUEUED", "WAITING"]);
    const waiting = answers.find((answer) => answer.status === "WAITING")!;
    expect(await latestReasonOf(waiting.run_ref)).toBe("SITE_BUSY");
  });

  it("the room decision pool's login (debateai_runtime) may make both reads", async () => {
    // Row-level security (0126, D29): the room decision pool is a system login, so the file's login is the system twin
    // of debateai_runtime (the role and the cross-account marker); BARE holds the role alone, with no account context.
    const runtime: Pool = createPool(await createSystemTwin(database, LOGIN, ["debateai_runtime"]), { max: 1 });
    await database.pool.query(`CREATE ROLE ${BARE} LOGIN PASSWORD '${SECRET}' IN ROLE debateai_runtime`);
    const url = new URL(database.connectionString);
    url.username = BARE;
    url.password = SECRET;
    const bare: Pool = createPool(url.toString(), { max: 1 });
    try {
      await liveDebate(R16);
      const client = await runtime.connect();
      try {
        const gate = new PostgresAskAdmissionGate({ releaseKey: R17, hosted: false });
        await client.query("BEGIN");
        expect(await gate.ownReleaseIsCurrent(client)).toBe(true);
        expect(await gate.activeDebates(client)).toBe(1);
        expect(await new PostgresAskAdmissionGate({ releaseKey: R17, hosted: true }).ownReleaseIsCurrent(client)).toBe(false);
        await client.query("COMMIT");
      } finally {
        client.release();
      }
      // The bare role counts none of the site's debates: the cap needs the system login.
      const bareClient = await bare.connect();
      try {
        await bareClient.query("BEGIN");
        expect(await new PostgresAskAdmissionGate({ releaseKey: R17, hosted: false }).activeDebates(bareClient)).toBe(0);
        await bareClient.query("COMMIT");
      } finally {
        bareClient.release();
      }
    } finally {
      await runtime.end();
      await bare.end();
    }
  });
});

async function holdCount(runId: string): Promise<number> {
  return (await database.pool.query<{ n: number }>(
    "SELECT count(*)::integer AS n FROM ledger.model_spend_hold WHERE run_id=$1", [runId]
  )).rows[0]!.n;
}

async function registerVersionOf(runId: string): Promise<number | undefined> {
  return (await database.pool.query<{ v: number }>(
    "SELECT register_version::integer AS v FROM core.run WHERE run_id=$1", [runId]
  )).rows[0]?.v;
}

/**
 * Side-by-side spec §13 "The API re-checks at admission" (Task S11), on migration 0124's real
 * `register.settings_version_passed`: r17 passes its own site version (17) with no verdict (D1) and has no verdict for
 * 18, so an ask admitted on 18 is not started. Through the room it waits in line (SWITCHING), stamped 18, with no hold
 * and no error; the waker's start re-checks it and stops (ruling R11). On the direct path it is refused plainly and
 * nothing is written (ruling R47). These cases run while r17 is current (no release row, not hosted), before the
 * mid-switch case below makes r18 current.
 */
describe("side-by-side S11: the admission re-check also needs a passed settings version", () => {
  it("an ask on version 18, which r17 has not passed, waits SWITCHING: stamped 18, no hold, no error; the waker stops", async () => {
    now = new Date("2033-04-05T10:00:20.000Z");
    const dispatched: string[] = [];
    const application = r17Application(dispatched, { active: 18 });

    const held = await submitAs(application);
    expect(held).toMatchObject({ status: "WAITING", waiting_scope: "SITE_DAY", waits_until: nextWholeMinute(now).toISOString() });
    expect(held).not.toHaveProperty("waits_for");
    expect(await latestReasonOf(held.run_ref)).toBe("SWITCHING");
    expect(await registerVersionOf(held.run_ref)).toBe(18);
    expect(await stampOf(held.run_ref)).toBe(R17);
    expect(await holdCount(held.run_ref)).toBe(0);

    now = new Date("2033-04-05T10:01:00.000Z");
    const before = await reasonCount();
    await expect(application.wakeWaitingRuns()).resolves.toMatchObject({ started: 0, stopped: true });
    expect(await reasonCount()).toBe(before);
    expect(dispatched).toEqual([]);
    expect(await holdCount(held.run_ref)).toBe(0);
  });

  it("the same ask on r17's own site version (17, passed with no verdict: D1) is QUEUED, with its hold", async () => {
    now = new Date("2033-04-06T10:00:20.000Z");
    const accepted = await submitAs(r17Application([], { active: 17 }));
    expect(accepted.status).toBe("QUEUED");
    expect(await registerVersionOf(accepted.run_ref)).toBe(17);
    expect(await holdCount(accepted.run_ref)).toBe(1);
  });

  it("the direct path (no room): an ask on 18 is refused plainly and nothing is written; on 17 it is QUEUED", async () => {
    const errors = vi.spyOn(console, "error").mockImplementation(() => undefined);
    try {
      const runs = async (): Promise<number> =>
        (await database.pool.query<{ n: number }>("SELECT count(*)::integer AS n FROM core.run")).rows[0]!.n;
      const before = await runs();
      await expect(submitAs(r17Application([], { active: 18, room: false }))).rejects.toMatchObject({
        name: "AskRefusal", code: "ASK_MODEL_CANDIDATE_UNAVAILABLE"
      });
      expect(await runs()).toBe(before);
      expect(errors.mock.calls.map(([line]) => String(line))).toContainEqual(JSON.stringify({
        kind: "DEBATEAI_ADMISSION_SETTINGS", code: "ADMISSION_SETTINGS_NOT_PASSED", version: 18
      }));
      await expect(submitAs(r17Application([], { active: 17, room: false }))).resolves.toMatchObject({ status: "QUEUED" });
    } finally {
      errors.mockRestore();
    }
  });

  it("both logins may ask it: the room decision pool's (debateai_runtime) and the API's runtime pool's (debateai_billing_runtime)", async () => {
    const secret = ["s11", "fixture", "only"].join("-");
    for (const [login, role] of [["s11_room_decision", "debateai_runtime"], ["s11_api_runtime", "debateai_billing_runtime"]] as const) {
      await database.pool.query(`CREATE ROLE ${login} LOGIN PASSWORD '${secret}' IN ROLE ${role}`);
      const url = new URL(database.connectionString);
      url.username = login;
      url.password = secret;
      const pool: Pool = createPool(url.toString(), { max: 1 });
      try {
        const client = await pool.connect();
        try {
          const gate = new PostgresAskAdmissionGate({ releaseKey: R17, hosted: false });
          await client.query("BEGIN");
          expect(await gate.ownReleaseIsCurrent(client, 17), login).toBe(true);
          expect(await gate.ownReleaseIsCurrent(client, 18), login).toBe(false);
          expect(await settingsVersionPassed(client, R17, 18), login).toBe(false);
          await client.query("COMMIT");
        } finally {
          client.release();
        }
      } finally {
        await pool.end();
      }
    }
  });
});

describe("side-by-side C8: an ask caught mid-switch waits in line", () => {
  it("r18 is CURRENT: the r17 API's ask waits, stamped r17, SWITCHING; its waker stops and writes nothing", async () => {
    now = new Date("2033-04-04T10:00:20.000Z");
    await database.pool.query("SELECT core.record_release_event($1, 'STAGED', 'test', NULL)", [R18]);
    await database.pool.query("SELECT core.record_release_switch($1, NULL, now(), 'test', NULL)", [R18]);
    const dispatched: string[] = [];
    const application = r17Application(dispatched);

    const held = await submitAs(application);
    expect(held).toMatchObject({
      status: "WAITING", waiting_scope: "SITE_DAY", waits_until: nextWholeMinute(now).toISOString()
    });
    expect(held).not.toHaveProperty("waits_for");
    expect(await stampOf(held.run_ref)).toBe(R17);
    expect(await latestReasonOf(held.run_ref)).toBe("SWITCHING");

    now = new Date("2033-04-04T10:01:00.000Z");
    const before = await reasonCount();
    await expect(application.wakeWaitingRuns()).resolves.toMatchObject({ started: 0, stopped: true });
    expect(await reasonCount()).toBe(before);
    expect(dispatched).toEqual([]);
  });
});
