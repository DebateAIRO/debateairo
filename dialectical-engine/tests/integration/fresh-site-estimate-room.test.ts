/**
 * Fresh-site estimate (owner rulings 2026-10-22), on a real (embedded) PostgreSQL.
 *
 * On a fresh hosted site no debate has settled, so before the costEstimateStartPolicy row every estimate was the run's
 * maximum ($3.66 on the preview: per-run $3.00 × 1.2 plus story $0.05 × 1.2). A Plus person's day allowance is $1.00,
 * so every room read said CLOSE and every premium ask was swapped to the Free AIs. This test publishes a HOSTED
 * register (the same builder the hosted publish and the preview kit v3 use), reads the row back at that version, and
 * asks the room and the coarse fit for a Plus depth-1 premium ask on the fresh database: FITS and AS_ASKED. The control
 * is the historical version without the row: CLOSE and FREE_ROSTER, exactly as before.
 */
import { randomBytes, randomUUID } from "node:crypto";
import type { PoolClient } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { BillingPersonAllowanceSource } from "@debateai/billing-core";
import {
  PostgresModelSpendStore,
  PostgresRecentRunUsageSource,
  RecentRunsCostEstimator,
  costEnvelopeGuardPolicy,
  mostOneRunMaySpendMicros,
  type RunSettingsClass
} from "@debateai/budget";
import { PLAN_TIER_ROSTERS, type AskRequest } from "@debateai/contract";
import { EntitlementRepository, RunWaitRepository, migrate } from "@debateai/db";
import {
  BILLING_PLANS_DEPLOYMENT_REGISTER_ROW,
  billingPlansFromValue,
  costEnvelopeBand,
  readCostEnvelopePolicy,
  readCostEstimateStartPolicy,
  readStoryPolicyFromRegister,
  registerVersionToSafeLegacyNumber,
  type CostEstimateStartPolicy
} from "@debateai/register";
import { AskRoom } from "../../apps/api/src/ask-room.js";
import { coarseFitFor, type AskBilling } from "../../apps/api/src/ask-billing.js";
import { buildApiProviderPriceMap } from "../../apps/api/src/provider-discovery.js";
import {
  HOSTED_REGISTER_FILE_FORMAT,
  createPostgresHostedRegisterOperations,
  parseHostedRegisterFile,
  planHostedRegisterPublication,
  publishHostedRegister
} from "../../apps/runner/src/hosted-register-publish.js";
import { parseProviderDiscoveryTargets } from "../../packages/providers/src/index.js";
import { startTestDatabase, type TestDatabase } from "../support/testDatabase.js";

let database: TestDatabase;
let registerVersion: number;
let owner: string;
let now: Date;

const VETTING = Object.freeze({ dataUseTermsReviewedOn: "2026-10-22", retentionTermsReviewedOn: "2026-10-22", namedInPrivacyNotice: true });
const PROVIDERS = [
  { providerRef: "vendor:alpha", adapterKind: "openai-compatible-http", maker: "Alpha", vetting: VETTING },
  { providerRef: "vendor:beta", adapterKind: "openai-compatible-http", maker: "Beta", vetting: VETTING }
];
const TARGETS = [
  { provider_ref: "vendor:alpha", base_url: "https://api.alpha-vendor-fixture.com/v1", model: "alpha-large",
    authorization_file: "/etc/debateai/runner/providers/alpha.header",
    input_price_micros_per_million: 3_000_000, output_price_micros_per_million: 15_000_000 },
  { provider_ref: "vendor:beta", base_url: "https://api.beta-vendor-fixture.com/v1", model: "beta-large",
    authorization_file: "/etc/debateai/runner/providers/beta.header",
    input_price_micros_per_million: 1_000_000, output_price_micros_per_million: 4_000_000 }
];
/** The preview's ceilings: $3.00 per debate, $10.00 per day. */
const HOSTED_FILE = Object.freeze({
  format: HOSTED_REGISTER_FILE_FORMAT,
  sourceRef: "fresh-site estimate integration: a hosted register with the preview's ceilings",
  configuredProviderSet: { requiredDistinctMakers: 2, providers: PROVIDERS },
  costEnvelopePolicy: {
    kind: "COST_ENVELOPE_POLICY", currency: "USD", minor_units_per_unit: 1_000_000,
    per_run_ceiling_micros: 3_000_000, daily_ceiling_micros: 10_000_000,
    provisional: true, provisional_reason: "the preview's sandbox ceilings",
    // The answer's 20 % overrun, as the code-owned row (and so the preview's) carries it: one run may spend $3.60.
    serve_reserve_basis_points: 3_000, serve_overrun_basis_points: 2_000
  },
  providerTargets: TARGETS
});
const PLANS = billingPlansFromValue(BILLING_PLANS_DEPLOYMENT_REGISTER_ROW.value, BILLING_PLANS_DEPLOYMENT_REGISTER_ROW.sourceRef);
const BAND = costEnvelopeBand({ closeBasisPoints: 9_500, finishBasisPoints: 11_500, waitingLinePerPerson: 1 })!;

const ask = (): AskRequest => ({
  question_line: "Should a city with a fresh budget make its buses free?",
  risk_tier: "casual",
  tier_source: "ASKER",
  tier_provenance_ref: "asker-declaration:fresh-site-estimate",
  composition_budget_tier: "low",
  depth_params: { depth: 1 },
  decision_scope: "fresh-site estimate",
  as_of: now.toISOString(),
  steering_presets: [],
  plan_tier: "premium",
  steering_annotations: []
});
const PREMIUM_DEPTH_ONE: RunSettingsClass = Object.freeze({
  planTier: "premium", compositionBudgetTier: "low", makerCount: PLAN_TIER_ROSTERS.premium.length, depth: 1
});

async function inTransaction<T>(use: (client: PoolClient) => Promise<T>): Promise<T> {
  const client = await database.pool.connect();
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

/** The API's ask-room composition (main.ts), at a register version: the room and the coarse fit share one estimator. */
async function composeAt(version: number, start: CostEstimateStartPolicy | null) {
  const runPolicy = await readCostEnvelopePolicy(database.pool, version);
  const guardPolicy = costEnvelopeGuardPolicy(runPolicy, await readStoryPolicyFromRegister(database.pool, version));
  const maximumMicros = mostOneRunMaySpendMicros(guardPolicy);
  const declared = parseProviderDiscoveryTargets(JSON.stringify(TARGETS), PROVIDERS.map(({ vetting: _vetting, ...provider }) => provider) as never);
  const estimator = new RecentRunsCostEstimator({
    source: new PostgresRecentRunUsageSource(database.pool),
    prices: buildApiProviderPriceMap(declared, "hosted"),
    maximumMicros,
    start,
    clock: () => now
  });
  const spend = new PostgresModelSpendStore(database.pool);
  const entitlements = new EntitlementRepository(database.pool);
  const personAllowance = new BillingPersonAllowanceSource({ entitlements, plans: PLANS, closeBasisPoints: BAND.closeBasisPoints });
  const room = new AskRoom({
    lockPool: database.pool,
    spend,
    line: new RunWaitRepository(database.pool),
    estimator,
    personAllowance,
    entitlements,
    billingPlans: PLANS,
    dailyCeilingMicros: runPolicy.dailyCeilingMicros,
    closeBasisPoints: BAND.closeBasisPoints,
    waitingLinePerPerson: BAND.waitingLinePerPerson,
    clock: () => now
  });
  const billing = Object.freeze({
    plans: PLANS, entitlements, coarseFit: Object.freeze({ personAllowance, spend, estimator }), clock: () => now
  }) as AskBilling;
  return { room, billing, estimator, maximumMicros };
}

beforeAll(async () => {
  database = await startTestDatabase();
  await migrate(database.pool);
  const plan = await planHostedRegisterPublication(parseHostedRegisterFile(Buffer.from(JSON.stringify(HOSTED_FILE), "utf8")));
  const published = await publishHostedRegister({ plan, operations: createPostgresHostedRegisterOperations(database.pool) });
  registerVersion = registerVersionToSafeLegacyNumber(published.registerVersion);
  // A PLUS person on a fresh site: nothing spent, no debate settled anywhere.
  owner = randomUUID();
  await database.pool.query(
    `INSERT INTO identity."user" (
       user_id,email_blind_index,email_ciphertext,recovery_email_ciphertext,
       phone_ciphertext,password_hash,pseudonym,audit_token,owner_ref,state,
       adult_affirmed_at,created_at
     ) VALUES ($1,$2,'{}'::jsonb,'{}'::jsonb,NULL,'test-password-hash',$3,$4,$5,'active',now(),now())`,
    [randomUUID(), randomBytes(32), `fresh-site-${randomUUID()}`, randomUUID(), owner]
  );
  const anchor = new Date(Date.now() + 1_000);
  now = new Date(anchor.getTime() + 60_000);
  const entitlements = new EntitlementRepository(database.pool);
  await inTransaction((client) => entitlements.append(client, {
    ownerRef: owner, planId: "PLUS", periodAnchorAt: anchor, cause: "SUBSCRIBED", effectiveAt: anchor,
    subscriptionId: randomUUID(), paidThrough: new Date(now.getTime() + 30 * 86_400_000)
  }));
}, 240_000);

afterAll(async () => {
  await database?.stop();
});

describe("fresh-site estimate: a hosted register seals the starting figures, and a Plus depth-1 ask fits", () => {
  it("the hosted publication carries the row with the owner's values; the historical version has none", async () => {
    const start = await readCostEstimateStartPolicy(database.pool, registerVersion);
    expect(start).not.toBeNull();
    expect(start!.minSamples).toBe(5);
    expect([...start!.startMicrosByDepth]).toEqual([[1, 300_000], [2, 600_000], [3, 1_000_000]]);
    await expect(readCostEstimateStartPolicy(database.pool, 1)).resolves.toBeNull();
  });

  it("on the fresh database the room reads FITS and the coarse fit keeps the premium AIs (AS_ASKED)", async () => {
    const { room, billing, estimator, maximumMicros } = await composeAt(
      registerVersion, await readCostEstimateStartPolicy(database.pool, registerVersion)
    );
    expect(maximumMicros).toBe(3_660_000);
    await expect(estimator.estimateMicros(PREMIUM_DEPTH_ONE)).resolves.toBe(300_000);
    await expect(room.readRoom({ access: { ownerRef: owner, legacyAskerId: null }, settingsClass: PREMIUM_DEPTH_ONE }))
      .resolves.toMatchObject({ room: "FITS", scope: null, planId: "PLUS" });
    await expect(coarseFitFor(ask(), owner, billing, now)).resolves.toBe("AS_ASKED");
  });

  it("control: a version without the row answers as before — the maximum, CLOSE on the person's windows, and the swap", async () => {
    const { room, billing, estimator } = await composeAt(registerVersion, null);
    await expect(estimator.estimateMicros(PREMIUM_DEPTH_ONE)).resolves.toBe(3_660_000);
    await expect(room.readRoom({ access: { ownerRef: owner, legacyAskerId: null }, settingsClass: PREMIUM_DEPTH_ONE }))
      // $3.66 is over both the day ($1.00) and the week ($2.50); the room names the week (its scope precedence).
      .resolves.toMatchObject({ room: "CLOSE", scope: "PERSON_WEEK", planId: "PLUS" });
    await expect(coarseFitFor(ask(), owner, billing, now)).resolves.toBe("FREE_ROSTER");
  });
});
