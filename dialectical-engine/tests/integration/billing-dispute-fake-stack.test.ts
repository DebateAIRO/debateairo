import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { BillingJobQueries, BillingRepository, EntitlementRepository } from "@debateai/db";
import { TAX_AUTHORITIES_DEPLOYMENT_REGISTER_ROW, taxAuthoritiesFromValue } from "@debateai/register";
import { recordDisputeOutcome, type DisputeStores } from "../../apps/api/src/billing/dispute-cli.js";
import { buildTaxSummary, parseTaxQuarter } from "../../apps/api/src/billing/tax-summary.js";
import { startBillingStack, type BillingPerson, type BillingStack } from "../support/billingStack.js";

/**
 * P2-I2 on the fake stack: xMoney's model of a dispute (P3b's fake) turns the payment `charge-back` AND adds a
 * `chargeback` transaction naming it. The daily money check lists both; VERIFY_PAYMENT must record ONE charge-back, on
 * the disputed payment's own charge, whatever charge the order's merchant id points at (the first payment's after a
 * renewal, the card check's after a card change). CI skips integration suites: run this before every merge that
 * touches billing.
 */
let stack: BillingStack;
let billing: BillingRepository;

beforeAll(async () => {
  stack = await startBillingStack();
  billing = new BillingRepository(stack.database.pool);
}, 600_000);
afterAll(async () => { await stack?.stop(); });

const DAY_MS = 86_400_000;

const disputeStores = (): DisputeStores => Object.freeze({
  billing, jobs: new BillingJobQueries(stack.database.pool), entitlements: new EntitlementRepository(stack.database.pool),
  clock: () => stack.now()
});

/** The xMoney transaction that paid this charge (its one SUCCEEDED). */
async function paymentOf(chargeId: string): Promise<string> {
  const found = await stack.database.pool.query<{ id: string }>(
    "SELECT xmoney_transaction_id AS id FROM billing.charge_event WHERE charge_id = $1 AND kind = 'SUCCEEDED'", [chargeId]
  );
  expect(found.rows).toHaveLength(1);
  return found.rows[0]!.id;
}

async function chargeOf(ownerRef: string, kind: "INITIAL" | "RENEWAL" | "CARD_CHECK"): Promise<string> {
  const found = await stack.database.pool.query<{ charge_id: string }>(
    "SELECT charge_id FROM billing.charge WHERE owner_ref = $1 AND kind = $2 ORDER BY created_at DESC LIMIT 1", [ownerRef, kind]
  );
  return found.rows[0]!.charge_id;
}

/** Every CHARGEBACK of the person's charges: the charge, its kind and the payment it is keyed by. */
async function chargebacksOf(ownerRef: string): Promise<string[][]> {
  const found = await stack.database.pool.query<{ charge_id: string; kind: string; id: string }>(`
    SELECT e.charge_id, c.kind, e.xmoney_transaction_id AS id FROM billing.charge_event e
    JOIN billing.charge c ON c.charge_id = e.charge_id WHERE c.owner_ref = $1 AND e.kind = 'CHARGEBACK' ORDER BY e.seq
  `, [ownerRef]);
  return found.rows.map((row) => [row.charge_id, row.kind, row.id]);
}

/** The VERIFY_PAYMENT jobs of one xMoney transaction, oldest first. */
async function verifications(transactionId: string): Promise<Array<{ done: boolean; dead: boolean }>> {
  return (await stack.database.pool.query<{ done: boolean; dead: boolean }>(`
    SELECT done_at IS NOT NULL AS done, dead_at IS NOT NULL AS dead FROM billing.outbox
    WHERE kind = 'VERIFY_PAYMENT' AND ref = $1 ORDER BY not_before
  `, [transactionId])).rows;
}

async function subscriptionKinds(ownerRef: string): Promise<string[]> {
  const subscription = await billing.subscriptionForOwner(ownerRef);
  return (await billing.subscriptionEvents(subscription!.subscriptionId)).map((event) => event.kind);
}

/** The owner's summary (spec §2.5.9) over the stage rows of the last year: the charge-backs of this person's charges. */
async function summaryChargebacks(ownerRef: string): Promise<string[]> {
  const to = new Date(stack.now().getTime() + DAY_MS);
  const from = new Date(to.getTime() - 400 * DAY_MS);
  const summary = buildTaxSummary({
    quarter: { ...parseTaxQuarter("2026-Q4"), from, to }, rows: await billing.quarterSummaryRows(from, to, "stage"),
    invoiceUnknown: [], efactura: [], paymentsToCheck: [], deadEmails: [],
    authorities: taxAuthoritiesFromValue(TAX_AUTHORITIES_DEPLOYMENT_REGISTER_ROW.value, TAX_AUTHORITIES_DEPLOYMENT_REGISTER_ROW.sourceRef)
  });
  const mine = new Set((await billing.chargesForSubscription((await billing.subscriptionForOwner(ownerRef))!.subscriptionId))
    .map((charge) => charge.chargeId));
  return summary.chargebacks.filter((row) => mine.has(row.chargeId)).map((row) => row.chargeId);
}

/**
 * The bank takes the payment back. The daily check records one dispute, the plan is suspended once (Free, one M10),
 * the summary lists one charge-back, a second daily check finds nothing left to verify, and the owner's "won" resumes
 * the plan at once.
 */
async function disputeIsOneChargeback(person: BillingPerson, chargeId: string, kind: "INITIAL" | "RENEWAL"): Promise<void> {
  const payment = await paymentOf(chargeId);
  const dispute = stack.xmoney.chargeback(payment);
  const before = await subscriptionKinds(person.ownerRef);
  await stack.reconcileDaily();
  expect(await chargebacksOf(person.ownerRef)).toEqual([[chargeId, kind, payment]]);
  expect((await subscriptionKinds(person.ownerRef)).slice(before.length)).toEqual(["SUSPENDED"]);
  expect(await stack.entitlementPlan(person.ownerRef)).toBe("FREE");
  expect(stack.mailsTo(person.email).filter((mail) => mail.templateId === "M10")).toHaveLength(1);
  expect(await summaryChargebacks(person.ownerRef)).toEqual([chargeId]);
  expect(await verifications(dispute)).toEqual([{ done: true, dead: false }]);
  const paymentChecks = (await verifications(payment)).length;
  // Both reports are settled by the one CHARGEBACK: neither is queued again (a MISMATCH would be, every day).
  await stack.reconcileDaily();
  expect(await verifications(dispute)).toEqual([{ done: true, dead: false }]);
  expect(await verifications(payment)).toHaveLength(paymentChecks);
  expect(await recordDisputeOutcome(disputeStores(), { chargeRef: chargeId, outcome: "won" })).toBe("RESUMED");
  expect(await stack.subscriptionStatus(person.ownerRef)).toBe("ACTIVE");
  expect(await stack.entitlementPlan(person.ownerRef)).not.toBe("FREE");
  // A won dispute stays settled: the next check queues neither report, nor suspends the plan or sends M10 again.
  await stack.reconcileDaily();
  expect(await verifications(dispute)).toHaveLength(1);
  expect(await verifications(payment)).toHaveLength(paymentChecks);
  expect(await stack.subscriptionStatus(person.ownerRef)).toBe("ACTIVE");
  expect(stack.mailsTo(person.email).filter((mail) => mail.templateId === "M10")).toHaveLength(1);
}

describe("P2-I2 one dispute is one charge-back, on the fake stack", () => {
  it("a dispute of the first payment", async () => {
    const person = await stack.signUp("dispute.first@example.test", "RO");
    const chargeId = await stack.subscribe(person, "PLUS", "RO");
    await disputeIsOneChargeback(person, chargeId, "INITIAL");
  });

  it("a dispute of a renewal lands on the renewal's charge, never the first payment's", async () => {
    const person = await stack.signUp("dispute.renewal@example.test", "DE");
    await stack.subscribe(person, "PLUS", "DE");
    stack.advanceDays(31);
    await stack.runRenewals();
    await disputeIsOneChargeback(person, await chargeOf(person.ownerRef, "RENEWAL"), "RENEWAL");
  });

  it("a dispute of a renewal after a card change, whose order is the card check's", async () => {
    const person = await stack.signUp("dispute.card@example.test", "RO");
    await stack.subscribe(person, "PLUS", "RO");
    const firstOrder = await stack.xmoneyOrderOf(person.ownerRef);
    const started = await stack.post(person, "/v1/billing/subscription/card", {});
    expect(started.status).toBe(200);
    const notice = await stack.pay(started, "RO");
    expect((await stack.notify(notice.opensslResult)).text).toBe("OK");
    await stack.runJobs();
    expect(await subscriptionKinds(person.ownerRef)).toContain("CARD_CHANGED");
    expect(await stack.xmoneyOrderOf(person.ownerRef)).not.toBe(firstOrder);
    stack.advanceDays(31);
    await stack.runRenewals();
    const renewal = await chargeOf(person.ownerRef, "RENEWAL");
    await disputeIsOneChargeback(person, renewal, "RENEWAL");
  });
});
