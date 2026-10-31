import { createHash, randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { personWindowsFor } from "@debateai/billing-core";
import { PostgresModelSpendStore, type PersonAllowanceSource } from "@debateai/budget";
import type { AskParent } from "@debateai/contract";
import {
  createPool,
  EntitlementRepository,
  migrate,
  PostgresDigModelRepository,
  PostgresDigModelRunnerRepository,
  PostgresInvestigationRepository,
  type Pool
} from "@debateai/db";
import { BILLING_PLANS_DEPLOYMENT_REGISTER_ROW, billingPlansFromValue, planById } from "@debateai/register";
import { AskRoom } from "../../apps/api/src/ask-room.js";
import { PersonUsageReader } from "../../apps/api/src/billing/usage.js";
import { admitDig, joinAtStart } from "../../apps/api/src/dig-admission.js";
import { continuePausedRun } from "../../apps/api/src/month-pause.js";
import { MonthPause } from "../../apps/runner/src/month-pause.js";
import { startTestDatabase, type TestDatabase } from "../support/testDatabase.js";

/**
 * Plan 2026-10-30 dig-model revision W3-2 on real PostgreSQL (0131, 0133, 0134): a dig's admission and its join at
 * start (level 10 admitted, past it refused with nothing written, a closed investigation reopened), the money rule's
 * room and usage over the real ledger (the day's borrow derived from recorded charges, PATH_REWRITE counted, new starts
 * waiting for the reset, the run that borrowed named), and the month pause from the runner's record to the person's
 * Continue. Data is made up.
 */
let database: TestDatabase;
let api: Pool;
let runner: Pool;
let sequence = 9_400_000;
const SECRET = Buffer.alloc(32, 9);
const plans = billingPlansFromValue(BILLING_PLANS_DEPLOYMENT_REGISTER_ROW.value, BILLING_PLANS_DEPLOYMENT_REGISTER_ROW.sourceRef);

const loginPool = (role: string, password: string): Pool => {
  const url = new URL(database.connectionString);
  url.username = role;
  url.password = password;
  return createPool(url.toString());
};
type Account = Readonly<{ userId: string; ownerRef: string }>;
async function account(): Promise<Account> {
  const userId = randomUUID();
  await database.pool.query(`INSERT INTO identity."user" (user_id,email_blind_index,email_ciphertext,recovery_email_ciphertext,password_hash,pseudonym,state,adult_affirmed_at)
    VALUES ($1,$2,'{}','{}','fixture-password',$3,'active',now())`, [userId, createHash("sha256").update(userId).digest(), `inv-room-${userId}`]);
  const ownerRef = (await database.pool.query<{ owner_ref: string }>('SELECT owner_ref FROM identity."user" WHERE user_id=$1', [userId])).rows[0]!.owner_ref;
  return { userId, ownerRef };
}
/** A private debate with content encryption, owned by `owner`. */
async function run(owner: Account): Promise<string> {
  const runId = randomUUID();
  const seq = ++sequence;
  const seed = await database.pool.connect();
  try {
    await seed.query("BEGIN");
    await seed.query("SET LOCAL session_replication_role = 'replica'");
    await seed.query(`INSERT INTO core.run
      (run_id,question_line,asker_id,session_id,caller_scope,as_of,asker_risk_tier,risk_tier,
       tier_source,tier_provenance_ref,composition_budget_tier,depth_params,agent_count,discovered_panel,
       stranger_sample_rate,envelope_basis,register_version,battery_version,ask_contract,created_at_seq,
       question_blind_index_version,content_encryption_version)
      VALUES ($1,'Fixture question',$2,$3,'ASKER',now(),'standard','standard','ASKER','fixture','low',
       '{}'::jsonb,2,'[{},{}]'::jsonb,0,'{}'::jsonb,1,'fixture','{}'::jsonb,$4,1,1)`,
      [runId, `owner:${owner.ownerRef}`, randomUUID(), seq]);
    await seed.query("INSERT INTO core.run_ownership_event(run_id,owner_ref,at_seq) VALUES ($1,$2,$3)", [runId, owner.ownerRef, seq]);
    await seed.query("INSERT INTO core.run_content_attestation_secret(run_id,secret,created_at) VALUES ($1,$2,now())", [runId, SECRET]);
    await seed.query("COMMIT");
  } catch (error) { await seed.query("ROLLBACK"); throw error; } finally { seed.release(); }
  return runId;
}
/** A first debate and `levels` digs under it, each joined through the API's repository: [root, level 1, …]. */
async function chain(owner: Account, levels: number): Promise<string[]> {
  const investigations = new PostgresInvestigationRepository(api);
  const runs = [await run(owner)];
  for (let level = 1; level <= levels; level += 1) {
    const child = await run(owner);
    expect(await joinAtStart({ ownerRef: owner.ownerRef, parent: parentOf(runs.at(-1)!), childRunId: child }, investigations))
      .toBe("JOINED");
    runs.push(child);
  }
  return runs;
}
const parentOf = (parentRunId: string): AskParent => ({
  parent_run_id: parentRunId, places: ["path:p1"], mode: "quick",
  picks: [{ kind: "OWN_VIEW", suggestion_id: null, place: "path:p1", text: "Rent eats most of the difference." }]
});

beforeAll(async () => {
  database = await startTestDatabase();
  await migrate(database.pool);
  await database.pool.query("CREATE ROLE inv_room_api LOGIN PASSWORD 'inv-room-api-test-only' IN ROLE debateai_runtime,debateai_billing_runtime");
  await database.pool.query("CREATE ROLE inv_room_runner LOGIN PASSWORD 'inv-room-runner-test-only' IN ROLE debateai_runtime");
  api = loginPool("inv_room_api", "inv-room-api-test-only");
  runner = loginPool("inv_room_runner", "inv-room-runner-test-only");
}, 300_000);

afterAll(async () => {
  await Promise.all([api?.end(), runner?.end()]);
  await database?.stop();
});

describe("a dig's admission and its join at start", () => {
  it("level 10 is admitted and joins; a dig of it is refused before anything is written; another account's parent is not found", async () => {
    const person = await account();
    const runs = await chain(person, 9);
    const levels = new PostgresDigModelRepository(api);
    expect(await admitDig({ ownerRef: person.ownerRef, parent: parentOf(runs[9]!), free: false }, levels))
      .toEqual({ kind: "ADMIT", parentLevel: 9 });
    const tenth = await run(person);
    expect(await joinAtStart({ ownerRef: person.ownerRef, parent: parentOf(runs[9]!), childRunId: tenth },
      new PostgresInvestigationRepository(api))).toBe("JOINED");
    expect(await levels.readDigLevel(person.ownerRef, tenth)).toBe(10);
    expect(await admitDig({ ownerRef: person.ownerRef, parent: parentOf(tenth), free: false }, levels)).toEqual({ kind: "TOO_DEEP" });
    const stranger = await account();
    expect(await admitDig({ ownerRef: stranger.ownerRef, parent: parentOf(tenth), free: false }, levels)).toEqual({ kind: "NOT_FOUND" });
    // Two quick clicks that raced past the route's check: the database itself refuses an eleventh level, writing nothing.
    const eleventh = await run(person);
    const lines: string[] = [];
    expect(await joinAtStart({ ownerRef: person.ownerRef, parent: parentOf(tenth), childRunId: eleventh },
      new PostgresInvestigationRepository(api), (line) => lines.push(line))).toBe("TOO_DEEP");
    expect(await levels.readDigLevel(person.ownerRef, eleventh)).toBe(0);
    expect(lines).toEqual([JSON.stringify({ kind: "DEBATEAI_DIG_JOIN", code: "DIG_JOIN_TOO_DEEP" })]);
  });

  it("a dig of a dig of a closed investigation reopens it, then joins at level 3", async () => {
    const person = await account();
    const runs = await chain(person, 2);
    const investigations = new PostgresInvestigationRepository(api);
    const opened = await investigations.read(person.ownerRef, runs[2]!);
    expect(await investigations.close(person.ownerRef, opened!.investigation_id)).toMatchObject({ outcome: "CLOSED" });
    const dig = await run(person);
    expect(await joinAtStart({ ownerRef: person.ownerRef, parent: parentOf(runs[2]!), childRunId: dig }, investigations)).toBe("JOINED");
    const after = await investigations.read(person.ownerRef, dig);
    expect(after).toMatchObject({ investigation_id: opened!.investigation_id, state: "open" });
    expect(await new PostgresDigModelRepository(api).readDigLevel(person.ownerRef, dig)).toBe(3);
  });
});

describe("the money rule over the real ledger", () => {
  /** The runs pinned to the person on a subscription (B6), admitted at `admittedAt` (the spend reader's only filter). */
  async function pin(runIds: readonly string[], ownerRef: string, admittedAt: Date): Promise<void> {
    const entitlements = new EntitlementRepository(database.pool);
    const client = await database.pool.connect();
    try {
      await client.query("BEGIN");
      const entitlementEventId = await entitlements.append(client, { ownerRef, planId: "FREE", periodAnchorAt: admittedAt,
        cause: "SIGNED_UP_FREE", effectiveAt: admittedAt, subscriptionId: null, monthCreditOverrideMicros: null, paidThrough: null });
      for (const runId of runIds) {
        await entitlements.recordRunChargeScope(client, { runId, ownerRef, planId: "FREE", entitlementEventId, admittedAt });
      }
      await client.query("COMMIT");
    } catch (error) { await client.query("ROLLBACK"); throw error; } finally { client.release(); }
  }
  /** One charge as the ledger holds it, recorded at `at`. */
  async function charge(runId: string, source: "RUN" | "PATH_REWRITE", micros: number, at: Date): Promise<void> {
    const seed = await database.pool.connect();
    try {
      await seed.query("BEGIN");
      await seed.query("SET LOCAL session_replication_role = 'replica'");
      await seed.query(`INSERT INTO ledger.model_spend (spend_id, spend_source, run_id, provider_ref, charged_on, charge_micros,
          input_tokens, output_tokens, recorded_at)
        VALUES ($1,$2,$3,'provider:inv-room',($5::timestamptz AT TIME ZONE 'UTC')::date,$4,1,1,$5)`, [randomUUID(), source, runId, micros, at]);
      await seed.query("COMMIT");
    } catch (error) { await seed.query("ROLLBACK"); throw error; } finally { seed.release(); }
  }

  it("a day that started lower by yesterday's borrow is full with a dig's rewrite counted: new starts wait, the borrowing run is named", async () => {
    const person = await account();
    const now = new Date();
    // The person's PLUS month began two days ago (whole hours), so yesterday and today are its second and third days.
    const anchor = new Date(Math.floor((now.getTime() - 2 * 86_400_000 - 3_600_000) / 3_600_000) * 3_600_000);
    const allowance: PersonAllowanceSource = { read: async (_owner, at) => personWindowsFor(planById(plans, "PLUS"), anchor, at, 9_500) };
    const [today] = await allowance.read(person.ownerRef, now);
    const yesterdayRun = await run(person);
    const dig = await run(person);
    await pin([yesterdayRun, dig], person.ownerRef, anchor);
    // Yesterday a running debate used 1.3 of the 1.0 day; today a dig's path rewrite used 0.75.
    await charge(yesterdayRun, "RUN", 1_300_000, new Date(today!.periodStart.getTime() - 3_600_000));
    await charge(dig, "PATH_REWRITE", 750_000, new Date(Math.min(today!.periodStart.getTime() + 60_000, now.getTime() - 1_000)));
    // The ledger's readers on the owner pool, as the B9 database suite reads them (the API's own spend pool is composed
    // in main.ts); the dig and pause definers below run on the API's runtime role.
    const store = new PostgresModelSpendStore(database.pool);
    expect(await store.readOwnerSpentMicros(person.ownerRef, today!.periodStart, today!.resetsAt)).toBe(750_000);
    const ranges = [{ from: anchor, to: today!.periodStart }, { from: today!.periodStart, to: today!.resetsAt }];
    expect(await store.readOwnerSpentInRangesMicros(person.ownerRef, ranges)).toEqual([1_300_000, 750_000]);
    expect(await store.readOwnerChargesMicros(person.ownerRef, today!.periodStart, today!.resetsAt)).toEqual([{ runId: dig, chargeMicros: 750_000 }]);

    const room = new AskRoom({
      lockPool: { connect: vi.fn() } as unknown as Pool,
      spend: store,
      line: {
        siteLineBlocking: async () => false, wakeCandidates: async () => [], waitingForOwner: async () => [],
        waitingForLegacyAsker: async () => [], readWaiting: async () => null, isWaiting: async () => false,
        enterWait: async () => undefined, recordReason: async () => undefined, markStarted: async () => undefined
      },
      estimator: { estimateMicros: async () => 10_000 },
      personAllowance: allowance,
      entitlements: null,
      dailyCeilingMicros: 1_000_000_000,
      closeBasisPoints: 9_500,
      waitingLinePerPerson: 1,
      clock: () => now
    });
    const answer = await room.readRoom({ access: { ownerRef: person.ownerRef, legacyAskerId: null },
      settingsClass: { planTier: "premium", compositionBudgetTier: "low", makerCount: 2, depth: 1 } });
    // 0.3 borrowed + 0.75 used of a 1.0 day: full until the day resets.
    expect(answer).toMatchObject({ room: "FULL", scope: "PERSON_DAY", resetsAt: today!.resetsAt, newStarts: "BLOCKED_UNTIL_RESET", reserve: "KEPT" });
    const usage = await new PersonUsageReader({ entitlements: { current: async () => ({ planId: "PLUS" as const }) }, allowance, spend: store })
      .read(person.ownerRef, now);
    expect(usage.windows[0]).toMatchObject({ scope: "PERSON_DAY", percent: 105 });
    expect(usage.borrowed).toEqual([{ scope: "PERSON_DAY", runRef: dig, percent: 5, nextWindowStartsAt: today!.resetsAt }]);
  });
});

describe("the month pause, from the runner's record to the person's Continue", () => {
  it("paused at the wall, Continue before the reset is refused; after it, recorded once and the runner goes on", async () => {
    const person = await account();
    const debate = await run(person);
    const resumableAt = new Date(Date.now() + 60_000);
    const runnerSide = new PostgresDigModelRunnerRepository(runner);
    const apiSide = new PostgresDigModelRepository(api);
    expect(await runnerSide.recordPause({ runId: debate, reason: "MONTH_WALL", resumableAt, plannedCalls: 3, plannedSearches: 2, plannedMicros: 0 }))
      .toBe("RECORDED");
    const room = { monthHasRoom: async () => true };
    expect(await continuePausedRun({ ownerRef: person.ownerRef, runId: debate, now: new Date() }, apiSide, room))
      .toEqual({ kind: "UNTIL_RESET", until: resumableAt.toISOString() });
    expect((await apiSide.readPause(person.ownerRef, debate))?.state).toBe("PAUSED");
    const stranger = await account();
    expect((await continuePausedRun({ ownerRef: stranger.ownerRef, runId: debate, now: new Date(resumableAt.getTime() + 1) }, apiSide, room)).kind)
      .toBe("NOT_FOUND");
    expect(await continuePausedRun({ ownerRef: person.ownerRef, runId: debate, now: new Date(resumableAt.getTime() + 1) }, apiSide, room))
      .toEqual({ kind: "CONTINUING" });
    expect((await continuePausedRun({ ownerRef: person.ownerRef, runId: debate, now: new Date(resumableAt.getTime() + 1) }, apiSide, room)).kind)
      .toBe("NOT_PAUSED");
    // The runner's next admission of the debate reads the pause from the database: it is over, so the call goes on.
    const admitted: string[] = [];
    await new MonthPause({ store: runnerSide }).admit(debate, "call", async () => { admitted.push("call"); });
    expect(admitted).toEqual(["call"]);
  });
});
