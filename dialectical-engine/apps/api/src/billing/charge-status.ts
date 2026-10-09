import type { BillingJobQueries, BillingRepository, ChargeEventRow, ChargeKind, ChargeRow } from "@debateai/db";
import { REFUND_REASONS_REFUSING_THE_PAYMENT, type BillingRefundReason } from "./codes.js";
import { queueVerifyNow } from "./renewal.js";
import { refundTarget } from "./rows.js";

export type ChargeState = "PENDING" | "SUCCEEDED" | "FAILED" | "NEEDS_ACTION";
export type ChargeStatus = Readonly<{ state: ChargeState; reasonCode: string | null }>;
/** Spec 2026-10-05 §2.6.5: the kind lets the one return page word an upgrade's confirmation. */
export type ChargeStatusAnswer = ChargeStatus & Readonly<{ kind: ChargeKind }>;

/**
 * F4 (ruling PR-55, finding ui-1): the refusing reasons whose page sentence says the payment WAS refunded and an email
 * explains why (`billing.checkout.refunded`; the email, M11_DUPLICATE, follows only the REFUNDED row). Refunds are the
 * owner's own act in NETOPIA's admin, so such a request can wait days: until REFUNDED rows of the same payment cover
 * it, the charge reads REFUND_PENDING (the refund is on its way). The other refusing reasons' sentences are true
 * before the refund too (a blocked card country: "any money taken goes back"; a card check's hold released).
 */
const REFUSALS_SAID_REFUNDED: ReadonlySet<string> = new Set<BillingRefundReason>([
  "ALREADY_SUBSCRIBED", "SUBSCRIPTION_ENDED", "UPGRADE_CLOSED"
]);

/** Whether REFUNDED rows naming the request's payment (P1a's refund target) add up to what it asked back. */
function refundRecorded(events: ReadonlyArray<ChargeEventRow>, request: ChargeEventRow): boolean {
  if (request.providerPaymentId === null || request.amountMicros === null) return false;
  const refunded = events.filter((event) => event.kind === "REFUNDED" && refundTarget(event) === request.providerPaymentId)
    .reduce((total, event) => total + (event.amountMicros ?? 0), 0);
  return refunded >= request.amountMicros;
}

/**
 * The waiting screen's answer, derived only from our own events: a payment we refunded because we refuse it
 * (a blocked card country, a duplicate plan) reads FAILED with that reason; a bank decline reads NEEDS_ACTION,
 * because the person can try another card; a void reads FAILED. P2-M5: `activated` false (a checkout whose plan never
 * started) reads a refund or void made at NETOPIA (PROVIDER_REFUND, PROVIDER_VOID) as FAILED too: the money came and
 * went, and nothing was bought. On a plan that did start, such a refund changes nothing (A9), so it reads SUCCEEDED.
 * Part 4 final review C-19 (the controller's ruling): a checkout's payment charged back before we verified it writes
 * only the CHARGEBACK (no SUCCEEDED, no plan), so an unstarted checkout reads it as FAILED (reason CHARGEBACK; the
 * waiting screen says the existing refunded-before-start sentence), never PENDING for ever.
 * F4: a duplicate plan, an ended subscription or a closed upgrade reads FAILED with REFUND_PENDING until its refund is
 * recorded (`REFUSALS_SAID_REFUNDED`), and with its own reason after.
 */
export function chargeStatusOf(events: ReadonlyArray<ChargeEventRow>, activated = true): ChargeStatus {
  const refused = events.find((event) => event.kind === "REFUND_REQUESTED" && event.errorCode !== null
    && (REFUND_REASONS_REFUSING_THE_PAYMENT.has(event.errorCode as BillingRefundReason)
      || (!activated && (event.errorCode === "PROVIDER_REFUND" || event.errorCode === "PROVIDER_VOID"))));
  if (refused !== undefined) {
    const pending = REFUSALS_SAID_REFUNDED.has(refused.errorCode!) && !refundRecorded(events, refused);
    return Object.freeze({ state: "FAILED", reasonCode: pending ? "REFUND_PENDING" : refused.errorCode });
  }
  if (!activated && events.some((event) => event.kind === "CHARGEBACK")) {
    return Object.freeze({ state: "FAILED", reasonCode: "CHARGEBACK" });
  }
  if (events.some((event) => event.kind === "SUCCEEDED")) return Object.freeze({ state: "SUCCEEDED", reasonCode: null });
  const failed = [...events].reverse().find((event) => event.kind === "FAILED");
  if (failed !== undefined) {
    return failed.errorCode === "PAYMENT_DECLINED"
      ? Object.freeze({ state: "NEEDS_ACTION", reasonCode: "PAYMENT_DECLINED" })
      : Object.freeze({ state: "FAILED", reasonCode: failed.errorCode ?? "PAYMENT_FAILED" });
  }
  return Object.freeze({ state: "PENDING", reasonCode: null });
}

/**
 * Spec §2.6.5: how long a page waits on a NETOPIA payment after its SUBMITTED before the poller asks for a check now,
 * and the least time between two such asks (a status read of the checks counts as one). A function, never a number.
 */
export function waitingCheckAfterMs(): number {
  return 20_000;
}

export interface ChargeStatusPort {
  read(chargeRef: string, ownerRef: string): Promise<ChargeStatusAnswer | null>;
}

export type ChargeStatusDeps = Readonly<{
  repository: Pick<BillingRepository, "charge" | "subscriptionEvents" | "withTransaction" | "enqueue" | "lastStatusRead">;
  jobs: Pick<BillingJobQueries, "bringForward">;
  clock: () => Date;
}>;

export class ChargeStatusReader implements ChargeStatusPort {
  constructor(private readonly deps: ChargeStatusDeps) {}

  /** Only the charge's owner reads it: anyone else gets null, as for a reference that does not exist (P2-M16). */
  async read(chargeRef: string, ownerRef: string): Promise<ChargeStatusAnswer | null> {
    if (!/^[0-9a-f]{32}$/.test(chargeRef)) return null;
    const charge = await this.deps.repository.charge(chargeRef);
    if (charge === null || charge.ownerRef !== ownerRef) return null;
    // P2-M5: a checkout's payment is read against whether its plan ever started.
    const activated = charge.kind !== "INITIAL"
      || (await this.deps.repository.subscriptionEvents(charge.subscriptionId)).some((event) => event.kind === "ACTIVATED");
    const status = chargeStatusOf(charge.events, activated);
    if (status.state === "PENDING") await this.askForCheck(charge, this.deps.clock());
    return Object.freeze({ ...status, kind: charge.kind });
  }

  /** Spec §2.6.5: a NETOPIA payment PENDING past waitingCheckAfterMs gets its check now, at most once per that time. */
  private async askForCheck(charge: ChargeRow & Readonly<{ events: ReadonlyArray<ChargeEventRow> }>, now: Date): Promise<void> {
    if (charge.paymentProvider !== "netopia") return;
    const submitted = [...charge.events].reverse().find((event) => event.kind === "SUBMITTED");
    if (submitted === undefined || now.getTime() - submitted.at.getTime() < waitingCheckAfterMs()) return;
    const last = await this.deps.repository.lastStatusRead(charge.chargeId);
    if (last !== null && now.getTime() - last.at.getTime() < waitingCheckAfterMs()) return;
    await this.deps.repository.withTransaction((tx) => queueVerifyNow(this.deps, tx, charge.chargeId, now));
  }
}
