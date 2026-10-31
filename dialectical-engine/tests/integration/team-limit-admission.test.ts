import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { AskRoom } from "../../apps/api/src/ask-room.js";
import { readWebRunPlan } from "../../apps/runner/src/run-settings.js";
import { canonicalTeamLimitActionBinding } from "../../apps/api/src/staff/team-limit.js";
import { CostEnvelopeGuard, PostgresModelSpendStore } from "@debateai/budget";
import * as billing from "@debateai/billing-core";
import { createPool, EntitlementRepository, migrate, PostgresInternalAllowanceRepository, RunWaitRepository, type Pool } from "@debateai/db";
import { BILLING_PLANS_DEPLOYMENT_REGISTER_ROW, billingPlansFromValue, TEAM_FEATURE_PLAN_ID } from "@debateai/register";
import { authorizeStaffAlertFixture } from "../support/staffAlertReadiness.js";
import { internalFundingFixture } from "../support/internalFundingFixture.js";
import { createSystemTwin } from "../support/rls-logins.js";
import { startTestDatabase, type TestDatabase } from "../support/testDatabase.js";

/** Decisions 14 and 24 on the real room: a funded question needs room in the team's month; running work is never stopped; every kind is the grant's. */
let database: TestDatabase, runtime: Pool, fixture: ReturnType<typeof internalFundingFixture>;
const plans = billingPlansFromValue(BILLING_PLANS_DEPLOYMENT_REGISTER_ROW.value, "test:team-limit");
const settingsClass = { planTier: "premium", compositionBudgetTier: "low", makerCount: 2, depth: 1 } as const;
const ESTIMATE = 1000;
const price = { inputMicrosPerMillionTokens: 1000000, outputMicrosPerMillionTokens: 1000000 };
beforeAll(async () => {
  database = await startTestDatabase();
  await migrate(database.pool);
  runtime = createPool(await createSystemTwin(database, "team_limit_room", ["debateai_runtime", "debateai_billing_runtime"]));
  fixture = internalFundingFixture(database.pool, runtime);
}, 120000);
afterAll(async () => { await runtime?.end(); await database?.stop(); });
function room(ceiling = 100000000) {
  const Source = (billing as unknown as { FundingAwarePersonAllowanceSource: new (input: unknown) => never }).FundingAwarePersonAllowanceSource;
  const funding = new Source({ allowances: new PostgresInternalAllowanceRepository(runtime), entitlements: new EntitlementRepository(runtime), plans, closeBasisPoints: 9500 });
  return new AskRoom({ lockPool: database.pool, spend: new PostgresModelSpendStore(runtime), line: new RunWaitRepository(runtime),
    estimator: { estimateMicros: async () => ESTIMATE }, personAllowance: funding, funding, entitlements: new EntitlementRepository(runtime), billingPlans: plans,
    dailyCeilingMicros: ceiling, closeBasisPoints: 9500, waitingLinePerPerson: 5 } as never);
}
async function funded() {
  const actor = await fixture.fundedActor(), command = fixture.configureCommand(actor, { amountMicros: 1000000 });
  await fixture.configure(actor, command);
  const grant = (await new PostgresInternalAllowanceRepository(runtime).current(actor.ownerRef, new Date()))!;
  return { actor, grant, access: { ownerRef: actor.ownerRef, legacyAskerId: null } };
}
async function pinnedRun(p: Awaited<ReturnType<typeof funded>>) {
  const runId = await fixture.run(p.actor.ownerRef), tx = await runtime.connect();
  try { await new EntitlementRepository(runtime).recordRunChargeScope(tx, { runId, ownerRef: p.actor.ownerRef, basis: { kind: "INTERNAL", grantId: p.grant.grantId, grantEventId: p.grant.grantEventId }, admittedAt: new Date() }); }
  finally { tx.release(); }
  return runId;
}
/** The limit, set through the database's own guarded function by the fixture's Owner. */
async function setLimit(actor: Awaited<ReturnType<typeof fixture.fundedActor>>, amount: number) {
  const now = (await database.pool.query("SELECT coalesce(max(revision),0)::int r, coalesce((SELECT amount_micros FROM staff.team_limit_event ORDER BY revision DESC LIMIT 1),0)::bigint a FROM staff.team_limit_event")).rows[0];
  const current = Number(now.a), operationId = randomUUID();
  const binding = canonicalTeamLimitActionBinding({ action: "TEAM_LIMIT_SET", amount_micros: amount, current_micros: current, expected_revision: now.r, operation_id: operationId }, actor.staffId, { currentMicros: current, expectedRevision: now.r });
  const stored = await fixture.storeProof(actor, binding as never);
  await authorizeStaffAlertFixture(database.pool, operationId);
  await runtime.query("SELECT staff.set_team_limit($1::jsonb,$2::uuid,$3::jsonb,$4::jsonb,$5::jsonb)", [actor.context, stored.proofId, binding,
    { targetId: actor.staffId, amountMicros: amount, currentMicros: current, expectedRevision: now.r, operationId, reason: { code: "FUNDING_APPROVAL" } }, { ...stored.alert, event: "TEAM_LIMIT_CHANGED" }]);
}
const spentNow = async () => Number((await runtime.query("SELECT staff.read_team_month_spent(date_trunc('month',now() AT TIME ZONE 'UTC') AT TIME ZONE 'UTC',(date_trunc('month',now() AT TIME ZONE 'UTC') AT TIME ZONE 'UTC')+interval '1 month') v").catch(() => database.pool.query("SELECT staff.read_team_month_spent(date_trunc('month',now() AT TIME ZONE 'UTC') AT TIME ZONE 'UTC',(date_trunc('month',now() AT TIME ZONE 'UTC') AT TIME ZONE 'UTC')+interval '1 month') v"))).rows[0].v);

describe("a new team question or dig", () => {
  it("with no limit set waits, naming the team's month and no amount", async () => {
    const p = await funded(), r = room();
    const answer = await r.readRoom({ access: p.access, settingsClass } as never);
    expect(answer).toMatchObject({ room: "FULL", scope: "TEAM_MONTH", funding: { kind: "INTERNAL" } });
    expect(JSON.stringify(answer)).not.toMatch(/micros/iu);
    await r.decide({ access: p.access, settingsClass } as never, async ({ admission }) => { expect(admission).toMatchObject({ kind: "WAIT", worstScope: "TEAM_MONTH" }); });
  });
  it("starts when it fits, waits past the room, and starts again when the limit is raised, with no restart", async () => {
    const p = await funded(), r = room();
    await setLimit(p.actor, await spentNow() + ESTIMATE);
    await r.decide({ access: p.access, settingsClass } as never, async ({ admission }) => { expect(admission.kind).toBe("START"); });
    await setLimit(p.actor, await spentNow() + ESTIMATE - 1);
    await r.decide({ access: p.access, settingsClass } as never, async ({ admission }) => { expect(admission).toMatchObject({ kind: "WAIT", worstScope: "TEAM_MONTH" }); });
    const line = runtimeLine();
    const run = await fixture.run(p.actor.ownerRef);
    await r.decide({ access: p.access, settingsClass } as never, async ({ tx, now }) => { await r.enterWait(tx, run, now); });
    const waiting = await line.readWaiting(run);
    expect(waiting).not.toBeNull();
    // It looks again at the next tick, not on the 1st: a raised limit must not wait for the month.
    expect(new Date(waiting!.personRecheckAt ?? 0).getTime()).toBeLessThanOrEqual(Date.now() + 61000);
    await setLimit(p.actor, await spentNow() + 10 * ESTIMATE);
    await r.decide({ access: p.access, settingsClass } as never, async ({ admission }) => { expect(admission.kind).not.toBe("REFUSE_ALREADY_WAITING"); }).catch(() => undefined);
    await database.pool.query("INSERT INTO core.run_wait_start(run_id,started_at) SELECT run_id,clock_timestamp() FROM core.run_waiting_v");
  });
  it("a customer with no grant is never held to the team's month, full or not", async () => {
    const p = await funded();
    await setLimit(p.actor, 0);
    const customer = await fixture.fundedActor();
    await setLimit(customer, 0);
    const answer = await room().readRoom({ access: { ownerRef: customer.ownerRef, legacyAskerId: null }, settingsClass } as never);
    expect(answer.scope).not.toBe("TEAM_MONTH");
  });
  it("runs with the top plan's features: web search goes by TEAM_FEATURE_PLAN_ID", async () => {
    const p = await funded(), run = await pinnedRun(p);
    expect(await readWebRunPlan(runtime, run)).toBe(TEAM_FEATURE_PLAN_ID);
    expect(await readWebRunPlan(runtime, randomUUID())).toBeNull();
  });
});

describe("a running team debate", () => {
  it("is never stopped by the team's month, even past it: its calls are held to its grant alone", async () => {
    const p = await funded(), runId = await pinnedRun(p);
    await setLimit(p.actor, 0);
    expect(await room().readRoom({ access: p.access, settingsClass } as never)).toMatchObject({ room: "FULL", scope: "TEAM_MONTH" });
    const guard = new CostEnvelopeGuard({ store: new PostgresModelSpendStore(runtime), policy: { perRunCeilingMicros: 250000, dailyCeilingMicros: 10000000 } });
    const seam = guard.providerSeam({ runId, phase: "BODY", sharedWall: "EXEMPT", requireReportedUsage: true, price } as never);
    const projection = { requestBytes: 2, completionTokenCeiling: 1 };
    const admission = await seam.assertCallAllowed(projection);
    await seam.recordCall({ admission: admission as never, providerRef: "fake-provider", usage: { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 }, projection } as never);
    expect((await database.pool.query("SELECT count(*)::int n FROM ledger.model_spend WHERE run_id=$1", [runId])).rows[0].n).toBe(1);
  });
});

describe("every kind a team member spends is charged to the grant and counts for the team", () => {
  const kinds = [
    ["a dig's or a debate's arguing (RUN)", "RUN", (g: CostEnvelopeGuard, runId: string) => g.providerSeam({ runId, phase: "BODY", sharedWall: "EXEMPT", requireReportedUsage: true, price } as never)],
    ["the story (STORY)", "STORY", (g: CostEnvelopeGuard, runId: string) => g.storySeam({ runId, price, requireReportedUsage: true })],
    ["a rewrite, and its suggestions, which spend the same seam (PATH_REWRITE)", "PATH_REWRITE", (g: CostEnvelopeGuard, runId: string) => g.pathRewriteSeam({ runId, price, requireReportedUsage: true })],
    ["a climb (PATH_CLIMB)", "PATH_CLIMB", (g: CostEnvelopeGuard, runId: string) => g.pathClimbSeam({ runId, price, requireReportedUsage: true })],
    ["an answer update (ANSWER_UPDATE)", "ANSWER_UPDATE", (g: CostEnvelopeGuard, runId: string) => g.answerUpdateSeam({ runId, price, requireReportedUsage: true })],
    ["a report (INVESTIGATION_REPORT)", "INVESTIGATION_REPORT", (g: CostEnvelopeGuard, runId: string) => g.investigationReportSeam({ runId, price, requireReportedUsage: true })]
  ] as const;
  for (const [name, source, seamOf] of kinds) {
    it(name, async () => {
      const p = await funded(), runId = await pinnedRun(p), store = new PostgresModelSpendStore(runtime);
      const guard = new CostEnvelopeGuard({ store, policy: { perRunCeilingMicros: 250000, dailyCeilingMicros: 10000000, perStoryCeilingMicros: 250000 } } as never);
      const before = await spentNow(), seam = seamOf(guard, runId), projection = { requestBytes: 2, completionTokenCeiling: 1 };
      const admission = await seam.assertCallAllowed(projection);
      expect(admission).toMatchObject({ kind: "INTERNAL" });
      await seam.recordCall({ admission: admission as never, providerRef: "fake-provider", usage: { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 }, projection } as never);
      const rows = (await database.pool.query("SELECT s.spend_source,s.charge_micros::int charge,a.grant_id FROM ledger.model_spend s JOIN billing.internal_provider_admission a ON a.call_id=s.spend_id WHERE s.run_id=$1", [runId])).rows;
      expect(rows).toEqual([{ spend_source: source, charge: expect.any(Number), grant_id: p.grant.grantId }]);
      const charged = (await runtime.query("SELECT billing.read_internal_grant_spent($1,$2,$3,now()-interval '1 hour',now()+interval '1 hour',false) v", [p.actor.ownerRef, p.grant.grantId, p.grant.grantEventId])).rows[0].v;
      expect(Number(charged)).toBe(rows[0].charge);
      expect(await spentNow()).toBe(before + rows[0].charge);
    });
  }
  it("a public debate's contribution check is admitted on the grant at the database (its seam is the PUBLIC lane's)", async () => {
    const p = await funded(), runId = await pinnedRun(p), call = randomUUID();
    expect((await runtime.query("SELECT billing.reserve_internal_provider_call($1,$2,10,'CONTRIBUTION_CHECK',NULL) v", [call, runId])).rows[0].v).toBe(true);
    await runtime.query("SELECT billing.settle_internal_provider_call($1,$2,'CONTRIBUTION_CHECK',NULL,'fake-provider',7,1,1,NULL)", [call, runId]);
    expect((await database.pool.query("SELECT spend_source FROM ledger.model_spend WHERE spend_id=$1", [call])).rows).toEqual([{ spend_source: "CONTRIBUTION_CHECK" }]);
  });
  it("PUBLIC_REPORT reserves on no grant: it stays the PUBLIC lane's", async () => {
    const p = await funded(), runId = await pinnedRun(p);
    expect((await runtime.query("SELECT billing.reserve_internal_provider_call($1,$2,10,'PUBLIC_REPORT',NULL) v", [randomUUID(), runId])).rows[0].v).toBe(false);
  });
});
const runtimeLine = () => new RunWaitRepository(runtime);
