import { describe, expect, it, vi } from "vitest";
import { paymentError, type PaymentReport, type PaymentState } from "@debateai/billing-core";
import type { BillingRepository, ChargeEventRow, ChargeKind, DueStatusRead, StatusReadCursor } from "@debateai/db";
import type { BillingAuditEvent, BillingAuditField } from "../../apps/api/src/billing/audit.js";
import {
  BillingReconciler, hostedChargeLapsed, statusNeedsVerify, statusReadsPerPass
} from "../../apps/api/src/billing/reconcile.js";

const NOW = new Date(Date.UTC(2026, 9, 7, 12));
const HOUR = 3_600_000;
const STATUS: Readonly<Record<PaymentState, string>> = Object.freeze({
  PENDING: "1", AUTHORIZED: "2", PAID: "3", VOIDED: "4", REFUNDED: "8", CHARGEBACK_OPENED: "9", CHARGEBACK_LOST: "10",
  FAILED: "11", DECLINED: "12", ACTION_REQUIRED: "15", CHARGEBACK_REPRESENTED: "16", UNCLEAR: "17", EXPIRED: "23"
});

function report(orderId: string, state: PaymentState, providerStatus = STATUS[state]): PaymentReport {
  return Object.freeze({
    orderId, providerPaymentId: "ntp-1", state, providerStatus, amountMicros: 24_200_000, currency: "USD", cardCountry: "RO",
    savedCard: null, declineCode: null, declineSide: null, bankDeclined: false, occurredAt: null, clientId: null
  });
}
const event = (kind: ChargeEventRow["kind"], errorCode: string | null = null, amountMicros: number | null = null) =>
  ({ kind, errorCode, amountMicros, providerPaymentId: "ntp-1" }) as unknown as ChargeEventRow;
const charge = (kind: ChargeKind, events: ReadonlyArray<ChargeEventRow>, totalMicros = 24_200_000) => ({ kind, totalMicros, events });
const SENT = [event("REQUESTED"), event("SUBMITTED")];
const PAID = [...SENT, event("SUCCEEDED", null, 24_200_000)];

describe("N16 what a status read decides (spec §2.14)", () => {
  it("queues VERIFY_PAYMENT exactly when the status says something our rows do not record", () => {
    const cases: Array<[string, ReturnType<typeof charge>, PaymentState, boolean]> = [
      ["paid, not recorded", charge("INITIAL", SENT), "PAID", true],
      ["paid, recorded", charge("INITIAL", PAID), "PAID", false],
      ["paid check closed CARD_NOT_SAVED", charge("CARD_CHECK", [...SENT, event("FAILED", "CARD_NOT_SAVED")], 0), "PAID", false],
      ["0 check authorised", charge("CARD_CHECK", SENT, 0), "AUTHORIZED", true],
      ["upgrade authorised", charge("UPGRADE", SENT), "AUTHORIZED", false],
      ["declined, not recorded", charge("UPGRADE", [...SENT, event("FAILED", "NO_TRANSACTION")].map((row, index) =>
        index === 2 ? ({ ...row, providerPaymentId: null }) as ChargeEventRow : row)), "DECLINED", true],
      ["declined, recorded", charge("UPGRADE", [...SENT, event("FAILED", "PAYMENT_DECLINED")]), "DECLINED", false],
      ["renewal asks for the bank's check", charge("RENEWAL", SENT), "ACTION_REQUIRED", true],
      ["checkout at the bank's check", charge("INITIAL", SENT), "ACTION_REQUIRED", false],
      ["voided after payment", charge("INITIAL", PAID), "VOIDED", true],
      ["voided and refunded", charge("INITIAL", [...PAID, event("REFUNDED", null, 24_200_000)]), "VOIDED", false],
      ["refunded, nothing recorded", charge("INITIAL", PAID), "REFUNDED", true],
      ["refunded and recorded", charge("INITIAL", [...PAID, event("REFUND_REQUESTED", "WITHDRAWAL", 24_200_000),
        event("REFUNDED", null, 24_200_000)]), "REFUNDED", false],
      ["refunded, owner refund still open", charge("INITIAL", [...PAID, event("REFUND_REQUESTED", "WITHDRAWAL", 20_000_000),
        event("REFUNDED", null, 10_000_000)]), "REFUNDED", true],
      ["charge-back opened", charge("INITIAL", PAID), "CHARGEBACK_OPENED", true],
      ["charge-back recorded", charge("INITIAL", [...PAID, event("CHARGEBACK", null, 24_200_000)]), "CHARGEBACK_OPENED", false],
      ["dispute lost, not decided", charge("INITIAL", [...PAID, event("CHARGEBACK", null, 24_200_000)]), "CHARGEBACK_LOST", true],
      ["dispute lost, decided", charge("INITIAL", [...PAID, event("CHARGEBACK"), event("CHARGEBACK_RESOLVED", "LOST")]), "CHARGEBACK_LOST", false],
      ["represented, recorded", charge("INITIAL", [...PAID, event("CHARGEBACK"), event("CHARGEBACK_REPRESENTED")]), "CHARGEBACK_REPRESENTED", false],
      ["unclear", charge("INITIAL", PAID), "UNCLEAR", true],
      ["pending", charge("INITIAL", SENT), "PENDING", false]
    ];
    for (const [label, row, state, expected] of cases) expect(statusNeedsVerify(row, report("o", state)), label).toBe(expected);
  });

  it("closes an unpaid upgrade after its quote's lifetime and a checkout or card check after 24 hours, never one on its way", () => {
    const base = { schedule: "OPEN" as const, events: SENT, now: NOW, quoteExpiresAt: null };
    const old = new Date(NOW.getTime() - 25 * HOUR);
    expect(hostedChargeLapsed({ ...base, kind: "UPGRADE", createdAt: NOW, quoteExpiresAt: new Date(NOW.getTime() - 1), answer: report("o", "PENDING") })).toBe(true);
    expect(hostedChargeLapsed({ ...base, kind: "UPGRADE", createdAt: NOW, quoteExpiresAt: new Date(NOW.getTime() + 1), answer: report("o", "PENDING") })).toBe(false);
    expect(hostedChargeLapsed({ ...base, kind: "UPGRADE", createdAt: NOW, quoteExpiresAt: new Date(NOW.getTime() - 1), answer: "NO_SUCH_ORDER" })).toBe(true);
    expect(hostedChargeLapsed({ ...base, kind: "CARD_CHECK", createdAt: old, answer: report("o", "PENDING") })).toBe(true);
    expect(hostedChargeLapsed({ ...base, kind: "INITIAL", createdAt: old, answer: report("o", "DECLINED") })).toBe(true);
    expect(hostedChargeLapsed({ ...base, kind: "CARD_CHECK", createdAt: new Date(NOW.getTime() - 23 * HOUR), answer: report("o", "PENDING") })).toBe(false);
    for (const status of ["6", "13", "14", "18"]) {
      expect(hostedChargeLapsed({ ...base, kind: "INITIAL", createdAt: old, answer: report("o", "PENDING", status) }), status).toBe(false);
    }
    expect(hostedChargeLapsed({ ...base, kind: "INITIAL", createdAt: old, answer: report("o", "PAID") })).toBe(false);
    expect(hostedChargeLapsed({ ...base, kind: "INITIAL", createdAt: old, events: [...SENT, event("FAILED", "PAYMENT_DECLINED")], answer: report("o", "PENDING") })).toBe(false);
    expect(hostedChargeLapsed({ ...base, kind: "INITIAL", createdAt: old, schedule: "CLOSED", answer: report("o", "PENDING") })).toBe(false);
    expect(hostedChargeLapsed({ ...base, kind: "RENEWAL", createdAt: old, answer: "NO_SUCH_ORDER" })).toBe(false);
  });
});

describe("N16 the frequent status pass (spec §2.14, SR-21)", () => {
  it("reads at most 200 a pass after the cursor, isolates a failed read, queues, closes, and kicks once", async () => {
    expect(statusReadsPerPass()).toBe(200);
    const due = (chargeId: string, kind: ChargeKind, hoursOld: number): DueStatusRead => Object.freeze({
      chargeId, ownerRef: "5b0f2b1e-0d6c-4f1a-9a37-2f4f3c8e1a01", subscriptionId: "6c1f3c2f-1e7d-4a2b-8b48-3a5a4d9f2b02",
      kind, quoteId: null, createdAt: new Date(NOW.getTime() - hoursOld * HOUR), totalMicros: kind === "CARD_CHECK" ? 0 : 24_200_000,
      schedule: "OPEN", dueAt: new Date(NOW.getTime() - HOUR), providerPaymentId: "ntp-1"
    });
    const pages: Array<Readonly<{ rows: ReadonlyArray<DueStatusRead>; next: StatusReadCursor | null }>> = [
      { rows: [due("a".repeat(32), "INITIAL", 1), due("b".repeat(32), "INITIAL", 1), due("c".repeat(32), "CARD_CHECK", 25)],
        next: { dueAt: new Date(NOW.getTime() - HOUR), chargeId: "c".repeat(32) } },
      { rows: [], next: null }
    ];
    const asked: Array<[StatusReadCursor | null, number, string]> = [];
    const written: string[] = [];
    const reads: string[] = [];
    const audit = Object.assign(vi.fn((event: BillingAuditEvent, fields: Readonly<Record<string, BillingAuditField>>) => {
      written.push(`${event}:${JSON.stringify(fields)}`);
    }), {});
    const kick = vi.fn();
    const billing = {
      withTransaction: async <T>(work: (client: object) => Promise<T>) => work({}),
      insertStatusRead: async (_client: object, row: { chargeId: string; outcome: string }) => { reads.push(`${row.chargeId.slice(0, 1)}:${row.outcome}`); },
      enqueue: async (_client: object, job: { kind: string; ref: string }) => { written.push(`enqueue:${job.kind}:${job.ref.slice(0, 1)}`); return "job"; },
      charge: async (chargeId: string) => ({ chargeId, kind: chargeId.startsWith("c") ? "CARD_CHECK" : "INITIAL", totalMicros: 0, events: SENT }),
      appendChargeEvent: async (_client: object, row: { chargeId: string; kind: string; errorCode: string | null }) => {
        written.push(`event:${row.chargeId.slice(0, 1)}:${row.kind}:${row.errorCode ?? ""}`);
        return "INSERTED";
      },
      quote: async () => null
    } as unknown as BillingRepository;
    const payments = {
      status: async (input: { orderId: string }) => {
        if (input.orderId.startsWith("a")) return report(input.orderId, "PAID");
        if (input.orderId.startsWith("b")) throw paymentError("PAYMENT_PROVIDER_UNAVAILABLE");
        return report(input.orderId, "PENDING");
      }
    };
    const reconciler = new BillingReconciler({
      billing, jobs: { lockOwner: async () => undefined, withSubscriptionLease: async () => ({ kind: "BUSY" as const }) },
      audit, clock: () => NOW, kick,
      netopia: {
        payments, paymentEnvironment: "sandbox", pool: { query: async () => ({ rows: [] }) } as never,
        jobs: {
          dueStatusReads: async (_executor, _now, cursor, limit, environment) => {
            asked.push([cursor, limit, environment]);
            return pages[asked.length - 1]!;
          },
          bringForward: async () => true
        }
      }
    });
    expect(await reconciler.runStatusChecks(NOW)).toEqual({ read: 3, queued: 1, closed: 1, failed: 1 });
    expect(await reconciler.runStatusChecks(NOW)).toEqual({ read: 0, queued: 0, closed: 0, failed: 0 });
    expect(asked).toEqual([[null, 200, "sandbox"], [pages[0]!.next, 200, "sandbox"]]);
    expect(reads).toEqual(["a:PAID", "b:PAYMENT_PROVIDER_UNAVAILABLE", "c:PENDING"]);
    expect(written).toContain("enqueue:VERIFY_PAYMENT:a");
    expect(written).toContain(`billing.reconcile.status_failed:${JSON.stringify({ code: "PAYMENT_PROVIDER_UNAVAILABLE" })}`);
    expect(written).toContain("event:c:FAILED:NO_TRANSACTION");
    expect(written.some((line) => line.startsWith("event:a") || line.startsWith("event:b"))).toBe(false);
    expect(kick).toHaveBeenCalledTimes(1);
  });
});
