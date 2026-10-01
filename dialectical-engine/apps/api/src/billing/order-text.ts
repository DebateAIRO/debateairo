import { SELLER_COMPANY } from "@debateai/billing-core";
import { exhaustive } from "@debateai/kernel";
import type { PlanId } from "@debateai/register";

/**
 * The brand these lines name: the legal notice's first trading name (`COMPANY.tradingNames`,
 * apps/ui/lib/legal/pages.ts:72, today "DebateAI"), read from P6a's API mirror so the seller has one source
 * (RULINGS-R3 R3-4). The legal name stands in only if the list were ever emptied.
 */
const [brand = SELLER_COMPANY.legalName] = SELLER_COMPANY.tradingNames;

/**
 * The sentences billing writes where a person or a tax document reads them: the xMoney order line (spec §2.5.3 step
 * 5: "a catalogue sentence for the plan"), the card check's order line (P12e) and the one invoice line (P10).
 * `params`: ORDER_PLAN `{plan}`; CARD_CHECK `{}`; INVOICE_LINE `{plan, from, to}`, the dates already worded by
 * `invoiceDate` in the same locale.
 */
export type OrderTextKind = "ORDER_PLAN" | "CARD_CHECK" | "INVOICE_LINE";
export type BillingOrderText = (kind: OrderTextKind, locale: string, params: Readonly<Record<string, string>>) => string;

/** Plan names are the same in every locale (contract §10). */
export function planName(planId: PlanId): string {
  switch (planId) {
    case "FREE":
      return "Free";
    case "PLUS":
      return "Plus";
    case "PRO":
      return "Pro";
    case "MAX":
      return "Max";
    default:
      return exhaustive(planId);
  }
}

/**
 * The fallback until P17/P18 give these sentences their 35-locale catalogue keys (`order.planDescription`,
 * `order.cardCheck`, `invoice.line`): the English value, which is also the authoritative source of the translations.
 */
export const englishOrderText: BillingOrderText = (kind, _locale, params) => {
  switch (kind) {
    case "ORDER_PLAN":
      return `${brand} ${params.plan ?? ""} monthly plan`;
    case "CARD_CHECK":
      return `${brand} card check`;
    case "INVOICE_LINE":
      return `${brand} ${params.plan ?? ""} plan, ${params.from ?? ""} to ${params.to ?? ""}`;
    default:
      return exhaustive(kind);
  }
};

/** A date as the locale writes it (UTC, the billing calendar's zone), never an ISO string on a legal document. */
export function invoiceDate(value: Date, locale: string): string {
  return new Intl.DateTimeFormat(locale, { year: "numeric", month: "long", day: "numeric", timeZone: "UTC" }).format(value);
}
