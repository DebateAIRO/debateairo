import type { BillingRepository, ChargeEventRow } from "@debateai/db";
import { REFUND_REASONS_REFUSING_THE_PAYMENT, type BillingRefundReason } from "./codes.js";

export type ChargeState = "PENDING" | "SUCCEEDED" | "FAILED" | "NEEDS_ACTION";
export type ChargeStatus = Readonly<{ state: ChargeState; reasonCode: string | null }>;

/**
 * The waiting screen's answer, derived only from our own events: a payment we refunded because we refuse it
 * (a blocked card country, a duplicate plan) reads FAILED with that reason; a bank decline reads NEEDS_ACTION,
 * because the person can try another card; a void reads FAILED. P2-M5: `activated` false (a checkout whose plan never
 * started) reads a refund or void made at xMoney (PROVIDER_REFUND, PROVIDER_VOID) as FAILED too: the money came and
 * went, and nothing was bought. On a plan that did start, such a refund changes nothing (A9), so it reads SUCCEEDED.
 */
export function chargeStatusOf(events: ReadonlyArray<ChargeEventRow>, activated = true): ChargeStatus {
  const refused = events.find((event) => event.kind === "REFUND_REQUESTED" && event.errorCode !== null
    && (REFUND_REASONS_REFUSING_THE_PAYMENT.has(event.errorCode as BillingRefundReason)
      || (!activated && (event.errorCode === "PROVIDER_REFUND" || event.errorCode === "PROVIDER_VOID"))));
  if (refused !== undefined) return Object.freeze({ state: "FAILED", reasonCode: refused.errorCode });
  if (events.some((event) => event.kind === "SUCCEEDED")) return Object.freeze({ state: "SUCCEEDED", reasonCode: null });
  const failed = [...events].reverse().find((event) => event.kind === "FAILED");
  if (failed !== undefined) {
    return failed.errorCode === "PAYMENT_DECLINED"
      ? Object.freeze({ state: "NEEDS_ACTION", reasonCode: "PAYMENT_DECLINED" })
      : Object.freeze({ state: "FAILED", reasonCode: failed.errorCode ?? "PAYMENT_FAILED" });
  }
  return Object.freeze({ state: "PENDING", reasonCode: null });
}

export interface ChargeStatusPort {
  read(chargeRef: string, ownerRef: string): Promise<ChargeStatus | null>;
}

export class ChargeStatusReader implements ChargeStatusPort {
  constructor(private readonly repository: Pick<BillingRepository, "charge" | "subscriptionEvents">) {}

  /** Only the charge's owner reads it: anyone else gets null, as for a reference that does not exist (P2-M16). */
  async read(chargeRef: string, ownerRef: string): Promise<ChargeStatus | null> {
    if (!/^[0-9a-f]{32}$/.test(chargeRef)) return null;
    const charge = await this.repository.charge(chargeRef);
    if (charge === null || charge.ownerRef !== ownerRef) return null;
    // P2-M5: a checkout's payment is read against whether its plan ever started.
    const activated = charge.kind !== "INITIAL"
      || (await this.repository.subscriptionEvents(charge.subscriptionId)).some((event) => event.kind === "ACTIVATED");
    return chargeStatusOf(charge.events, activated);
  }
}
