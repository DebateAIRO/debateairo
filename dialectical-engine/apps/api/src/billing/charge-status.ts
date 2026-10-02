import type { BillingRepository, ChargeEventRow } from "@debateai/db";
import { REFUND_REASONS_REFUSING_THE_PAYMENT, type BillingRefundReason } from "./codes.js";

export type ChargeState = "PENDING" | "SUCCEEDED" | "FAILED" | "NEEDS_ACTION";
export type ChargeStatus = Readonly<{ state: ChargeState; reasonCode: string | null }>;

/**
 * The waiting screen's answer, derived only from our own events: a payment we refunded because we refuse it
 * (a blocked card country, a duplicate plan) reads FAILED with that reason; a bank decline reads NEEDS_ACTION,
 * because the person can try another card; a void reads FAILED.
 */
export function chargeStatusOf(events: ReadonlyArray<ChargeEventRow>): ChargeStatus {
  const refused = events.find((event) => event.kind === "REFUND_REQUESTED" && event.errorCode !== null
    && REFUND_REASONS_REFUSING_THE_PAYMENT.has(event.errorCode as BillingRefundReason));
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
  constructor(private readonly repository: Pick<BillingRepository, "charge">) {}

  async read(chargeRef: string, ownerRef: string): Promise<ChargeStatus | null> {
    if (!/^[0-9a-f]{32}$/.test(chargeRef)) return null;
    const charge = await this.repository.charge(chargeRef);
    if (charge === null) return null;
    return charge.ownerRef === ownerRef ? chargeStatusOf(charge.events) : null;
  }
}
