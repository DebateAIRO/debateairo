import { randomBytes, randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createInitialBatteryRows } from "@debateai/battery";
import { BillingPersonAllowanceSource, computeWindows, type PlansInForcePort } from "@debateai/billing-core";
import { CostEnvelopeGuard, PostgresModelSpendStore, costEnvelopeDay, isMonthWallReached, type PersonWindow } from "@debateai/budget";
import {
  BillingRepository, EntitlementRepository, RunRepository, migrate, recordReleaseEvent, recordReleaseSwitch
} from "@debateai/db";
import { TypedDomainError } from "@debateai/kernel";
import {
  BILLING_PLANS_DEPLOYMENT_REGISTER_ROW, BILLING_PLANS_ROW_KEY, createBillingPlansInForce, parseRegisterVersionText,
  readBillingPlans, registerVersionToSafeLegacyNumber, type BillingPlans
} from "@debateai/register";
import { readWindowBorrow } from "../../apps/api/src/ask-room.js";
import { withdraw } from "../../apps/api/src/billing/withdrawal.js";
import { seedNetopiaSubscription, subscriptionDeps } from "../support/billingSubscriptionFixtures.js";
import { fixtureDiscoveredPanel, fixtureStructuralCeiling } from "../support/discoveredPanel.js";
import { testHttpIdentity } from "../support/httpSession.js";
import { importHistoricalRegisterFixture, publishRegisterFixture, registerFixtureRow } from "../support/registerFixtures.js";
import { startTestDatabase, type TestDatabase } from "../support/testDatabase.js";

/**
 * A month keeps the plan numbers it started with, on real PostgreSQL: the switches 0123 records, read through 0183's
 * `core.read_release_history()`, the sealed plans rows of two settings versions, the real entitlement reads and the
 * real spend ledger. Every amount is made up (multiples of eleven).
 *
 * The site served version 1 for a long time: PLUS has a month credit of 1,100,000 and a day cap of 121,000 (11% of
 * it). An hour ago an upload made version 5 take the traffic: PLUS's credit is 550,000, so its day cap is 60,500.
 * Everyone below started their month before that hour.
 */
let database: TestDatabase;
let own: BillingPlans;
let plansInForce: PlansInForcePort;

const HOUR = 3_600_000;
const DAY = 24 * HOUR;
const OLD_VERSION = 1;
/** The first version the publication port seals on top of the historical ones. */
const NEW_VERSION = 5;
const OLD_KEY = `r${OLD_VERSION}-0123456789ab`;
const NEW_KEY = `r${NEW_VERSION}-ba9876543210`;
const BY = "test:plans-in-force";
const now = new Date();
const UPLOAD = new Date(now.getTime() - HOUR);
const batteryRows = createInitialBatteryRows({ settlementWatchHandle: "settlement-watch:plans-in-force" });

const plansValue = (plusCreditMicros: number): unknown => ({
  ...BILLING_PLANS_DEPLOYMENT_REGISTER_ROW.value,
  plans: BILLING_PLANS_DEPLOYMENT_REGISTER_ROW.value.plans.map((plan) => plan.plan_id === "PLUS"
    ? { ...plan, monthly_credit_micros: plusCreditMicros, day_bp: 1_100, week_bp: 9_900, reserve_micros: 44_000, finish_overflow_micros: 22_000 }
    : { ...plan, finish_overflow_micros: 22_000 })
});

/** One settings version's plans row, written through the register's own publication port (no direct register DML). */
const plansRow = (plusCreditMicros: number) => registerFixtureRow(BILLING_PLANS_ROW_KEY, plansValue(plusCreditMicros), "test:plans-in-force");

beforeAll(async () => {
  database = await startTestDatabase();
  await migrate(database.pool);
  // The migrations seal no version: the old plans are imported as version 1, and the new ones published on top of it.
  await importHistoricalRegisterFixture(database.pool, 1, [plansRow(1_100_000)]);
  const published = await publishRegisterFixture(database.pool, {
    publicationId: randomUUID(), baseRegisterVersion: parseRegisterVersionText(String(OLD_VERSION)), rows: [plansRow(550_000)],
    sourceRef: "test:plans-in-force"
  });
  expect(registerVersionToSafeLegacyNumber(published.registerVersion)).toBe(NEW_VERSION);
  await recordReleaseEvent(database.pool, { releaseKey: OLD_KEY, kind: "STAGED", recordedBy: BY });
  await recordReleaseSwitch(database.pool, {
    newReleaseKey: OLD_KEY, expectedCurrent: null, takeTrafficFrom: new Date(now.getTime() - 90 * DAY), recordedBy: BY
  });
  await recordReleaseEvent(database.pool, { releaseKey: NEW_KEY, kind: "STAGED", recordedBy: BY });
  await recordReleaseSwitch(database.pool, { newReleaseKey: NEW_KEY, expectedCurrent: OLD_KEY, takeTrafficFrom: UPLOAD, recordedBy: BY });
  // This process is the new release: its own plans are version 5's.
  own = (await readBillingPlans(database.pool, NEW_VERSION))!;
  plansInForce = createBillingPlansInForce({ pool: database.pool, ownVersion: NEW_VERSION, ownPlans: own });
}, 120_000);
afterAll(async () => database?.stop());

/** A PLUS subscriber whose month started `startedAgoMs` ago, and one debate of theirs to charge. */
async function subscriber(label: string, startedAgoMs: number): Promise<Readonly<{ ownerRef: string; runId: string; anchor: Date }>> {
  const ownerRef = randomUUID();
  const anchor = new Date(now.getTime() - startedAgoMs);
  const runId = await new RunRepository(database.pool).startRun({
    questionLine: label, principal: { kind: "legacy", legacyAskerId: `asker:${label}` },
    sessionId: `session:${label}`, callerScope: "ASKER",
    asOf: new Date("2026-09-29T00:00:00.000Z"), askerRiskTier: "casual", effectiveRiskTier: "casual",
    tierSource: "ASKER", tierProvenanceRef: `asker-declaration:${label}`, compositionBudgetTier: "low",
    depthParams: { depth: 1 }, discoveredPanel: fixtureDiscoveredPanel(1), strangerSampleRate: 1,
    envelopeBasis: fixtureStructuralCeiling(10, 1, 1),
    registerVersion: 1, batteryVersion: "s00", batteryRows
  });
  const entitlements = new EntitlementRepository(database.pool);
  const client = await database.pool.connect();
  try {
    await client.query("BEGIN");
    await client.query(`INSERT INTO identity."user"(user_id,owner_ref,email_blind_index,email_ciphertext,recovery_email_ciphertext,password_hash,pseudonym,state,adult_affirmed_at)
      VALUES($1,$2,$3,'{}','{}','fixture-password',$4,'active',clock_timestamp())`,
      [randomUUID(), ownerRef, randomBytes(32), `plans-in-force:${randomUUID()}`]);
    const entitlementEventId = await entitlements.append(client, {
      ownerRef, planId: "PLUS", periodAnchorAt: anchor, cause: "SUBSCRIBED", effectiveAt: anchor,
      subscriptionId: randomUUID(), monthCreditOverrideMicros: null, paidThrough: computeWindows(anchor, anchor).month.end
    });
    await entitlements.recordRunChargeScope(client, { runId, ownerRef, planId: "PLUS", entitlementEventId, admittedAt: now });
    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK").catch(() => undefined);
    throw error;
  } finally {
    client.release();
  }
  return Object.freeze({ ownerRef, runId, anchor });
}

async function charge(store: PostgresModelSpendStore, runId: string, chargeMicros: number): Promise<void> {
  await store.recordSpend({
    spendId: randomUUID(), spendSource: "RUN", runId, providerRef: "provider:plans-in-force",
    chargedOn: costEnvelopeDay(new Date()), chargeMicros, inputTokens: 1, outputTokens: 1, spendPhase: "BODY"
  });
}

/** The person's windows as the API reads them: with the plans the site served since the month started, or today's alone. */
const apiAllowance = (kept: boolean) => new BillingPersonAllowanceSource({
  entitlements: new EntitlementRepository(database.pool), plans: own, closeBasisPoints: 9_500, ...(kept ? { plansInForce } : {})
});
const limitOf = (windows: ReadonlyArray<PersonWindow>, scope: PersonWindow["scope"]): number =>
  windows.find((window) => window.scope === scope)!.limitMicros;

describe("0183: the switches the site made, read by the runtime", () => {
  it("lists each switch with its release and the instant it took the traffic from, oldest first", async () => {
    const rows = (await database.pool.query<{ release_key: string; take_traffic_from: Date }>(
      "SELECT release_key, take_traffic_from FROM core.read_release_history()")).rows;
    expect(rows.map((row) => row.release_key)).toEqual([OLD_KEY, NEW_KEY]);
    expect(rows[1]!.take_traffic_from).toEqual(UPLOAD);
  });

  it("is a definer of the release owner that only the runtime may call; the table itself stays closed to the runtime", async () => {
    const facts = (await database.pool.query<{ owner: string; definer: boolean; runtime: boolean; everyone: boolean; table_read: boolean }>(`
      SELECT pg_get_userbyid(p.proowner) AS owner, p.prosecdef AS definer,
        has_function_privilege('debateai_runtime', p.oid, 'EXECUTE') AS runtime,
        has_function_privilege('public', p.oid, 'EXECUTE') AS everyone,
        has_table_privilege('debateai_runtime', 'core.release_event', 'SELECT') AS table_read
      FROM pg_proc AS p WHERE p.oid = 'core.read_release_history()'::regprocedure`)).rows[0];
    expect(facts).toEqual({ owner: "debateai_release_owner", definer: true, runtime: true, everyone: false, table_read: false });
    const client = await database.pool.connect();
    try {
      await client.query("BEGIN");
      await client.query("SET LOCAL ROLE debateai_runtime");
      expect((await client.query("SELECT release_key FROM core.read_release_history()")).rows).toHaveLength(2);
      await client.query("ROLLBACK");
    } finally {
      client.release();
    }
  });

  it("gives the plans of both versions for a month that started before the upload, and the new ones alone after it", async () => {
    const credits = async (from: Date, to: Date) => (await plansInForce.between(from, to)).map((plans) => plans.plans[1]!.monthlyCreditMicros);
    expect(await credits(new Date(now.getTime() - 12 * DAY), now)).toEqual([1_100_000, 550_000]);
    expect(await credits(new Date(now.getTime() - 12 * DAY), new Date(UPLOAD.getTime() - 1))).toEqual([1_100_000]);
    expect(await credits(new Date(UPLOAD.getTime() + 1), now)).toEqual([550_000]);
  });
});

describe("effect 1: a lower day cap is not counted over days already used (the real ledger)", () => {
  it("what was used today within the cap the month started with borrows nothing from tomorrow", async () => {
    const store = new PostgresModelSpendStore(database.pool);
    const person = await subscriber(`day-cap-${randomUUID()}`, 12 * DAY);
    // 99,000 today: under the 121,000 the month started with, over the 60,500 of the upload.
    await charge(store, person.runId, 99_000);
    const tomorrow = new Date(now.getTime() + DAY);
    const borrowedTomorrow = async (kept: boolean) => {
      const allowance = apiAllowance(kept);
      const windows = await allowance.read(person.ownerRef, tomorrow);
      const borrow = await readWindowBorrow({ ownerRef: person.ownerRef, window: windows[0]!, month: windows[2]!, spend: store, allowance });
      return [limitOf(windows, "PERSON_DAY"), borrow.borrowedMicros];
    };
    // Today's plans alone: the cap is 60,500 and tomorrow starts 38,500 lower.
    expect(await borrowedTomorrow(false)).toEqual([60_500, 38_500]);
    expect(await borrowedTomorrow(true)).toEqual([121_000, 0]);
  });

  it("someone whose month starts after the upload has the new cap", async () => {
    const person = await subscriber(`day-cap-new-${randomUUID()}`, HOUR / 2);
    expect(limitOf(await apiAllowance(true).read(person.ownerRef, now), "PERSON_DAY")).toBe(60_500);
  });
});

describe("effect 2: a lower month credit does not pause a debate in a month already started (the runner's wall)", () => {
  const PRICE = Object.freeze({ inputMicrosPerMillionTokens: 1_000_000, outputMicrosPerMillionTokens: 1_000_000 });
  const PROJECTION = Object.freeze({ requestBytes: 800, completionTokenCeiling: 64 });

  it("a person past the new credit, inside the one their month started with, keeps running", async () => {
    const store = new PostgresModelSpendStore(database.pool);
    const person = await subscriber(`month-credit-${randomUUID()}`, 12 * DAY);
    // 660,000 used: past the 550,000 of the upload, inside the 1,100,000 the month started with.
    await charge(store, person.runId, 660_000);
    // The runner's own composition: the read-only entitlement port (the view), never the API's lazy Free write.
    const decide = (kept: boolean) => new CostEnvelopeGuard({
      store,
      policy: { perRunCeilingMicros: 5_000_000, dailyCeilingMicros: 1_000_000_000 },
      sharedWall: {
        finishBasisPoints: 11_500, owners: store,
        persons: new BillingPersonAllowanceSource({
          entitlements: new EntitlementRepository(database.pool).readOnlyPort(), plans: own, closeBasisPoints: 9_500,
          ...(kept ? { plansInForce } : {})
        })
      }
    }).providerSeam({ runId: person.runId, price: PRICE, requireReportedUsage: true, phase: "BODY" }).assertCallAllowed(PROJECTION).then(
      () => "ADMITTED",
      (error: unknown) => isMonthWallReached(error) ? "MONTH_WALL" : error instanceof TypedDomainError ? error.code : "UNTYPED"
    );
    expect(await decide(false)).toBe("MONTH_WALL");
    expect(await decide(true)).toBe("ADMITTED");
  });
});

describe("effect 3: a refund is measured against the credit bought (a real withdrawal)", () => {
  it("someone who used a quarter of the credit they bought gets three quarters of the price back, not half", async () => {
    // Subscribed three days ago, when PLUS had 1,100,000. 275,000 used: a quarter of that, half of today's 550,000.
    const withdrawal = async (label: string, kept: boolean) => {
      const identity = testHttpIdentity(label);
      const seeded = await seedNetopiaSubscription(database.pool, {
        ownerRef: identity.authenticated.ownerRef, planId: "PLUS", activatedAt: new Date(now.getTime() - 3 * DAY), taxCountry: "RO"
      });
      const billing = new BillingRepository(database.pool);
      const paidMicros = (await billing.chargesForSubscription(seeded.subscriptionId)).reduce((total, row) => total + row.totalMicros, 0);
      const outcome = await withdraw(subscriptionDeps(database.pool, {
        billing, plans: own, clock: () => now, ...(kept ? { plansInForce } : {}),
        ownerSpend: { readWithdrawalSpend: async () => ({ spentMicros: 275_000, liveRuns: 0 }) }
      }), { authenticated: identity.authenticated });
      return [outcome.refundMicros, paidMicros];
    };
    const [halfBack, paid] = await withdrawal("plans-in-force-now", false);
    expect(halfBack).toBe(paid! / 2);
    const [threeQuartersBack, paidToo] = await withdrawal("plans-in-force-kept", true);
    expect(threeQuartersBack).toBe(paidToo! * 3 / 4);
  });
});
