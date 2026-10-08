import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { randomUUID, randomBytes } from "node:crypto";
import { createInitialBatteryRows } from "@debateai/battery";
import { BillingPersonAllowanceSource } from "@debateai/billing-core";
import {
  CostEnvelopeGuard,
  PostgresModelSpendStore,
  costEnvelopeDay,
  type PersonAllowanceSource
} from "@debateai/budget";
import { EntitlementRepository, RunRepository, migrate } from "@debateai/db";
import { TypedDomainError } from "@debateai/kernel";
import { BILLING_PLANS_DEPLOYMENT_REGISTER_ROW, billingPlansFromValue } from "@debateai/register";
import { fixtureDiscoveredPanel, fixtureStructuralCeiling } from "../support/discoveredPanel.js";
import { startTestDatabase, type TestDatabase } from "../support/testDatabase.js";

/**
 * B9a over the real ledger: the owner the wall reads is the one billing pinned on the run at admission
 * (`billing.run_charge_scope`, 0084), and the owner's spend is B6a's RUN + STORY sum over that table. The last
 * case builds the windows exactly as the shipped runner does (B9b): `BillingPersonAllowanceSource` over
 * `EntitlementRepository.readOnlyPort()`, which reads `billing.person_windows_v` and never writes (A20, R-12).
 */

let database: TestDatabase;
const batteryRows = createInitialBatteryRows({ settlementWatchHandle: "settlement-watch:b9a" });
const PRICE = Object.freeze({ inputMicrosPerMillionTokens: 1_000_000, outputMicrosPerMillionTokens: 1_000_000 });
const PROJECTION = Object.freeze({ requestBytes: 800, completionTokenCeiling: 64 });
const PROJECTED = 464;

beforeAll(async () => {
  database = await startTestDatabase();
  await migrate(database.pool);
});

afterAll(async () => {
  await database?.stop();
});

async function createRun(label: string): Promise<string> {
  return new RunRepository(database.pool).startRun({
    questionLine: label, principal: { kind: "legacy", legacyAskerId: `asker:${label}` },
    sessionId: `session:${label}`, callerScope: "ASKER",
    asOf: new Date("2026-09-29T00:00:00.000Z"), askerRiskTier: "casual", effectiveRiskTier: "casual",
    tierSource: "ASKER", tierProvenanceRef: `asker-declaration:${label}`, compositionBudgetTier: "low",
    depthParams: { depth: 1 }, discoveredPanel: fixtureDiscoveredPanel(1), strangerSampleRate: 1,
    envelopeBasis: fixtureStructuralCeiling(10, 1, 1),
    registerVersion: 1, batteryVersion: "s00", batteryRows
  });
}

/**
 * What B6 does at admission with billing on: the owner's entitlement event, then the run's charge scope, in one
 * transaction. A Free sign-up carries no month override (A6) and no paid-through instant (A8).
 */
async function pinOwner(runId: string, ownerRef: string): Promise<void> {
  const entitlements = new EntitlementRepository(database.pool);
  const client = await database.pool.connect();
  try {
    await client.query("BEGIN");
    // Financial account guards require a real active mapping, including synthetic ledger fixtures.
    await client.query(`INSERT INTO identity."user"(user_id,owner_ref,email_blind_index,email_ciphertext,recovery_email_ciphertext,password_hash,pseudonym,state,adult_affirmed_at)
      VALUES($1,$2,$3,'{}','{}','fixture-password',$4,'active',clock_timestamp()) ON CONFLICT(owner_ref) DO NOTHING`,
      [randomUUID(),ownerRef,randomBytes(32),`b9a:${randomUUID()}`]);
    const anchor = new Date("2026-09-01T00:00:00.000Z");
    const entitlementEventId = await entitlements.append(client, {
      ownerRef, planId: "FREE", periodAnchorAt: anchor, cause: "SIGNED_UP_FREE",
      effectiveAt: anchor, subscriptionId: null, monthCreditOverrideMicros: null, paidThrough: null
    });
    await entitlements.recordRunChargeScope(client, {
      runId, ownerRef, planId: "FREE", entitlementEventId, admittedAt: new Date()
    });
    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK").catch(() => undefined);
    throw error;
  } finally {
    client.release();
  }
}

/** One recorded charge on the real ledger (RUN charges are arguing ones). */
async function charge(
  store: PostgresModelSpendStore, run: string, spendSource: "RUN" | "STORY", chargeMicros: number
): Promise<void> {
  await store.recordSpend({
    spendId: randomUUID(), spendSource, runId: run, providerRef: "provider:b9a",
    chargedOn: costEnvelopeDay(new Date()), chargeMicros, inputTokens: 1, outputTokens: 1,
    ...(spendSource === "RUN" ? { spendPhase: "BODY" as const } : {})
  });
}

/** One walled call while arguing: the code it is refused with, or ADMITTED. */
async function decide(guard: CostEnvelopeGuard, runId: string): Promise<string> {
  return guard.providerSeam({
    runId, price: PRICE, requireReportedUsage: true, phase: "BODY"
  }).assertCallAllowed(PROJECTION).then(
    () => "ADMITTED",
    (error: unknown) => (error instanceof TypedDomainError ? error.code : "UNTYPED")
  );
}

async function entitlementEventsOf(ownerRef: string): Promise<number> {
  const counted = await database.pool.query<{ events: number }>(
    "SELECT count(*)::int AS events FROM billing.entitlement_event WHERE owner_ref = $1::uuid",
    [ownerRef]
  );
  return counted.rows[0]?.events ?? 0;
}

describe("B9a · the run's owner, as billing pinned it", () => {
  it("reads the pinned owner, and null for a run billing never admitted", async () => {
    const store = new PostgresModelSpendStore(database.pool);
    const pinned = await createRun(`b9a-pinned-${randomUUID()}`);
    const unpinned = await createRun(`b9a-unpinned-${randomUUID()}`);
    const ownerRef = randomUUID();
    await pinOwner(pinned, ownerRef);
    await expect(store.readRunChargeOwnerRef(pinned)).resolves.toBe(ownerRef);
    await expect(store.readRunChargeOwnerRef(unpinned)).resolves.toBeNull();
  });
});

describe("B9a · the person's wall over the real ledger", () => {
  it("walls the owner's window at 110% of it, counting RUN and STORY spend and nobody else's", async () => {
    const store = new PostgresModelSpendStore(database.pool);
    const ownerRef = randomUUID();
    const runId = await createRun(`b9a-wall-${randomUUID()}`);
    const otherRun = await createRun(`b9a-other-${randomUUID()}`);
    await pinOwner(runId, ownerRef);
    await pinOwner(otherRun, randomUUID());
    const now = new Date();
    const window = Object.freeze({
      scope: "PERSON_MONTH" as const,
      limitMicros: 100_000,
      periodStart: new Date(now.getTime() - 3_600_000),
      resetsAt: new Date(now.getTime() + 82_800_000),
      finishBasisPoints: 11_000,
      closeBasisPoints: 9_500
    });
    const persons: PersonAllowanceSource = { read: async () => [window] };
    const guard = new CostEnvelopeGuard({
      store,
      // The site's day is far away, so only the person's window can speak.
      policy: { perRunCeilingMicros: 250_000, dailyCeilingMicros: 1_000_000_000 },
      sharedWall: { finishBasisPoints: 11_500, persons, owners: store }
    });

    // 110 000 is floor(100 000 x 110%). Another owner's run spending plenty does not count.
    await charge(store, otherRun, "RUN", 5_000_000);
    await charge(store, runId, "RUN", 110_000 - PROJECTED);
    expect(await decide(guard, runId)).toBe("ADMITTED");
    // One micro-unit of STORY spend is the owner's too.
    await charge(store, runId, "STORY", 1);
    expect(await decide(guard, runId)).toBe("PERSON_ALLOWANCE_REACHED");
  });

  it("walls a Free owner's month read the runner's way (person_windows_v, read-only), and writes nothing", async () => {
    const store = new PostgresModelSpendStore(database.pool);
    const ownerRef = randomUUID();
    const runId = await createRun(`b9a-free-month-${randomUUID()}`);
    await pinOwner(runId, ownerRef);
    const persons = new BillingPersonAllowanceSource({
      entitlements: new EntitlementRepository(database.pool).readOnlyPort(),
      plans: billingPlansFromValue(BILLING_PLANS_DEPLOYMENT_REGISTER_ROW.value, BILLING_PLANS_DEPLOYMENT_REGISTER_ROW.sourceRef),
      closeBasisPoints: 9_500
    });
    // Free has one window, the month, with the plan's finish edge.
    const windows = await persons.read(ownerRef, new Date());
    expect(windows.map((entry) => entry.scope)).toEqual(["PERSON_MONTH"]);
    const month = windows[0]!;
    const edge = Math.floor((month.limitMicros * month.finishBasisPoints) / 10_000);
    const guard = new CostEnvelopeGuard({
      store,
      policy: { perRunCeilingMicros: 250_000, dailyCeilingMicros: 1_000_000_000 },
      sharedWall: { finishBasisPoints: 11_500, persons, owners: store }
    });

    await charge(store, runId, "RUN", edge - PROJECTED);
    expect(await decide(guard, runId)).toBe("ADMITTED");
    await charge(store, runId, "RUN", 1);
    expect(await decide(guard, runId)).toBe("PERSON_ALLOWANCE_REACHED");
    // The runner's read appended nothing: the owner still has the one event admission wrote.
    expect(await entitlementEventsOf(ownerRef)).toBe(1);
    // An owner with no event reads no windows, and the read-only port does not lazily create one (R-12).
    const stranger = randomUUID();
    await expect(persons.read(stranger, new Date())).resolves.toEqual([]);
    expect(await entitlementEventsOf(stranger)).toBe(0);
  });
});
