import { availablePaymentMarks, netopiaLogoAddress, type PaymentMarks } from "./paymentMarks.js";
import { billingIsOn } from "./serverBilling.js";

/**
 * What the full site footer shows of paid plans: whether billing is on, the card marks the server's setting names, and
 * NETOPIA's hosted logo when its setting (NETOPIA_LOGO_ID) is set, which then replaces the marks.
 */
export type SiteFooterBilling = Readonly<{ billingOn: boolean; marks: PaymentMarks; netopiaLogo: string | null }>;

/** What the one-line footer shows of paid plans: only whether billing is on, for its cancel and withdraw links. */
export type LineFooterBilling = Readonly<{ billingOn: boolean }>;

/**
 * For the legal pages, which render whether billing is on or off: one plans read (billingIsOn(), false only on the
 * plans route's 404), the marks from the PAYMENT_MARKS_AVAILABLE setting and NETOPIA's logo from NETOPIA_LOGO_ID.
 */
export async function siteFooterBilling(): Promise<SiteFooterBilling> {
  return Object.freeze({ billingOn: await billingIsOn(), marks: availablePaymentMarks(), netopiaLogo: netopiaLogoAddress() });
}

/** For the pages that take money (/pricing, /checkout, /checkout/return, /cancel, /withdraw): not found unless billing is on. */
export function billingPageFooter(): SiteFooterBilling {
  return Object.freeze({ billingOn: true, marks: availablePaymentMarks(), netopiaLogo: netopiaLogoAddress() });
}

/** How long the one-line footer reuses one plans read. Billing is switched on or off rarely, and that footer is on every page. */
export const LINE_FOOTER_BILLING_MS = 60_000;

const LINE_BILLING_OFF: LineFooterBilling = Object.freeze({ billingOn: false });

/**
 * One plans read shared by every page for `ttlMs`. The read's answer (billingIsOn's rule: only the plans route's 404
 * is off) is kept that long by this server process, and every page asking meanwhile gets the same answer, even while
 * the read is still on its way. The root layout draws the one-line footer on every page, so without this each page
 * view would spend one of the visitor's public reads at the API. A read that fails outright shows nothing about
 * billing on that page and is not kept, so the next page reads again.
 */
export function rememberedLineFooterBilling(
  read: () => Promise<boolean>, now: () => number = Date.now, ttlMs: number = LINE_FOOTER_BILLING_MS
): () => Promise<LineFooterBilling> {
  type Kept = Readonly<{ at: number; answer: Promise<LineFooterBilling> }>;
  let kept: Kept | null = null;
  return () => {
    const at = now();
    // A clock that went back starts a fresh read too, so an answer is never kept longer than `ttlMs`.
    if (kept === null || at - kept.at >= ttlMs || at < kept.at) {
      const entry: Kept = Object.freeze({
        at,
        answer: read().then(
          (billingOn) => Object.freeze({ billingOn }),
          () => {
            if (kept === entry) kept = null;
            return LINE_BILLING_OFF;
          }
        )
      });
      kept = entry;
    }
    return kept.answer;
  };
}

/** For the root layout's one-line footer: whether billing is on, read at most once a minute per server process. */
export const lineFooterBilling = rememberedLineFooterBilling(billingIsOn);
