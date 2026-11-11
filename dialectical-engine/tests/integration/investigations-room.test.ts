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
  PostgresInvestigationRunnerRepository,
  type Pool
} from "@debateai/db";
import { BILLING_PLANS_DEPLOYMENT_REGISTER_ROW, billingPlansFromValue, planById } from "@debateai/register";
import { AskRoom } from "../../apps/api/src/ask-room.js";
import { PersonUsageReader } from "../../apps/api/src/billing/usage.js";
import { admitDig, joinAtStart } from "../../apps/api/src/dig-admission.js";
import { continuePausedRun } from "../../apps/api/src/month-pause.js";
import { MonthPause } from "../../apps/runner/src/month-pause.js";
import { asRequestOf, seedLiveSession } from "../support/rls-logins.js";
import { startTestDatabase, type TestDatabase } from "../support/testDatabase.js";

/**
 * Plan 2026-10-30 dig-model revision W3-2 on real PostgreSQL (0131, 0133, 0134): a dig's admission and its join at
 * start (level 10 admitted, past it refused with nothing written, a closed investigation reopened), the money rule's
 * room and usage over the real ledger (the day's borrow derived from recorded charges, PATH_REWRITE counted, new starts
 * waiting for the reset, the run that borrowed named), and the month pause from the runner's record to the person's
 * Continue. Data is made up. Since the security review's 0171 (F5) the API's role runs here as each person's own request (its login
 * carrying their live session), as its functions believe no other owner; 0133's owner read of an investigation is no role's any more,
 * so the runner's reader reads it.
 */
let database: TestDatabase;
let api: Pool;
/** The API's role wired as main.ts wires its request pool: inside a request its own connections carry the person's session. */
let requests: Pool;
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
type Account = Readonly<{ userId: string; ownerRef: string; token: string }>;
async function account(): Promise<Account> {
  const userId = randomUUID();
  await database.pool.query(`INSERT INTO identity."user" (user_id,email_blind_index,email_ciphertext,recovery_email_ciphertext,password_hash,pseudonym,state,adult_affirmed_at)
    VALUES ($1,$2,'{}','{}','fixture-password',$3,'active',now())`, [userId, createHash("sha256").update(userId).digest(), `inv-room-${userId}`]);
  const ownerRef = (await database.pool.query<{ owner_ref: string }>('SELECT owner_ref FROM identity."user" WHERE user_id=$1', [userId])).rows[0]!.owner_ref;
  return { userId, ownerRef, token: await seedLiveSession(database.pool, userId) };
}
/** The person's own request, on the API's role. */
const asking = (person: Account): Pool => asRequestOf(requests, person.token);
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
  const investigations = new PostgresInvestigationRepository(asking(owner));
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
  // The runner's login holds the cross-account marker, as runner-runtime does: since 0171 (F5) the runner's own steps of a debate are the marker's.
  await database.pool.query("CREATE ROLE inv_room_runner LOGIN PASSWORD 'inv-room-runner-test-only' IN ROLE debateai_runtime,debateai_rls_all_accounts");
  api = loginPool("inv_room_api", "inv-room-api-test-only");
  runner = loginPool("inv_room_runner", "inv-room-runner-test-only");
  const apiUrl = new URL(database.connectionString);
  apiUrl.username = "inv_room_api";
  apiUrl.password = "inv-room-api-test-only";
  requests = createPool(apiUrl.toString(), { crossAccount: api });
}, 300_000);

afterAll(async () => {
  await Promise.all([api?.end(), runner?.end(), requests?.end()]);
  await database?.stop();
});

describe("a dig's admission and its join at start", () => {
  it("level 10 is admitted and joins; a dig of it is refused before anything is written; another account's parent is not found", async () => {
    const person = await account();
    const runs = await chain(person, 9);
    const levels = new PostgresDigModelRepository(asking(person));
    expect(await admitDig({ ownerRef: person.ownerRef, parent: parentOf(runs[9]!), free: false }, levels))
      // W3-7: the admission names the path the dig's places share (its picks are kept on it).
      .toEqual({ kind: "ADMIT", parentLevel: 9, positionRef: "p1" });
    const tenth = await run(person);
    expect(await joinAtStart({ ownerRef: person.ownerRef, parent: parentOf(runs[9]!), childRunId: tenth },
      new PostgresInvestigationRepository(asking(person)))).toBe("JOINED");
    expect(await levels.readDigLevel(person.ownerRef, tenth)).toBe(10);
    expect(await admitDig({ ownerRef: person.ownerRef, parent: parentOf(tenth), free: false }, levels)).toEqual({ kind: "TOO_DEEP" });
    const stranger = await account();
    expect(await admitDig({ ownerRef: stranger.ownerRef, parent: parentOf(tenth), free: false }, new PostgresDigModelRepository(asking(stranger))))
      .toEqual({ kind: "NOT_FOUND" });
    // Two quick clicks that raced past the route's check: the database itself refuses an eleventh level, writing nothing.
    const eleventh = await run(person);
    const lines: string[] = [];
    expect(await joinAtStart({ ownerRef: person.ownerRef, parent: parentOf(tenth), childRunId: eleventh },
      new PostgresInvestigationRepository(asking(person)), (line) => lines.push(line))).toBe("TOO_DEEP");
    expect(await levels.readDigLevel(person.ownerRef, eleventh)).toBe(0);
    expect(lines).toEqual([JSON.stringify({ kind: "DEBATEAI_DIG_JOIN", code: "DIG_JOIN_TOO_DEEP" })]);
  });

  it("a dig of a dig of a closed investigation reopens it, then joins at level 3", async () => {
    const person = await account();
    const runs = await chain(person, 2);
    const investigations = new PostgresInvestigationRepository(asking(person));
    const opened = await new PostgresInvestigationRunnerRepository(runner).ofRun(runs[2]!);
    expect(await investigations.close(person.ownerRef, opened!.investigation_id)).toMatchObject({ outcome: "CLOSED" });
    const dig = await run(person);
    expect(await joinAtStart({ ownerRef: person.ownerRef, parent: parentOf(runs[2]!), childRunId: dig }, investigations)).toBe("JOINED");
    const after = await new PostgresInvestigationRunnerRepository(runner).ofRun(dig);
    expect(after).toMatchObject({ investigation_id: opened!.investigation_id, state: "open" });
    expect(await new PostgresDigModelRepository(asking(person)).readDigLevel(person.ownerRef, dig)).toBe(3);
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
    // Yesterday a running debate used 330,000 past the made-up day of 726,000; today a dig's path rewrite used 432,300.
    await charge(yesterdayRun, "RUN", 1_056_000, new Date(today!.periodStart.getTime() - 3_600_000));
    await charge(dig, "PATH_REWRITE", 432_300, new Date(Math.min(today!.periodStart.getTime() + 60_000, now.getTime() - 1_000)));
    // The ledger's readers on the owner pool, as the B9 database suite reads them (the API's own spend pool is composed
    // in main.ts); the dig and pause definers below run on the API's runtime role.
    const store = new PostgresModelSpendStore(database.pool);
    expect(await store.readOwnerSpentMicros(person.ownerRef, today!.periodStart, today!.resetsAt)).toBe(432_300);
    const ranges = [{ from: anchor, to: today!.periodStart }, { from: today!.periodStart, to: today!.resetsAt }];
    expect(await store.readOwnerSpentInRangesMicros(person.ownerRef, ranges)).toEqual([1_056_000, 432_300]);
    expect(await store.readOwnerChargesMicros(person.ownerRef, today!.periodStart, today!.resetsAt)).toEqual([{ runId: dig, chargeMicros: 432_300 }]);

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
    // 330,000 borrowed + 432,300 used of a 726,000 day: full until the day resets.
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
    const apiSide = new PostgresDigModelRepository(asking(person));
    expect(await runnerSide.recordPause({ runId: debate, reason: "MONTH_WALL", resumableAt, plannedCalls: 3, plannedSearches: 2, plannedMicros: 0 }))
      .toBe("RECORDED");
    const room = { monthHasRoom: async () => true };
    expect(await continuePausedRun({ ownerRef: person.ownerRef, runId: debate, now: new Date() }, apiSide, room))
      .toEqual({ kind: "UNTIL_RESET", until: resumableAt.toISOString() });
    expect((await apiSide.readPause(person.ownerRef, debate))?.state).toBe("PAUSED");
    const stranger = await account();
    expect((await continuePausedRun({ ownerRef: stranger.ownerRef, runId: debate, now: new Date(resumableAt.getTime() + 1) },
      new PostgresDigModelRepository(asking(stranger)), room)).kind).toBe("NOT_FOUND");
    expect(await continuePausedRun({ ownerRef: person.ownerRef, runId: debate, now: new Date(resumableAt.getTime() + 1) }, apiSide, room))
      .toEqual({ kind: "CONTINUING" });
    // W3-8: a second press is idempotent (CONTINUING again, nothing recorded again).
    expect((await continuePausedRun({ ownerRef: person.ownerRef, runId: debate, now: new Date(resumableAt.getTime() + 1) }, apiSide, room)).kind)
      .toBe("CONTINUING");
    expect((await apiSide.readPause(person.ownerRef, debate))?.state).toBe("RESUMED");
    // The runner's next admission of the debate reads the pause from the database: it is over, so the call goes on.
    const admitted: string[] = [];
    await new MonthPause({ store: runnerSide }).admit(debate, "call", async () => { admitted.push("call"); });
    expect(admitted).toEqual(["call"]);
  });
});
