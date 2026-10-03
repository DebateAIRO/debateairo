import { randomBytes } from "node:crypto";
import { describe, expect, it } from "vitest";
import type { ChargeEventRow, ChargeRow, InvoiceRow, OutboxJob, QuoteRow } from "@debateai/db";
import { TypedDomainError } from "@debateai/kernel";
import type { BillingAuditEvent } from "../../apps/api/src/billing/audit.js";
import { creditNoteContext, type CreditNoteContext } from "../../apps/api/src/billing/invoice-common.js";
import { createQuadernoRefundHandler } from "../../apps/api/src/billing/invoice-quaderno.js";
import { createSmartBillStornoHandler } from "../../apps/api/src/billing/invoice-smartbill.js";
import type { OutboxHandler } from "../../apps/api/src/billing/outbox.js";
import { sealBillingProfile, sealQuoteLocation } from "../../apps/api/src/billing/records.js";
import { RefundDesk } from "../../apps/api/src/billing/refunds.js";
import { testBillingPolicy } from "../support/billingFixtures.js";

/*
 * P2-I5 (1)(2): the money executor and the credit-note jobs act only on what the charge's own rows record. Any process
 * holding the runtime role can INSERT into billing.outbox; a row it forged must move no money and issue no document.
 * (1) An XMONEY_REFUND job refunds only the REFUND_REQUESTED of its transaction, at that amount and for that reason
 * (`whole` only for a reason that refunds a whole payment, at its full amount); anything else is DEAD
 * REFUND_NOT_REQUESTED with O2. (2) A credit note is issued for the amount of the transaction's REFUNDED row, and
 * waits while there is none.
 */

const NOW = new Date("2026-10-10T12:00:00.000Z");
const PAID_AT = new Date("2026-10-08T09:00:00.000Z");
const REFUNDED_AT = new Date("2026-10-09T15:30:00.000Z");
const CHARGE_ID = "c".repeat(32);
const OWNER_REF = "0b4e2a9c-6f1d-4c3e-9a7b-2d5f8e1c0a93";
const CUSTOMER_ID = "7e6d5c4b-3a29-4180-9f7e-6d5c4b3a2918";
const QUOTE_ID = "3c2b1a09-8f7e-4d6c-9b5a-4f3e2d1c0b9a";
const PAYMENT = "61001";
const SECOND_PAYMENT = "61005";
const TOTAL = 24_200_000;
const RECORDS_KEY = randomBytes(32);
/** When the person withdrew (an email that arrived before the owner recorded it, at WITHDRAWN_AT). */
const WITHDREW_AT = new Date("2026-10-09T08:30:00.000Z");
const WITHDRAWN_AT = new Date("2026-10-09T10:00:00.000Z");

/** Any member a test did not give throws, so a handler that reaches a vendor, a lease or a write fails loudly. */
function only<T extends object>(members: Partial<Record<string, unknown>>, name: string): T {
  return new Proxy(members, {
    get(target, property) {
      if (typeof property === "string" && property in target) return target[property];
      if (property === "then") return undefined;
      return () => { throw new Error(`${name}.${String(property)} must not be called`); };
    }
  }) as T;
}

function event(
  kind: ChargeEventRow["kind"], transactionId: string, amountMicros: number, errorCode: string | null = null,
  at: Date = PAID_AT, refundsTransactionId: string | null = null
): ChargeEventRow {
  return {
    eventId: `${kind}-${transactionId}-${amountMicros}`, chargeId: CHARGE_ID, kind, at, xmoneyTransactionId: transactionId,
    amountMicros, errorCode, xmoneyEnvironment: "live", refundsTransactionId
  };
}

function charge(events: ChargeEventRow[], kind: ChargeRow["kind"] = "INITIAL"): ChargeRow & { events: ChargeEventRow[] } {
  return {
    chargeId: CHARGE_ID, ownerRef: OWNER_REF, subscriptionId: "5d0a1c2b-3e4f-4a5b-8c6d-7e8f9a0b1c2d", kind, attempt: 1,
    periodStart: PAID_AT, periodEnd: new Date("2026-11-08T09:00:00.000Z"), quoteId: QUOTE_ID,
    netMicros: 20_000_000, taxMicros: 4_200_000, totalMicros: TOTAL, currency: "USD", createdAt: PAID_AT,
    xmoneyEnvironment: "live", events
  };
}

function job(kind: OutboxJob["kind"], ref: string, payload: OutboxJob["payload"], attempts = 1): OutboxJob {
  return { jobId: "9a8b7c6d-5e4f-4a3b-9c2d-1e0f9a8b7c6d", kind, ref, payload, createdAt: NOW, notBefore: NOW, attempts,
    claimedBy: "w", claimedAt: NOW };
}

function recorder() {
  const lines: Array<Readonly<{ event: BillingAuditEvent; fields: Readonly<Record<string, unknown>> }>> = [];
  return { lines, audit: (name: BillingAuditEvent, fields: Readonly<Record<string, unknown>>) => { lines.push({ event: name, fields }); } };
}

type RefundPayload = Readonly<{ transaction: string; amount: number; whole: boolean; reason: string; owner?: string }>;

const refundJob = (payload: RefundPayload): OutboxJob => job("XMONEY_REFUND", `${CHARGE_ID}:${payload.transaction}`, {
  charge_id: CHARGE_ID, transaction_id: payload.transaction, amount_micros: payload.amount, whole: payload.whole,
  owner_ref: payload.owner ?? OWNER_REF, reason: payload.reason
});

/**
 * A RefundDesk over one charge whose xMoney records every refund call it receives and answers it (or, with
 * `refusal`, refuses it with that code). `stale`: the job was claimed again by another worker (P2-M6), so its stage
 * write is refused.
 */
function desk(recorded: (ChargeRow & { events: ChargeEventRow[] }) | null, refusal: string | null = null, stale = false) {
  const calls: Array<Readonly<{ transactionId: string; amountDecimal: string | null }>> = [];
  const enqueued: Array<Readonly<{ kind: string; ref: string; payload: Record<string, unknown> }>> = [];
  const appended: ChargeEventRow["kind"][] = [];
  const { lines, audit } = recorder();
  const refundDesk = new RefundDesk({
    repository: only({
      charge: async () => recorded,
      withTransaction: async (work: (client: unknown) => Promise<unknown>) => work({}),
      enqueue: async (_client: unknown, queued: Readonly<{ kind: string; ref: string; payload: Record<string, unknown> }>) => {
        enqueued.push(queued);
        return "queued";
      },
      appendChargeEvent: async (_client: unknown, row: Readonly<{ kind: ChargeEventRow["kind"] }>) => {
        appended.push(row.kind);
        return "INSERTED";
      },
      customerByOwner: async () => ({ customerId: CUSTOMER_ID }),
      // W9 (P2-M8): the withdrawal a dead WITHDRAWAL refund belongs to, for its O2's deadline.
      subscriptionEvents: async () => [{ kind: "WITHDRAWN", at: WITHDRAWN_AT, data: { withdrew_at: WITHDREW_AT.toISOString() } }]
    }, "repository"),
    jobs: only({
      withLease: async (_key: string, work: () => Promise<unknown>) => ({ kind: "RAN", value: await work() }),
      // P2-M6: the job is still this worker's claim, so the call's stage is recorded and the call goes ahead.
      markJobStage: async () => !stale,
      // P2-M6: every refund recording takes the owner lock before it reads the charge again.
      lockOwner: async () => undefined
    }, "jobs"),
    xmoney: only({
      refund: async (input: Readonly<{ transactionId: string; amountDecimal: string | null }>) => {
        calls.push({ transactionId: input.transactionId, amountDecimal: input.amountDecimal });
        if (refusal !== null) throw new TypedDomainError(refusal, `${refusal}:1402`);
      }
    }, "xmoney"),
    policy: testBillingPolicy, audit, clock: () => NOW, xmoneyEnvironment: "live"
  });
  return { refundDesk, calls, enqueued, appended, lines };
}

describe("P2-I5 (1) the refund executor moves money only for a recorded refund request", () => {
  const withdrawalRequested = () => charge([
    event("SUCCEEDED", PAYMENT, TOTAL), event("REFUND_REQUESTED", PAYMENT, 5_000_000, "WITHDRAWAL")
  ]);
  const forged: ReadonlyArray<readonly [string, () => ChargeRow & { events: ChargeEventRow[] }, RefundPayload]> = [
    ["a payment with no refund request at all, refunded whole as a card-check release",
      () => charge([event("SUCCEEDED", PAYMENT, TOTAL)]),
      { transaction: PAYMENT, amount: TOTAL, whole: true, reason: "CARD_CHECK_RELEASE" }],
    ["a larger amount than the request records",
      withdrawalRequested, { transaction: PAYMENT, amount: TOTAL, whole: false, reason: "WITHDRAWAL" }],
    ["a smaller amount than the request records",
      withdrawalRequested, { transaction: PAYMENT, amount: 1_000_000, whole: false, reason: "WITHDRAWAL" }],
    ["another reason than the request records",
      withdrawalRequested, { transaction: PAYMENT, amount: 5_000_000, whole: false, reason: "CARD_CHECK_RELEASE" }],
    // Recorded at the payment's full amount and asked whole at it: only "a withdrawal never refunds whole" refuses it.
    ["the whole payment for a withdrawal, whose refund is always a named amount",
      () => charge([event("SUCCEEDED", PAYMENT, TOTAL), event("REFUND_REQUESTED", PAYMENT, TOTAL, "WITHDRAWAL")]),
      { transaction: PAYMENT, amount: TOTAL, whole: true, reason: "WITHDRAWAL" }],
    ["the whole payment for a whole-payment reason, but at less than the payment's full amount",
      () => charge([event("SUCCEEDED", PAYMENT, TOTAL), event("REFUND_REQUESTED", PAYMENT, 5_000_000, "SUBSCRIPTION_ENDED")]),
      { transaction: PAYMENT, amount: 5_000_000, whole: true, reason: "SUBSCRIPTION_ENDED" }],
    ["another person's owner reference than the charge's",
      withdrawalRequested,
      { transaction: PAYMENT, amount: 5_000_000, whole: false, reason: "WITHDRAWAL", owner: "1c5f3b0d-7a2e-4d4f-8b8c-3e6a9f2d1b04" }],
    ["a refund made at xMoney (P9c's provider row), which is no request of ours",
      () => charge([event("SUCCEEDED", PAYMENT, TOTAL), event("REFUND_REQUESTED", SECOND_PAYMENT, 5_000_000, "PROVIDER_REFUND"),
        event("DUPLICATE_PAYMENT", SECOND_PAYMENT, 5_000_000)]),
      { transaction: SECOND_PAYMENT, amount: 5_000_000, whole: false, reason: "DUPLICATE_PAYMENT" }],
    ["a payment whose request names another transaction of the same charge",
      () => charge([event("SUCCEEDED", PAYMENT, TOTAL), event("DUPLICATE_PAYMENT", SECOND_PAYMENT, TOTAL),
        event("REFUND_REQUESTED", SECOND_PAYMENT, TOTAL, "DUPLICATE_PAYMENT")]),
      { transaction: PAYMENT, amount: TOTAL, whole: true, reason: "DUPLICATE_PAYMENT" }]
  ];

  for (const [name, recorded, payload] of forged) {
    it(`ends a forged job DEAD REFUND_NOT_REQUESTED with O2 and no xMoney call: ${name}`, async () => {
      const made = desk(recorded());
      expect(await made.refundDesk.handle(refundJob(payload), NOW)).toEqual({ kind: "DEAD", code: "REFUND_NOT_REQUESTED" });
      expect(made.calls).toEqual([]);
      expect(made.appended).toEqual([]);
      expect(made.enqueued).toHaveLength(1);
      // Its own O2: the flag picks the "no refund to make" sentences, and its own ref never meets a real refund's O2.
      expect(made.enqueued[0]).toMatchObject({
        kind: "EMAIL", ref: `O2:${CHARGE_ID}:${payload.transaction}:not-requested`,
        payload: expect.objectContaining({
          template: "O2", "param.reasonCode": "REFUND_NOT_REQUESTED", "param.notRequested": "true"
        })
      });
    });
  }

  it("keeps today's O2 for a refund xMoney refused: the flag off and the refund job's own ref", async () => {
    const made = desk(charge([
      event("SUCCEEDED", PAYMENT, TOTAL), event("REFUND_REQUESTED", PAYMENT, 5_000_000, "SUBSCRIPTION_ENDED")
    ]), "XMONEY_REFUSED");
    expect(await made.refundDesk.handle(refundJob({ transaction: PAYMENT, amount: 5_000_000, whole: false, reason: "SUBSCRIPTION_ENDED" }), NOW))
      .toEqual({ kind: "DEAD", code: "XMONEY_REFUSED" });
    expect(made.calls).toEqual([{ transactionId: PAYMENT, amountDecimal: "5.00" }]);
    expect(made.enqueued).toEqual([expect.objectContaining({
      kind: "EMAIL", ref: `O2:${CHARGE_ID}:${PAYMENT}`,
      payload: expect.objectContaining({
        template: "O2", "param.chargeRef": CHARGE_ID, "param.refundAmount": "5.00", "param.reasonCode": "XMONEY_REFUSED",
        "param.notRequested": "false"
      })
    })]);
  });

  it("names a dead withdrawal refund's reason and its 14-day deadline in O2, from when the person withdrew (W9, P2-M8)", async () => {
    const made = desk(charge([
      event("SUCCEEDED", PAYMENT, TOTAL), event("REFUND_REQUESTED", PAYMENT, 5_000_000, "WITHDRAWAL")
    ]), "XMONEY_REFUSED");
    expect(await made.refundDesk.handle(refundJob({ transaction: PAYMENT, amount: 5_000_000, whole: false, reason: "WITHDRAWAL" }), NOW))
      .toEqual({ kind: "DEAD", code: "XMONEY_REFUSED" });
    expect(made.enqueued).toEqual([expect.objectContaining({
      kind: "EMAIL", ref: `O2:${CHARGE_ID}:${PAYMENT}`,
      payload: expect.objectContaining({
        template: "O2", "param.reasonCode": "XMONEY_REFUSED", "param.notRequested": "false",
        "param.refundReason": "WITHDRAWAL", "param.refundDeadline": "2026-10-23T08:30:00.000Z"
      })
    })]);
  });

  it("names another refund's reason in O2 without a deadline, and a forged job's O2 carries neither (W9, P2-M8)", async () => {
    const made = desk(charge([
      event("SUCCEEDED", PAYMENT, TOTAL), event("REFUND_REQUESTED", PAYMENT, 5_000_000, "SUBSCRIPTION_ENDED")
    ]), "XMONEY_REFUSED");
    await made.refundDesk.handle(refundJob({ transaction: PAYMENT, amount: 5_000_000, whole: false, reason: "SUBSCRIPTION_ENDED" }), NOW);
    expect(made.enqueued[0]!.payload).toMatchObject({ "param.refundReason": "SUBSCRIPTION_ENDED" });
    expect(made.enqueued[0]!.payload).not.toHaveProperty("param.refundDeadline");
    const forged = desk(charge([event("SUCCEEDED", PAYMENT, TOTAL), event("REFUND_REQUESTED", PAYMENT, 5_000_000, "WITHDRAWAL")]));
    await forged.refundDesk.handle(refundJob({ transaction: PAYMENT, amount: TOTAL, whole: false, reason: "WITHDRAWAL" }), NOW);
    expect(forged.enqueued[0]!.payload).toMatchObject({ "param.notRequested": "true" });
    expect(forged.enqueued[0]!.payload).not.toHaveProperty("param.refundReason");
    expect(forged.enqueued[0]!.payload).not.toHaveProperty("param.refundDeadline");
  });

  it("tells the owner a job naming a charge we do not have is no refund to make (P2-W4: REFUND_CHARGE_MISSING)", async () => {
    // Nothing was sent and no request of ours backs it: the not-requested sentences are true for it, and its own ref.
    const made = desk(null);
    expect(await made.refundDesk.handle(refundJob({ transaction: PAYMENT, amount: 5_000_000, whole: false, reason: "WITHDRAWAL" }), NOW))
      .toEqual({ kind: "DEAD", code: "REFUND_CHARGE_MISSING" });
    expect(made.calls).toEqual([]);
    expect(made.enqueued).toEqual([expect.objectContaining({
      kind: "EMAIL", ref: `O2:${CHARGE_ID}:${PAYMENT}:not-requested`,
      payload: expect.objectContaining({
        template: "O2", "param.reasonCode": "REFUND_CHARGE_MISSING", "param.notRequested": "true"
      })
    })]);
    expect(made.enqueued[0]!.payload).not.toHaveProperty("param.refundReason");
    expect(made.enqueued[0]!.payload).not.toHaveProperty("param.refundDeadline");
  });

  it("tells the owner a job of the other xMoney system was never sent, with no deadline (P2-W4: OTHER_XMONEY_SYSTEM)", async () => {
    // A sandbox payment's withdrawal refund on the live API: this API never sees that system's refunds, so neither
    // "refund exactly … M8 follows by itself" nor the legal deadline is true here; nor is its reason a recorded one.
    const stagePaid = charge([
      event("SUCCEEDED", PAYMENT, TOTAL), event("REFUND_REQUESTED", PAYMENT, 5_000_000, "WITHDRAWAL")
    ]);
    const made = desk({ ...stagePaid, xmoneyEnvironment: "stage" });
    expect(await made.refundDesk.handle(refundJob({ transaction: PAYMENT, amount: 5_000_000, whole: false, reason: "WITHDRAWAL" }), NOW))
      .toEqual({ kind: "DEAD", code: "OTHER_XMONEY_SYSTEM" });
    expect(made.calls).toEqual([]);
    expect(made.enqueued).toEqual([expect.objectContaining({
      kind: "EMAIL", ref: `O2:${CHARGE_ID}:${PAYMENT}:other-system`,
      payload: expect.objectContaining({
        template: "O2", "param.reasonCode": "OTHER_XMONEY_SYSTEM", "param.notRequested": "false", "param.otherSystem": "true"
      })
    })]);
    expect(made.enqueued[0]!.payload).not.toHaveProperty("param.refundDeadline");
    expect(made.enqueued[0]!.payload).not.toHaveProperty("param.refundReason");
    // Control: the same withdrawal refund refused in this API's own system keeps its deadline, and no other-system flag.
    const refused = desk(stagePaid, "XMONEY_REFUSED");
    await refused.refundDesk.handle(refundJob({ transaction: PAYMENT, amount: 5_000_000, whole: false, reason: "WITHDRAWAL" }), NOW);
    expect(refused.enqueued[0]!.payload).toMatchObject({ "param.refundDeadline": "2026-10-23T08:30:00.000Z" });
    expect(refused.enqueued[0]!.payload).not.toHaveProperty("param.otherSystem");
  });

  it("refuses a forged job before its retry looks anything up at xMoney", async () => {
    // A later attempt reads the job's stage and the transaction first (A4c); a forged job never gets that far.
    const made = desk(charge([event("SUCCEEDED", PAYMENT, TOTAL)]));
    const retried = { ...refundJob({ transaction: PAYMENT, amount: TOTAL, whole: true, reason: "CARD_CHECK_RELEASE" }), attempts: 3 };
    expect(await made.refundDesk.handle(retried, NOW)).toEqual({ kind: "DEAD", code: "REFUND_NOT_REQUESTED" });
    expect(made.calls).toEqual([]);
  });

  it("refunds a recorded whole-payment request whole, at the payment's full amount", async () => {
    const made = desk(charge([
      event("SUCCEEDED", PAYMENT, TOTAL), event("REFUND_REQUESTED", PAYMENT, TOTAL, "CARD_CHECK_RELEASE")
    ], "CARD_CHECK"));
    expect(await made.refundDesk.handle(refundJob({ transaction: PAYMENT, amount: TOTAL, whole: true, reason: "CARD_CHECK_RELEASE" }), NOW))
      .toEqual({ kind: "DONE" });
    expect(made.calls).toEqual([{ transactionId: PAYMENT, amountDecimal: null }]);
    expect(made.appended).toEqual(["REFUNDED"]);
  });

  it("refunds a recorded duplicate payment whole, at the amount its DUPLICATE_PAYMENT row records", async () => {
    // P9b/P11: a rebill paid twice is refunded at its own amount, which need not be this charge's total.
    const made = desk(charge([
      event("SUCCEEDED", PAYMENT, TOTAL), event("DUPLICATE_PAYMENT", SECOND_PAYMENT, 12_100_000),
      event("REFUND_REQUESTED", SECOND_PAYMENT, 12_100_000, "DUPLICATE_PAYMENT")
    ]));
    expect(await made.refundDesk.handle(
      refundJob({ transaction: SECOND_PAYMENT, amount: 12_100_000, whole: true, reason: "DUPLICATE_PAYMENT" }), NOW
    )).toEqual({ kind: "DONE" });
    expect(made.calls).toEqual([{ transactionId: SECOND_PAYMENT, amountDecimal: null }]);
    expect(made.enqueued).toEqual([expect.objectContaining({ kind: "EMAIL", payload: expect.objectContaining({ template: "M11_DUPLICATE" }) })]);
  });

  it("refunds a recorded partial request at exactly its amount", async () => {
    const made = desk(charge([
      event("SUCCEEDED", PAYMENT, TOTAL), event("REFUND_REQUESTED", PAYMENT, 5_000_000, "SUBSCRIPTION_ENDED")
    ]));
    expect(await made.refundDesk.handle(refundJob({ transaction: PAYMENT, amount: 5_000_000, whole: false, reason: "SUBSCRIPTION_ENDED" }), NOW))
      .toEqual({ kind: "DONE" });
    expect(made.calls).toEqual([{ transactionId: PAYMENT, amountDecimal: "5.00" }]);
  });

  it("records a 0.00 card-check hold's release with no xMoney call (P2-M4)", async () => {
    const made = desk(charge([
      event("SUCCEEDED", PAYMENT, 0), event("REFUND_REQUESTED", PAYMENT, 0, "CARD_CHECK_RELEASE")
    ], "CARD_CHECK"));
    expect(await made.refundDesk.handle(refundJob({ transaction: PAYMENT, amount: 0, whole: true, reason: "CARD_CHECK_RELEASE" }), NOW))
      .toEqual({ kind: "DONE" });
    expect(made.calls).toEqual([]);
    expect(made.appended).toEqual(["REFUNDED"]);
    expect(made.enqueued).toEqual([]);
  });

  it("still ends any other zero refund job as REFUND_PAYLOAD_INVALID, with no call (P2-M4)", async () => {
    for (const payload of [
      { transaction: PAYMENT, amount: 0, whole: false, reason: "WITHDRAWAL" },
      { transaction: PAYMENT, amount: 0, whole: true, reason: "DUPLICATE_PAYMENT" },
      { transaction: PAYMENT, amount: 0, whole: false, reason: "CARD_CHECK_RELEASE" }
    ] as const) {
      const made = desk(charge([event("SUCCEEDED", PAYMENT, 0), event("REFUND_REQUESTED", PAYMENT, 0, payload.reason)], "CARD_CHECK"));
      expect(await made.refundDesk.handle(refundJob(payload), NOW)).toEqual({ kind: "DEAD", code: "REFUND_PAYLOAD_INVALID" });
      expect(made.calls).toEqual([]);
      expect(made.appended).toEqual([]);
    }
  });

  it("makes no refund call when another worker claimed the job after this one's lease ran out (P2-M6)", async () => {
    const made = desk(charge([
      event("SUCCEEDED", PAYMENT, TOTAL), event("REFUND_REQUESTED", PAYMENT, 5_000_000, "SUBSCRIPTION_ENDED")
    ]), null, true);
    expect(await made.refundDesk.handle(refundJob({ transaction: PAYMENT, amount: 5_000_000, whole: false, reason: "SUBSCRIPTION_ENDED" }), NOW))
      .toMatchObject({ kind: "RETRY", code: "BILLING_OUTBOX_CLAIM_LOST" });
    expect(made.calls).toEqual([]);
    expect(made.appended).toEqual([]);
  });

  it("records nothing, and runs no follow-up, for a refund its payment already holds a REFUNDED for (P2-M6)", async () => {
    // Another process recorded xMoney's own refund transaction for it (D5 5g) while this one held the call's answer.
    const made = desk(charge([
      event("SUCCEEDED", PAYMENT, TOTAL), event("REFUND_REQUESTED", PAYMENT, 5_000_000, "SUBSCRIPTION_ENDED"),
      event("REFUNDED", "61009", 5_000_000, "SUBSCRIPTION_ENDED", REFUNDED_AT, PAYMENT)
    ]));
    await made.refundDesk.recordRefunded({
      chargeId: CHARGE_ID, transactionId: PAYMENT, amountMicros: 5_000_000, whole: false, ownerRef: OWNER_REF,
      reason: "SUBSCRIPTION_ENDED"
    }, NOW);
    expect(made.appended).toEqual([]);
    expect(made.enqueued).toEqual([]);
  });
});

const LOCATION = Object.freeze({
  name: "Ana Pop", country: "DE", region: null, postalCode: "10115", city: "Berlin", street: null,
  ip: "198.51.100.7", ipCountry: "DE", company: null
});
const PROFILE = Object.freeze({
  email: "person@example.test", locale: "en", name: "Ana Pop", country: "DE", region: null,
  postalCode: "10115", city: "Berlin", street: null, company: null
});

function quote(taxCountry: string): QuoteRow {
  return {
    quoteId: QUOTE_ID, ownerRef: OWNER_REF, planId: "PLUS", kind: "SUBSCRIBE", netMicros: 20_000_000, taxMicros: 4_200_000,
    totalMicros: TOTAL, taxCountry, taxRegion: null, taxRateBasisPoints: 2_100, taxStatus: "TAXABLE", taxName: "VAT",
    quadernoRef: null, createdAt: PAID_AT, expiresAt: NOW, locationCiphertext: sealQuoteLocation(RECORDS_KEY, QUOTE_ID, LOCATION).ciphertext,
    keyId: "k1", recurringTotalMicros: null
  } as QuoteRow;
}

const INVOICE: InvoiceRow = Object.freeze({
  invoiceId: "4d3c2b1a-0f9e-4d8c-8b7a-6f5e4d3c2b1a", chargeId: CHARGE_ID, issuer: "SMARTBILL", kind: "INVOICE",
  externalRef: "doc-1", series: "DBT", number: "0001", url: null, totalMicros: TOTAL, at: PAID_AT
});

/** Invoice deps over one paid charge, invoiced already; any vendor call or invoice write throws. */
function invoiceDeps(recorded: ChargeRow & { events: ChargeEventRow[] }, taxCountry = "DE") {
  const { lines, audit } = recorder();
  return {
    lines,
    deps: {
      repository: only<never>({
        charge: async () => recorded,
        quote: async () => quote(taxCountry),
        customerByOwner: async () => ({ customerId: CUSTOMER_ID }),
        latestProfile: async () => ({
          profileCiphertext: sealBillingProfile(RECORDS_KEY, CUSTOMER_ID, PROFILE).ciphertext, keyId: "k1", at: PAID_AT, locale: "en"
        }),
        invoicesForOwner: async () => [INVOICE],
        subscriptionEvents: async () => []
      }, "repository"),
      jobs: only<never>({}, "jobs"), issuer: only<never>({}, "issuer"), tax: only<never>({}, "tax"),
      recipients: { currentAddress: async () => PROFILE.email },
      recordsKey: RECORDS_KEY, policy: testBillingPolicy, publicAppUrl: "https://debate.example.test", audit,
      xmoneyEnvironment: "live" as const
    }
  };
}

const creditJob = (kind: "QUADERNO_RECORD_REFUND" | "SMARTBILL_STORNO", transactionId: string, refundMicros: number, attempts = 1) =>
  job(kind, `${CHARGE_ID}:${transactionId}`, { charge_id: CHARGE_ID, transaction_id: transactionId, refund_micros: refundMicros }, attempts);

describe("P2-I5 (2) a credit note is issued only for a recorded refund, at its recorded amount", () => {
  const handlers: ReadonlyArray<readonly ["QUADERNO_RECORD_REFUND" | "SMARTBILL_STORNO", (deps: never) => OutboxHandler]> = [
    ["QUADERNO_RECORD_REFUND", createQuadernoRefundHandler as (deps: never) => OutboxHandler],
    ["SMARTBILL_STORNO", createSmartBillStornoHandler as (deps: never) => OutboxHandler]
  ];

  for (const [kind, create] of handlers) {
    it(`issues nothing for a forged ${kind} job of a payment never refunded, and waits for the refund`, async () => {
      // Only the payment is recorded: no REFUNDED row, so there is nothing to credit (yet).
      const { deps } = invoiceDeps(charge([event("SUCCEEDED", PAYMENT, TOTAL)]));
      const outcome = await create(deps as never)(creditJob(kind, PAYMENT, TOTAL), NOW);
      expect(outcome).toEqual({ kind: "RETRY", code: "CREDIT_NOTE_REFUND_MISSING", retryAt: new Date(NOW.getTime() + 60_000) });
    });

    it(`lets a forged ${kind} job die once its retries are spent, still issuing nothing`, async () => {
      const { deps } = invoiceDeps(charge([event("SUCCEEDED", PAYMENT, TOTAL)]));
      expect(await create(deps as never)(creditJob(kind, PAYMENT, TOTAL, 6), NOW))
        .toEqual({ kind: "RETRY", code: "CREDIT_NOTE_REFUND_MISSING", retryAt: null });
    });

    it(`issues nothing for a forged ${kind} job naming a duplicate payment's refund, which was never a sale`, async () => {
      const { deps } = invoiceDeps(charge([
        event("SUCCEEDED", PAYMENT, TOTAL), event("DUPLICATE_PAYMENT", SECOND_PAYMENT, TOTAL),
        event("REFUND_REQUESTED", SECOND_PAYMENT, TOTAL, "DUPLICATE_PAYMENT"), event("REFUNDED", SECOND_PAYMENT, TOTAL, "DUPLICATE_PAYMENT")
      ]));
      expect(await create(deps as never)(creditJob(kind, SECOND_PAYMENT, TOTAL), NOW))
        .toMatchObject({ kind: "RETRY", code: "CREDIT_NOTE_REFUND_MISSING" });
    });
  }

  it("credits the amount and the date of the REFUNDED row, never the payload's", async () => {
    const { deps } = invoiceDeps(charge([
      event("SUCCEEDED", PAYMENT, TOTAL), event("REFUND_REQUESTED", PAYMENT, 5_000_000, "WITHDRAWAL", REFUNDED_AT),
      event("REFUNDED", PAYMENT, 5_000_000, "WITHDRAWAL", REFUNDED_AT)
    ]));
    const context = await creditNoteContext(deps as never, creditJob("QUADERNO_RECORD_REFUND", PAYMENT, TOTAL), NOW, "QUADERNO");
    expect(context).not.toHaveProperty("kind");
    expect((context as CreditNoteContext).refund).toMatchObject({
      transactionId: PAYMENT, refundTotalMicros: 5_000_000, issuedOn: REFUNDED_AT
    });
  });

  for (const [kind, create] of handlers) {
    it(`sends a ${kind} job for a dashboard refund recorded on the payment itself to the owner, never at its upper bound`, async () => {
      // P9c: xMoney's read named no amount, so the row holds what was left of the payment (amountKnown=false).
      const { deps, lines } = invoiceDeps(charge([
        event("SUCCEEDED", PAYMENT, TOTAL), event("REFUND_REQUESTED", PAYMENT, TOTAL, "PROVIDER_REFUND", REFUNDED_AT),
        event("REFUNDED", PAYMENT, TOTAL, "PROVIDER_REFUND", REFUNDED_AT)
      ]));
      // The throwing fakes fail the test on any issuer call or intent write.
      expect(await create(deps as never)(creditJob(kind, PAYMENT, TOTAL), NOW)).toEqual({ kind: "DEAD", code: "CREDIT_NOTE_MANUAL" });
      expect(lines).toEqual([{
        event: "billing.invoice.unknown",
        fields: { issuer: kind === "QUADERNO_RECORD_REFUND" ? "QUADERNO" : "SMARTBILL", kind: "CREDIT_NOTE", code: "CREDIT_NOTE_MANUAL" }
      }]);
    });
  }

  it("still credits a voided payment automatically, at its REFUNDED row's amount (P9c's PROVIDER_VOID)", async () => {
    const { deps } = invoiceDeps(charge([
      event("SUCCEEDED", PAYMENT, TOTAL), event("REFUND_REQUESTED", PAYMENT, TOTAL, "PROVIDER_VOID", REFUNDED_AT),
      event("REFUNDED", PAYMENT, TOTAL, "PROVIDER_VOID", REFUNDED_AT)
    ]));
    const context = await creditNoteContext(deps as never, creditJob("QUADERNO_RECORD_REFUND", PAYMENT, TOTAL), NOW, "QUADERNO");
    expect((context as CreditNoteContext).refund).toMatchObject({ refundTotalMicros: TOTAL, issuedOn: REFUNDED_AT });
  });

  it("credits a refund xMoney reported as its own transaction, at that REFUNDED row's amount", async () => {
    // D5 5g: the REFUNDED row sits on the refund transaction and names the payment it refunds.
    const { deps } = invoiceDeps(charge([
      event("SUCCEEDED", PAYMENT, TOTAL), event("REFUND_REQUESTED", PAYMENT, 7_000_000, "PROVIDER_REFUND", REFUNDED_AT),
      event("REFUNDED", "61009", 7_000_000, "PROVIDER_REFUND", REFUNDED_AT, PAYMENT)
    ]));
    const context = await creditNoteContext(deps as never, creditJob("QUADERNO_RECORD_REFUND", PAYMENT, TOTAL), NOW, "QUADERNO");
    expect((context as CreditNoteContext).refund).toMatchObject({ refundTotalMicros: 7_000_000, issuedOn: REFUNDED_AT });
  });
});
