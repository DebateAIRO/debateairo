import { availablePaymentMarks, type PaymentMarks } from "./paymentMarks.js";
import { billingIsOn } from "./serverBilling.js";

/** What the full site footer shows of paid plans (R3-4): whether billing is on, and the card marks the owner supplied. */
export type SiteFooterBilling = Readonly<{ billingOn: boolean; marks: PaymentMarks }>;

/**
 * For the legal pages, which render whether billing is on or off: one plans read (P19's billingIsOn(), false only on
 * the plans route's 404), and the marks from the disk.
 */
export async function siteFooterBilling(): Promise<SiteFooterBilling> {
  return Object.freeze({ billingOn: await billingIsOn(), marks: availablePaymentMarks() });
}

/** For the pages that take money (/pricing, /checkout, /checkout/return, /cancel, /withdraw): not found unless billing is on. */
export function billingPageFooter(): SiteFooterBilling {
  return Object.freeze({ billingOn: true, marks: availablePaymentMarks() });
}
