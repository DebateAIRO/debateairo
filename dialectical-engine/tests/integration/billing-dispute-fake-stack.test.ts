import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { BillingJobQueries, BillingRepository, EntitlementRepository } from "@debateai/db";
import { TAX_AUTHORITIES_DEPLOYMENT_REGISTER_ROW, taxAuthoritiesFromValue } from "@debateai/register";
import { recordDisputeOutcome, type DisputeStores } from "../../apps/api/src/billing/dispute-cli.js";
import { buildTaxSummary, parseTaxQuarter } from "../../apps/api/src/billing/tax-summary.js";
import { netopiaCountry, startBillingStack, type BillingPerson, type BillingStack } from "../support/billingStack.js";

/**
 * P2-I2 on NETOPIA's statuses (spec 2026-10-05 §2.13): a dispute is a status (9) of the disputed payment's own order,
 * which is our charge id. VERIFY_PAYMENT records ONE charge-back on that charge, whatever message arrives again, after a
 * renewal or after a card change. CI skips integration suites: run this before every merge that touches billing.
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

/** NETOPIA's payment number of this charge's one SUCCEEDED. */
async function paymentOf(chargeId: string): Promise<string> {
  const found = await stack.database.pool.query<{ id: string }>(
    "SELECT provider_payment_id AS id FROM billing.charge_event WHERE charge_id = $1 AND kind = 'SUCCEEDED'", [chargeId]
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
    SELECT e.charge_id, c.kind, e.provider_payment_id AS id FROM billing.charge_event e
    JOIN billing.charge c ON c.charge_id = e.charge_id WHERE c.owner_ref = $1 AND e.kind = 'CHARGEBACK' ORDER BY e.seq
  `, [ownerRef]);
  return found.rows.map((row) => [row.charge_id, row.kind, row.id]);
}

async function subscriptionKinds(ownerRef: string): Promise<string[]> {
  const subscription = await billing.subscriptionForOwner(ownerRef);
  return (await billing.subscriptionEvents(subscription!.subscriptionId)).map((event) => event.kind);
}

/** The owner's summary (spec §2.5.9) over the NETOPIA sandbox rows of the last year: the charge-backs of this person's charges. */
async function summaryChargebacks(ownerRef: string): Promise<string[]> {
  const to = new Date(stack.now().getTime() + DAY_MS);
  const from = new Date(to.getTime() - 400 * DAY_MS);
  const summary = buildTaxSummary({
    quarter: { ...parseTaxQuarter("2026-Q4"), from, to }, rows: await billing.quarterSummaryRows(from, to, { provider: "netopia", environment: "sandbox" }),
    invoiceUnknown: [], efactura: [], paymentsToCheck: [], deadEmails: [],
    authorities: taxAuthoritiesFromValue(TAX_AUTHORITIES_DEPLOYMENT_REGISTER_ROW.value, TAX_AUTHORITIES_DEPLOYMENT_REGISTER_ROW.sourceRef)
  });
  const mine = new Set((await billing.chargesForSubscription((await billing.subscriptionForOwner(ownerRef))!.subscriptionId))
    .map((charge) => charge.chargeId));
  return summary.chargebacks.filter((row) => mine.has(row.chargeId)).map((row) => row.chargeId);
}

/**
 * The bank takes the payment back (status 9). One charge-back is recorded, the plan is suspended once (Free, one M10),
 * the summary lists one charge-back, the same message again and the next status reads change nothing, and the
 * owner's "won" resumes the plan at once.
 */
async function disputeIsOneChargeback(person: BillingPerson, chargeId: string, kind: "INITIAL" | "RENEWAL"): Promise<void> {
  const payment = await paymentOf(chargeId);
  const before = await subscriptionKinds(person.ownerRef);
  stack.netopia.chargeback(chargeId, 9);
  await stack.runJobs();
  expect(await chargebacksOf(person.ownerRef)).toEqual([[chargeId, kind, payment]]);
  expect((await subscriptionKinds(person.ownerRef)).slice(before.length)).toEqual(["SUSPENDED"]);
  expect(await stack.entitlementPlan(person.ownerRef)).toBe("FREE");
  expect(stack.mailsTo(person.email).filter((mail) => mail.templateId === "M10")).toHaveLength(1);
  expect(await summaryChargebacks(person.ownerRef)).toEqual([chargeId]);
  // NETOPIA sends the message again, and the status reads keep saying 9: still one charge-back, one suspension.
  expect((await stack.netopia.resendLastNotice(chargeId, stack.notifyUrl)).httpStatus).toBe(200);
  await stack.runJobs();
  await stack.reconcile();
  expect(await chargebacksOf(person.ownerRef)).toEqual([[chargeId, kind, payment]]);
  expect(await recordDisputeOutcome(disputeStores(), { chargeRef: chargeId, outcome: "won" })).toBe("RESUMED");
  expect(await stack.subscriptionStatus(person.ownerRef)).toBe("ACTIVE");
  expect(await stack.entitlementPlan(person.ownerRef)).not.toBe("FREE");
  // A won dispute stays settled: the same message again neither suspends the plan nor sends M10 again.
  await stack.netopia.resendLastNotice(chargeId, stack.notifyUrl);
  await stack.runJobs();
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

  it("a dispute of a renewal after a card change lands on the renewal's charge, charged to the new card", async () => {
    const person = await stack.signUp("dispute.card@example.test", "RO");
    await stack.subscribe(person, "PLUS", "RO");
    const firstCard = await stack.cardTokenOf(person.ownerRef);
    // Spec §2.11: the card page sends the billing details and the card-saving agreement, and starts a 0 check.
    const started = await stack.post(person, "/v1/billing/subscription/card", {
      locale: "en", renewal_terms: stack.consents("en").renewal_terms, first_name: "Ana", last_name: "Pop",
      phone: "+40712345678", street: "Strada Memorandumului 1", city: "Cluj-Napoca", postal_code: "400114"
    });
    expect(started.status).toBe(200);
    expect(started.body.hold_amount).toBe("0.00");
    stack.netopia.pay(String(started.body.charge_ref), "APPROVE", undefined, netopiaCountry("RO"));
    await stack.runJobs();
    expect(await subscriptionKinds(person.ownerRef)).toContain("CARD_CHANGED");
    expect(await stack.cardTokenOf(person.ownerRef)).not.toBe(firstCard);
    stack.advanceDays(31);
    await stack.runRenewals();
    const renewal = await chargeOf(person.ownerRef, "RENEWAL");
    await disputeIsOneChargeback(person, renewal, "RENEWAL");
  });
});
