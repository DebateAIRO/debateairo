// tests/integration/ask-room-swap-self-lock.test.ts
import { randomUUID } from "node:crypto";
import pg from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { PostgresAskApplication, type RunCreationSettings } from "@debateai/api";
import { BillingPersonAllowanceSource } from "@debateai/billing-core";
import {
  PostgresModelSpendStore,
  PostgresRecentRunUsageSource,
  RecentRunsCostEstimator,
  mostOneRunMaySpendMicros,
  type ProviderTargetPrice
} from "@debateai/budget";
import { PLAN_TIER_ROSTERS, type AskRequest } from "@debateai/contract";
import { EntitlementRepository, RunWaitRepository, migrate } from "@debateai/db";
import { BILLING_PLANS_DEPLOYMENT_REGISTER_ROW, billingPlansFromValue, costEnvelopeBand } from "@debateai/register";
import { AskRoom } from "../../apps/api/src/ask-room.js";
import type { AskBilling } from "../../apps/api/src/ask-billing.js";
import { fixtureDiscoveredPanel, fixtureStructuralCeiling } from "../support/discoveredPanel.js";
import { testHttpIdentity } from "../support/httpSession.js";
import { provisionStoryEncryptedOwner, releaseStoryEncryptedOwner, type StoryEncryptedOwner } from "../support/storyEncryptedOwner.js";
import { createTestAskAdmissionPoolFacades, startTestDatabase, type TestDatabase } from "../support/testDatabase.js";
import { TEST_RELEASE_KEY } from "../support/releaseKey.js";

/**
 * Preview incident 2026-10-22 (docs/operations/preview-release-r20/ASK-SELF-LOCK-DIAGNOSIS.md, outside the repo):
 * a hosted ask with billing on, the room, an encrypted owner and the interim coarse fit's swap to the Free roster.
 * The swap's owner record was written on the room decision's transaction (FOR KEY SHARE on the new core.run row,
 * through core.run_cost_substitution's foreign key) BEFORE the memory question, whose own transaction on another
 * connection locks the same row FOR UPDATE (core.lock_owned_live_runs). The request waited for itself until
 * statement_timeout cancelled it, and the debate was recorded FAILED (RUN_SETUP_FAILED:MEMORY_QUESTION).
 * The application's pool here carries a short statement_timeout, as the preview's runtime login carries 30 s, so the
 * old order fails in seconds instead of hanging.
 */
const STATEMENT_TIMEOUT_MS = 8_000;
let database: TestDatabase;
let appPool: pg.Pool;
let owner: StoryEncryptedOwner;
/** The app's clock: set once the owner's account exists, a minute after its plan began. */
let now = new Date();

const PRICE: ProviderTargetPrice = Object.freeze({ inputMicrosPerMillionTokens: 100_000, outputMicrosPerMillionTokens: 100_000 });
const PRICES: ReadonlyMap<string, ProviderTargetPrice> = new Map([["provider:test-layer", PRICE]]);
const BAND = costEnvelopeBand({ closeBasisPoints: 9_500, finishBasisPoints: 11_500, waitingLinePerPerson: 1 })!;
const GUARD_POLICY = Object.freeze({
  perRunCeilingMicros: 20_000,
  dailyCeilingMicros: 1_000_000,
  serveReserveBasisPoints: 3_000,
  serveOverrunBasisPoints: 2_000
});
/** With no settled debate to learn from, every estimate is one debate's maximum (B2). */
const RUN_MAXIMUM = mostOneRunMaySpendMicros(GUARD_POLICY);
const PLANS = billingPlansFromValue(BILLING_PLANS_DEPLOYMENT_REGISTER_ROW.value, BILLING_PLANS_DEPLOYMENT_REGISTER_ROW.sourceRef);
const PANEL = fixtureDiscoveredPanel(2).map((member, index) => Object.freeze({
  ...member, model_id: PLAN_TIER_ROSTERS.free[index]!
}));

const ask = (): AskRequest => ({
  question_line: "Should cities make public transport free at the point of use?",
  risk_tier: "casual",
  tier_source: "ASKER",
  tier_provenance_ref: "asker-declaration:ask-room-swap-self-lock",
  composition_budget_tier: "low",
  depth_params: { depth: 1 },
  decision_scope: "ask room swap self-lock",
  as_of: now.toISOString(),
  steering_presets: [],
  plan_tier: "premium",
  steering_annotations: []
});

function application(dispatched: string[]): PostgresAskApplication {
  const spend = new PostgresModelSpendStore(appPool);
  const estimator = new RecentRunsCostEstimator({
    source: new PostgresRecentRunUsageSource(appPool), prices: PRICES, maximumMicros: RUN_MAXIMUM, clock: () => now
  });
  const entitlements = new EntitlementRepository(appPool);
  const personAllowance = new BillingPersonAllowanceSource({ entitlements, plans: PLANS, closeBasisPoints: BAND.closeBasisPoints });
  const room = new AskRoom({
    lockPool: appPool,
    spend,
    line: new RunWaitRepository(appPool),
    estimator,
    personAllowance,
    entitlements,
    billingPlans: PLANS,
    dailyCeilingMicros: GUARD_POLICY.dailyCeilingMicros,
    closeBasisPoints: BAND.closeBasisPoints,
    waitingLinePerPerson: BAND.waitingLinePerPerson,
    clock: () => now
  });
  // The coarse fit's own read of the person's room: one window that is not full, but has less left than a premium
  // debate's estimate, so the premium ask runs on the Free roster when it STARTs (decideCoarseFit: FREE_ROSTER).
  // The room's locked decision reads the plan's real windows, which hold the debate (START).
  const coarseAllowance = Object.freeze({
    read: async (ownerRef: string, at: Date) => (await personAllowance.read(ownerRef, at))
      .slice(0, 1).map((window) => Object.freeze({ ...window, limitMicros: RUN_MAXIMUM - 1 }))
  });
  const billing: AskBilling = Object.freeze({
    plans: PLANS,
    entitlements,
    coarseFit: Object.freeze({ personAllowance: coarseAllowance, spend, estimator }),
    clock: () => now
  }) as AskBilling;
  const settings: RunCreationSettings = {
    strangerSampleRate: 0,
    registerVersion: 1,
    releaseKey: TEST_RELEASE_KEY,
    batteryVersion: "ask-room-swap-self-lock",
    settlementWatchHandle: "settlement-watch:ask-room-swap-self-lock",
    resolveDiscoveredPanel: async () => PANEL,
    resolveEnvelopeBasis: async ({ depthParams, panelSize }) => fixtureStructuralCeiling(100, panelSize, Number(depthParams.depth)),
    resolveRisk: (effectiveRiskTier, tierSource, tierProvenanceRef) => ({
      effectiveRiskTier, tierSource: tierSource as "ASKER" | "MACHINE_DEFAULT" | "DEPLOYMENT_POLICY", tierProvenanceRef
    }),
    room,
    waitingLine: room,
    billing
  };
  return new PostgresAskApplication(
    appPool, { dispatch: async ({ runId }) => { dispatched.push(runId); } }, settings, undefined, appPool,
    createTestAskAdmissionPoolFacades(appPool)
  );
}

beforeAll(async () => {
  database = await startTestDatabase();
  await migrate(database.pool);
  appPool = new pg.Pool({ connectionString: database.connectionString, options: `-c statement_timeout=${String(STATEMENT_TIMEOUT_MS)}` });
  owner = await provisionStoryEncryptedOwner(appPool);
  // The owner is on a premium plan (PLUS), so the server keeps the premium ask and the coarse fit may swap it.
  const entitlements = new EntitlementRepository(appPool);
  const periodAnchorAt = new Date(Date.now() + 1_000);
  now = new Date(periodAnchorAt.getTime() + 60_000);
  await entitlements.current(owner.ownerRef, periodAnchorAt);
  const client = await appPool.connect();
  try {
    await entitlements.append(client, {
      ownerRef: owner.ownerRef, planId: "PLUS", periodAnchorAt, cause: "SUBSCRIBED", effectiveAt: periodAnchorAt,
      subscriptionId: randomUUID(), monthCreditOverrideMicros: null,
      paidThrough: new Date(now.getTime() + 30 * 86_400_000)
    });
  } finally {
    client.release();
  }
}, 600_000);

afterAll(async () => {
  if (owner !== undefined) await releaseStoryEncryptedOwner(owner);
  await appPool?.end();
  await database?.stop();
});

describe("preview incident 2026-10-22: a hosted premium ask swapped to the Free roster STARTs without waiting for itself", () => {
  it("queues the debate, records the swap with its hold, and the memory question is not blocked by the decision", async () => {
    const generated = testHttpIdentity("ask-room-swap-self-lock");
    const session = Object.freeze({
      ...generated.authenticated.session, asker_id: `owner:${owner.ownerRef}`, session_id: owner.sessionId
    });
    const dispatched: string[] = [];
    const startedAt = Date.now();
    const accepted = await application(dispatched).submit(ask(), session, {
      kind: "server", userId: owner.userId, ownerRef: owner.ownerRef
    }).catch((error: unknown) => error);
    const elapsedMs = Date.now() - startedAt;
    const runs = (await database.pool.query<{ run_id: string; plan_tier: string | null }>(
      "SELECT run_id::text AS run_id, plan_tier FROM core.run WHERE asker_id=$1", [`owner:${owner.ownerRef}`]
    )).rows;
    expect(runs).toHaveLength(1);
    const runId = runs[0]!.run_id;
    const failed = (await database.pool.query<{ terminal_reason: string | null }>(
      "SELECT terminal_reason FROM core.work_item WHERE run_id=$1 AND state='FAILED'", [runId]
    )).rows.map((row) => row.terminal_reason);
    // Before the fix: RUN_SETUP_FAILED:MEMORY_QUESTION after the statement timeout (canceling statement due to
    // statement timeout, while locking the new run's tuple in core.lock_owned_live_runs).
    expect(failed).toEqual([]);
    expect(accepted).toMatchObject({ run_ref: runId, status: "QUEUED", applied: { plan_tier: "premium" } });
    expect(elapsedMs).toBeLessThan(STATEMENT_TIMEOUT_MS);
    // The interim swap: the run is stored on the Free roster, and its owner record committed with its hold and job.
    expect(runs[0]!.plan_tier).toBe("free");
    expect((await database.pool.query(
      "SELECT call_site_key, planned_provider_ref, used_provider_ref, reason FROM core.run_cost_substitution WHERE run_id=$1",
      [runId]
    )).rows).toEqual([{
      call_site_key: "ASK:roster", planned_provider_ref: "roster:premium", used_provider_ref: "roster:free", reason: "PERSON"
    }]);
    expect((await database.pool.query("SELECT 1 FROM ledger.model_spend_hold WHERE run_id=$1", [runId])).rowCount).toBe(1);
    expect((await database.pool.query("SELECT state FROM core.work_item WHERE run_id=$1", [runId])).rows)
      .toEqual([{ state: "READY" }]);
    // The memory question committed for the new run (encrypted owner: the stored text is the sentinel).
    expect((await database.pool.query("SELECT 1 FROM memory.question_key WHERE run_id=$1", [runId])).rowCount).toBe(1);
    expect(dispatched).toEqual([runId]);
  }, 120_000);
});
