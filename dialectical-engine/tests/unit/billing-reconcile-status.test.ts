import { describe, expect, it, vi } from "vitest";
import { TypedDomainError } from "@debateai/kernel";
import type { SubscriptionEvent } from "@debateai/billing-core";
import type { ChargeEventInput, ChargeEventKind, ChargeEventRow, ChargeRow } from "@debateai/db";
import type { XMoneyStatus, XMoneyTransactionListQuery } from "@debateai/payments-xmoney";
import type { BillingAuditEvent, BillingAuditField } from "../../apps/api/src/billing/audit.js";
import { BillingReconciler, expectedChargeEventKinds, transactionSettled } from "../../apps/api/src/billing/reconcile.js";

describe("P14a what a listed transaction should already have left in our rows", () => {
  it("names the final kinds per status, and nothing for a payment still in flight", () => {
    const cases: Array<[XMoneyStatus, readonly string[] | null]> = [
      ["start", null], ["in-progress", null], ["3d-pending", null],
      // D5 5f: a second payment of an order already paid is recorded as DUPLICATE_PAYMENT (and refunded).
      ["complete-ok", ["SUCCEEDED", "DUPLICATE_PAYMENT"]], ["complete-failed", ["FAILED"]], ["refund-ok", ["REFUNDED"]],
      ["void-ok", ["FAILED", "REFUNDED"]], ["cancel-ok", ["FAILED", "REFUNDED"]], ["charge-back", ["CHARGEBACK"]]
    ];
    for (const [status, kinds] of cases) {
      expect(expectedChargeEventKinds({ status, transactionType: "deposit" }), status).toEqual(kinds);
    }
    expect(expectedChargeEventKinds({ status: "complete-ok", transactionType: "chargeback" })).toEqual(["CHARGEBACK"]);
    expect(expectedChargeEventKinds({ status: "complete-ok", transactionType: "representment" }))
      .toEqual(["CHARGEBACK_REPRESENTED"]);
  });

  it("never reads a refund transaction as a payment, whatever status xMoney reports (D5 5g)", () => {
    const refund = (status: XMoneyStatus) => expectedChargeEventKinds({ status, transactionType: "refund" });
    expect(refund("complete-ok")).toEqual(["REFUNDED"]);
    expect(refund("refund-ok")).toEqual(["REFUNDED"]);
    for (const status of ["start", "in-progress", "3d-pending", "complete-failed", "void-ok", "cancel-ok", "charge-back"] as const) {
      expect(refund(status), status).toBeNull();
    }
  });

  it("counts a second payment recorded as DUPLICATE_PAYMENT, and a refund by its own REFUNDED or its payment's", () => {
    const recorded = new Map<string, ReadonlySet<ChargeEventKind>>([
      ["71", new Set<ChargeEventKind>(["DUPLICATE_PAYMENT"])],
      ["72", new Set<ChargeEventKind>(["SUCCEEDED", "REFUNDED"])],
      ["73", new Set<ChargeEventKind>(["SUCCEEDED"])]
    ]);
    const payment = { transactionId: "71", status: "complete-ok" as const, transactionType: "deposit", relatedTransactionIds: [] };
    expect(transactionSettled(payment, recorded)).toBe(true);
    expect(transactionSettled({ ...payment, transactionId: "79" }, recorded)).toBe(false);
    const refund = { transactionId: "80", status: "complete-ok" as const, transactionType: "refund", relatedTransactionIds: ["72"] };
    expect(transactionSettled(refund, recorded)).toBe(true);
    // Its payment was never refunded on our side: VERIFY_PAYMENT has to look at it.
    expect(transactionSettled({ ...refund, relatedTransactionIds: ["73"] }, recorded)).toBe(false);
    // A payment is never settled by what its "related" transactions hold.
    expect(transactionSettled({ ...payment, transactionId: "79", relatedTransactionIds: ["72"] }, recorded)).toBe(false);
  });

  it("settles a dispute reported as its own transaction by the CHARGEBACK of the payment it names (P2-I2)", () => {
    const recorded = new Map<string, ReadonlySet<ChargeEventKind>>([
      ["81", new Set<ChargeEventKind>(["SUCCEEDED", "CHARGEBACK"])],
      ["82", new Set<ChargeEventKind>(["SUCCEEDED"])],
      ["83", new Set<ChargeEventKind>(["SUCCEEDED", "CHARGEBACK", "CHARGEBACK_RESOLVED"])]
    ]);
    const dispute = { transactionId: "90", status: "charge-back" as const, transactionType: "chargeback", relatedTransactionIds: ["81"] };
    expect(transactionSettled(dispute, recorded)).toBe(true);
    // A dispute already won stays settled: its payment's CHARGEBACK is still there.
    expect(transactionSettled({ ...dispute, relatedTransactionIds: ["83"] }, recorded)).toBe(true);
    // The payment it names holds no CHARGEBACK yet: VERIFY_PAYMENT records it.
    expect(transactionSettled({ ...dispute, relatedTransactionIds: ["82"] }, recorded)).toBe(false);
    expect(transactionSettled({ ...dispute, relatedTransactionIds: [] }, recorded)).toBe(false);
    // Reported `complete-ok`, a dispute is still never a payment: no SUCCEEDED settles it, only its payment's CHARGEBACK.
    const complete = { ...dispute, status: "complete-ok" as const, relatedTransactionIds: ["82"] };
    expect(transactionSettled(complete, new Map([["90", new Set<ChargeEventKind>(["SUCCEEDED"])], ...recorded]))).toBe(false);
    expect(transactionSettled({ ...complete, relatedTransactionIds: ["81"] }, recorded)).toBe(true);
    // Every type that is neither a payment, a refund nor a representment takes the same route (`credit`, an unknown one).
    for (const transactionType of ["credit", "something-new"]) {
      expect(transactionSettled({ ...dispute, transactionType }, recorded), transactionType).toBe(true);
      expect(transactionSettled({ ...dispute, transactionType, relatedTransactionIds: ["82"] }, recorded), transactionType).toBe(false);
    }
  });

  it("expects a CHARGEBACK for a dispute transaction only once it is final and happened (P2-I2)", () => {
    const dispute = (status: XMoneyStatus, transactionType = "chargeback") => expectedChargeEventKinds({ status, transactionType });
    for (const status of ["charge-back", "complete-ok", "refund-ok"] as const) expect(dispute(status), status).toEqual(["CHARGEBACK"]);
    // Still in flight, or a dispute that failed or was withdrawn: nothing of ours is expected.
    for (const status of ["start", "in-progress", "3d-pending", "complete-failed", "void-ok", "cancel-ok"] as const) {
      expect(dispute(status), status).toBeNull();
    }
    expect(dispute("complete-ok", "credit")).toEqual(["CHARGEBACK"]);
    // A payment is a deposit, or a transaction xMoney gives no type.
    expect(expectedChargeEventKinds({ status: "complete-ok", transactionType: null })).toEqual(["SUCCEEDED", "DUPLICATE_PAYMENT"]);
  });

  it("runs the full pass once a day and the frequent adoption pass on the ticks between", async () => {
    let now = new Date("2026-10-10T00:00:00.000Z");
    const reconciler = new BillingReconciler({
      billing: {} as never, jobs: {} as never, xmoney: {} as never, environment: "stage", audit: () => undefined,
      clock: () => now, kick: () => undefined
    });
    const daily = vi.spyOn(reconciler, "runDaily").mockResolvedValue({
      listed: 0, enqueued: 0, adopted: 0, failed: 0, uncertain: false, deadRefunds: 0, expired: 0, rejected: 0,
      refusedListings: []
    });
    const adoption = vi.spyOn(reconciler, "runAdoption").mockResolvedValue({ adopted: 0, failed: 0, rejected: 0 });
    await reconciler.tick();
    now = new Date(now.getTime() + 10 * 60_000);
    await reconciler.tick();
    now = new Date(now.getTime() + 24 * 3_600_000);
    await reconciler.tick();
    expect(daily).toHaveBeenCalledTimes(2);
    expect(adoption).toHaveBeenCalledTimes(1);
    expect(adoption).toHaveBeenCalledWith(expect.any(Date), "FREQUENT");
  });

  it("keeps the frequent adoption pass running while the daily pass keeps failing, and retries the daily one hourly", async () => {
    let now = new Date("2026-10-10T00:00:00.000Z");
    const reconciler = new BillingReconciler({
      billing: {} as never, jobs: {} as never, xmoney: {} as never, environment: "stage", audit: () => undefined,
      clock: () => now, kick: () => undefined
    });
    // A pass that fails as a whole (the database did not answer); W13 keeps a refused listing from doing this.
    const daily = vi.spyOn(reconciler, "runDaily").mockRejectedValue(new Error("DATABASE_UNAVAILABLE"));
    const adoption = vi.spyOn(reconciler, "runAdoption").mockResolvedValue({ adopted: 0, failed: 0, rejected: 0 });
    // The daily error still reaches the single-flight (BILLING_RECONCILIATION_PENDING), after the frequent pass ran.
    await expect(reconciler.tick()).rejects.toThrow("DATABASE_UNAVAILABLE");
    expect(daily).toHaveBeenCalledTimes(1);
    expect(adoption).toHaveBeenCalledTimes(1);
    expect(adoption).toHaveBeenLastCalledWith(expect.any(Date), "FREQUENT");
    // Ten minutes on: inside the retry backoff, only the frequent pass.
    now = new Date(now.getTime() + 10 * 60_000);
    await reconciler.tick();
    expect(daily).toHaveBeenCalledTimes(1);
    expect(adoption).toHaveBeenCalledTimes(2);
    // More than an hour after the failed attempt: the daily pass is tried again (and adoption runs once more).
    now = new Date(now.getTime() + 55 * 60_000);
    await expect(reconciler.tick()).rejects.toThrow("DATABASE_UNAVAILABLE");
    expect(daily).toHaveBeenCalledTimes(2);
    expect(adoption).toHaveBeenCalledTimes(3);
    // Once it completes, the next daily pass is a day later.
    daily.mockResolvedValue({
      listed: 0, enqueued: 0, adopted: 0, failed: 0, uncertain: false, deadRefunds: 0, expired: 0, rejected: 0,
      refusedListings: []
    });
    now = new Date(now.getTime() + 61 * 60_000);
    await reconciler.tick();
    expect(daily).toHaveBeenCalledTimes(3);
    now = new Date(now.getTime() + 2 * 3_600_000);
    await reconciler.tick();
    expect(daily).toHaveBeenCalledTimes(3);
    expect(adoption).toHaveBeenCalledTimes(4);
  });
});

type AuditLine = { event: BillingAuditEvent; fields: Readonly<Record<string, BillingAuditField>> };

function subscriptionEventAt(
  subscriptionId: string, kind: SubscriptionEvent["kind"], at: Date, xmoneyOrderId: string | null
): SubscriptionEvent {
  return Object.freeze({
    eventId: `${subscriptionId}-${kind}`, subscriptionId, ownerRef: `owner-${subscriptionId}`, kind, at, planId: "PLUS",
    periodAnchorAt: null, xmoneyOrderId, xmoneyCustomerId: null, cardRef: null,
    data: Object.freeze({ xmoney_environment: "stage" })
  }) as SubscriptionEvent;
}

/** An open charge (UPGRADE unless named) with only its REQUESTED event. */
function openUpgrade(
  chargeId: string, subscriptionId: string, createdAt: Date, kind: ChargeRow["kind"] = "UPGRADE"
): ChargeRow & { events: ChargeEventRow[] } {
  return Object.freeze({
    chargeId, ownerRef: `owner-${subscriptionId}`, subscriptionId, kind, attempt: 1,
    periodStart: createdAt, periodEnd: new Date(createdAt.getTime() + 30 * 86_400_000), quoteId: "q",
    netMicros: 7_000_000, taxMicros: 0, totalMicros: 7_000_000, currency: "USD", createdAt, xmoneyEnvironment: "stage",
    events: [Object.freeze({
      eventId: `${chargeId}-requested`, chargeId, kind: "REQUESTED", at: createdAt, xmoneyTransactionId: null,
      amountMicros: 7_000_000, errorCode: null, xmoneyEnvironment: "stage", refundsTransactionId: null
    })] as ChargeEventRow[]
  }) as ChargeRow & { events: ChargeEventRow[] };
}

/**
 * The reconciler over stubbed repositories: `charges` are both the adoption candidates and what `charge()` reads back,
 * `histories` each subscription's events (a function may throw), `list` the fake xMoney listing.
 */
function stubbedReconciler(input: Readonly<{
  now: Date;
  charges?: ReadonlyArray<ChargeRow & { events: ChargeEventRow[] }>;
  stale?: ReadonlyArray<ChargeRow & { events: ChargeEventRow[] }>;
  histories?: ReadonlyMap<string, () => Promise<SubscriptionEvent[]>>;
  list?: (query: XMoneyTransactionListQuery) => Promise<never[]>;
  lockOwner?: (ownerRef: string) => Promise<void>;
  /** A moving clock, for the tick tests; `now` otherwise. */
  clock?: () => Date;
}>) {
  const audit: AuditLine[] = [];
  const appended: ChargeEventInput[] = [];
  const charges = input.charges ?? [];
  const billing = {
    adoptionCandidates: async () => [...charges],
    unsettledCharges: async () => [...(input.stale ?? [])],
    subscriptionEvents: async (subscriptionId: string) => {
      const history = input.histories?.get(subscriptionId);
      return history === undefined ? [] : history();
    },
    chargeEventKindsByTransaction: async () => new Map(),
    withTransaction: async <T>(use: (client: never) => Promise<T>) => use({} as never),
    charge: async (chargeId: string) =>
      [...charges, ...(input.stale ?? [])].find((charge) => charge.chargeId === chargeId) ?? null,
    appendChargeEvent: async (_client: unknown, row: ChargeEventInput) => { appended.push(row); return "INSERTED" as const; },
    enqueue: async () => undefined,
    deadRefunds: async () => [],
    longUnsettledCharges: async () => []
  };
  const jobs = {
    withSubscriptionLease: async <T>(_subscriptionId: string, use: (client: never) => Promise<T>) =>
      ({ kind: "RAN" as const, value: await use({} as never) }),
    lockOwner: async (_client: unknown, ownerRef: string) => input.lockOwner?.(ownerRef)
  };
  const xmoney = {
    listTransactions: input.list ?? (async () => []),
    getOrder: async (orderId: string) => ({ orderId, externalOrderId: null })
  };
  const reconciler = new BillingReconciler({
    billing: billing as never, jobs: jobs as never, xmoney: xmoney as never, environment: "stage",
    audit: (event, fields) => { audit.push({ event, fields }); }, clock: input.clock ?? (() => input.now),
    kick: () => undefined
  });
  return { reconciler, audit, appended };
}

describe("P14a one charge that throws never stops the pass for the others", () => {
  it("skips a charge whose history does not fold, still settles the next one, and writes one content-free errors line", async () => {
    const now = new Date("2026-10-10T12:00:00.000Z");
    // The older candidate: its subscription's history is a lone ACTIVATED dated before the charge (D5 5d), which
    // P11a's ordersHoldingCharge folds and foldSubscription refuses (BILLING_SUBSCRIPTION_EVENTS_INVALID).
    const older = openUpgrade("a".repeat(32), "sub-old", new Date(now.getTime() - 50 * 60_000));
    // The younger one: REQUESTED 40 minutes ago, nothing on its order.
    const younger = openUpgrade("b".repeat(32), "sub-young", new Date(now.getTime() - 40 * 60_000));
    const histories = new Map<string, () => Promise<SubscriptionEvent[]>>([
      ["sub-old", async () => [subscriptionEventAt("sub-old", "ACTIVATED", new Date(now.getTime() - 2 * 86_400_000), "501")]],
      ["sub-young", async () => [subscriptionEventAt("sub-young", "CREATED", new Date(now.getTime() - 5 * 86_400_000), "502")]]
    ]);
    const { reconciler, audit, appended } = stubbedReconciler({ now, charges: [older, younger], histories });
    await expect(reconciler.runAdoption(now, "FREQUENT")).resolves.toEqual({ adopted: 0, failed: 1, rejected: 0 });
    expect(appended.map((row) => [row.chargeId, row.kind, row.errorCode])).toEqual([[younger.chargeId, "FAILED", "NO_TRANSACTION"]]);
    expect(audit).toContainEqual({
      event: "billing.reconcile.errors", fields: { pass: "FREQUENT", count: 1, codes: "BILLING_SUBSCRIPTION_EVENTS_INVALID" }
    });
    // Content-free: no id of the charge that threw reaches any line.
    expect(JSON.stringify(audit)).not.toContain(older.chargeId);
    expect(JSON.stringify(audit)).not.toContain("sub-old");
  });

  it("skips a stale checkout charge whose owner lock fails, still fails the others, and completes the daily pass", async () => {
    const now = new Date("2026-10-10T12:00:00.000Z");
    const locked = openUpgrade("c".repeat(32), "sub-locked", new Date(now.getTime() - 26 * 3_600_000), "INITIAL");
    const free = openUpgrade("d".repeat(32), "sub-free", new Date(now.getTime() - 25 * 3_600_000), "INITIAL");
    const created = (subscriptionId: string) => async () =>
      [subscriptionEventAt(subscriptionId, "CREATED", new Date(now.getTime() - 5 * 86_400_000), "503")];
    const histories = new Map<string, () => Promise<SubscriptionEvent[]>>([
      ["sub-locked", created("sub-locked")], ["sub-free", created("sub-free")]
    ]);
    const { reconciler, audit, appended } = stubbedReconciler({
      now, stale: [locked, free], histories,
      // The owner lock's 10 s lock_timeout, as PostgreSQL raises it (SQLSTATE 55P03), for the first owner only.
      lockOwner: async (ownerRef) => {
        if (ownerRef === locked.ownerRef) throw Object.assign(new Error("canceling statement due to lock timeout"), { code: "55P03" });
      }
    });
    const report = await reconciler.runDaily(now);
    expect(report.failed).toBe(1);
    expect(appended.map((row) => [row.chargeId, row.kind])).toEqual([[free.chargeId, "FAILED"]]);
    expect(audit).toContainEqual({ event: "billing.reconcile.errors", fields: { pass: "CHECKOUT", count: 1, codes: "55P03" } });
  });
});

describe("P14a a refused xMoney key (D5 5i)", () => {
  const refused = () => new TypedDomainError("XMONEY_CREDENTIALS_REFUSED", "fake: 401");

  it("raises the operator alarm with exactly {operation: 'list'} on a daily listing, and that listing's own failure line", async () => {
    const now = new Date("2026-10-10T12:00:00.000Z");
    const { reconciler, audit } = stubbedReconciler({
      now, list: async (query) => { if (query.dateType === "creation") throw refused(); return []; }
    });
    // W13 (P2-I18): the refused listing no longer throws the pass away; it is named in the report and its own line.
    await expect(reconciler.runDaily(now)).resolves.toMatchObject({ refusedListings: ["creation"] });
    expect(audit.filter((line) => line.event === "billing.xmoney.credentials_refused"))
      .toEqual([{ event: "billing.xmoney.credentials_refused", fields: { operation: "list" } }]);
    expect(audit.filter((line) => line.event === "billing.reconcile.listing_failed"))
      .toEqual([{ event: "billing.reconcile.listing_failed", fields: { listing: "creation", code: "XMONEY_CREDENTIALS_REFUSED" } }]);
  });

  it("raises the same alarm on an adoption look-up and leaves the charge as it is", async () => {
    const now = new Date("2026-10-10T12:00:00.000Z");
    const waiting = openUpgrade("e".repeat(32), "sub-refused", new Date(now.getTime() - 40 * 60_000));
    const histories = new Map<string, () => Promise<SubscriptionEvent[]>>([
      ["sub-refused", async () => [subscriptionEventAt("sub-refused", "CREATED", new Date(now.getTime() - 5 * 86_400_000), "504")]]
    ]);
    const { reconciler, audit, appended } = stubbedReconciler({
      now, charges: [waiting], histories, list: async () => { throw refused(); }
    });
    await expect(reconciler.runAdoption(now, "FREQUENT")).resolves.toEqual({ adopted: 0, failed: 0, rejected: 0 });
    expect(appended).toEqual([]);
    expect(audit).toEqual([{ event: "billing.xmoney.credentials_refused", fields: { operation: "list" } }]);
  });
});

describe("W13 the three daily listings run independently (P2-I18)", () => {
  const refusedListing = () => new TypedDomainError("XMONEY_REFUSED", "fake: this dateType is refused");

  it("reads the other two listings when one is refused, and names each refused listing in its own line", async () => {
    const now = new Date("2026-10-10T12:00:00.000Z");
    const asked: string[] = [];
    const { reconciler, audit } = stubbedReconciler({
      now, list: async (query) => {
        asked.push(query.dateType ?? "none");
        if (query.dateType === "charge-back" || query.dateType === "refund") throw refusedListing();
        return [];
      }
    });
    const report = await reconciler.runDaily(now);
    expect(asked).toEqual(["creation", "charge-back", "refund"]);
    expect(report.refusedListings).toEqual(["charge-back", "refund"]);
    expect(audit.filter((line) => line.event === "billing.reconcile.listing_failed")).toEqual([
      { event: "billing.reconcile.listing_failed", fields: { listing: "charge-back", code: "XMONEY_REFUSED" } },
      { event: "billing.reconcile.listing_failed", fields: { listing: "refund", code: "XMONEY_REFUSED" } }
    ]);
    // A refused key is not a listing refusal: no credentials alarm here.
    expect(audit.some((line) => line.event === "billing.xmoney.credentials_refused")).toBe(false);
  });

  it("fails no checkout charge while the creation listing is refused", async () => {
    const now = new Date("2026-10-10T12:00:00.000Z");
    const stale = openUpgrade("f".repeat(32), "sub-stale", new Date(now.getTime() - 25 * 3_600_000), "INITIAL");
    const histories = new Map<string, () => Promise<SubscriptionEvent[]>>([
      ["sub-stale", async () => [subscriptionEventAt("sub-stale", "CREATED", new Date(now.getTime() - 5 * 86_400_000), "505")]]
    ]);
    const { reconciler, audit, appended } = stubbedReconciler({
      now, stale: [stale], histories,
      list: async (query) => { if (query.dateType === "creation") throw refusedListing(); return []; }
    });
    const report = await reconciler.runDaily(now);
    // Without the creation listing a paid checkout cannot be told from an abandoned one: nothing is failed.
    expect(report).toMatchObject({ failed: 0, refusedListings: ["creation"] });
    expect(appended).toEqual([]);
    expect(audit).toContainEqual({ event: "billing.reconcile.listing_failed", fields: { listing: "creation", code: "XMONEY_REFUSED" } });
    // The day the creation listing is read again, the same charge is failed as before.
    const next = stubbedReconciler({ now, stale: [stale], histories });
    expect((await next.reconciler.runDaily(now)).failed).toBe(1);
    expect(next.appended.map((row) => [row.chargeId, row.kind, row.errorCode])).toEqual([[stale.chargeId, "FAILED", "NO_TRANSACTION"]]);
  });

  it("retries only the refused listing hourly, beside the frequent pass, and keeps the full pass daily", async () => {
    let now = new Date("2026-10-10T00:00:00.000Z");
    let chargeBackRefused = true;
    const asked: string[] = [];
    const { reconciler, audit } = stubbedReconciler({
      now, clock: () => now, list: async (query) => {
        asked.push(query.dateType ?? "none");
        if (query.dateType === "charge-back" && chargeBackRefused) throw refusedListing();
        return [];
      }
    });
    const adoption = vi.spyOn(reconciler, "runAdoption");
    const failedLines = () => audit.filter((line) => line.event === "billing.reconcile.listing_failed").length;

    expect((await reconciler.tick()).refusedListings).toEqual(["charge-back"]);
    expect(asked.splice(0)).toEqual(["creation", "charge-back", "refund"]);
    expect(adoption).toHaveBeenLastCalledWith(expect.any(Date), "DAILY");
    expect(failedLines()).toBe(1);
    // Ten minutes on: inside the hour, only the frequent adoption pass.
    now = new Date(now.getTime() + 10 * 60_000);
    expect((await reconciler.tick()).refusedListings).toEqual([]);
    expect(asked.splice(0)).toEqual([]);
    expect(adoption).toHaveBeenLastCalledWith(expect.any(Date), "FREQUENT");
    // An hour after the attempt: the refused listing alone is tried again, and fails again with its own line.
    now = new Date(now.getTime() + 51 * 60_000);
    expect((await reconciler.tick()).refusedListings).toEqual(["charge-back"]);
    expect(asked.splice(0)).toEqual(["charge-back"]);
    expect(adoption).toHaveBeenLastCalledWith(expect.any(Date), "FREQUENT");
    expect(failedLines()).toBe(2);
    // xMoney accepts it again: the next hourly retry reads it, and no retry follows.
    chargeBackRefused = false;
    now = new Date(now.getTime() + 61 * 60_000);
    expect((await reconciler.tick()).refusedListings).toEqual([]);
    expect(asked.splice(0)).toEqual(["charge-back"]);
    now = new Date(now.getTime() + 61 * 60_000);
    await reconciler.tick();
    expect(asked.splice(0)).toEqual([]);
    expect(failedLines()).toBe(2);
    // The full pass still comes a day after the first one.
    now = new Date("2026-10-11T00:00:00.000Z");
    await reconciler.tick();
    expect(asked.splice(0)).toEqual(["creation", "charge-back", "refund"]);
  });
});
