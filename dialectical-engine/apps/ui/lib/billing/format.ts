import { formatDate, formatNumber, t, type MessageCatalog } from "../i18n/translate.js";
import type { BillingPlanId } from "./plans.js";

const DECIMAL_PRICE = /^\d{1,9}\.\d{2}$/;

/** A decimal the API sends ("24.20") as US dollars in the reader's locale; display only, never arithmetic. */
export function formatUsd(locale: string, decimal: string): string {
  return DECIMAL_PRICE.test(decimal)
    ? formatNumber(locale, Number(decimal), { style: "currency", currency: "USD" })
    : decimal;
}

export function planName(catalog: MessageCatalog, planId: BillingPlanId): string {
  return t(catalog, `billing.plans.${planId}.name`);
}

/** "4× the Plus allowance": the allowance as a multiple, never as dollars of credit (spec §1.2, §2.5.3). */
export function allowanceText(catalog: MessageCatalog, locale: string, planId: BillingPlanId, ratio: string): string {
  if (planId === "FREE") return t(catalog, "billing.pricing.allowanceFree");
  if (ratio === "1") return t(catalog, "billing.pricing.allowancePlus");
  return t(catalog, "billing.pricing.allowance", { ratio: formatNumber(locale, Number(ratio)) });
}

export function countryName(locale: string, iso2: string): string {
  try {
    return new Intl.DisplayNames([locale], { type: "region" }).of(iso2) ?? iso2;
  } catch {
    return iso2;
  }
}

export function formatLongDate(locale: string, iso: string): string {
  return formatDate(locale, iso, { dateStyle: "long", timeZone: "UTC" });
}

const ENGLISH_ORDINAL_SUFFIX: Readonly<Record<Intl.LDMLPluralRule, string>> = Object.freeze({
  zero: "th", one: "st", two: "nd", few: "rd", many: "th", other: "th"
});

/** B1's {day}: "29th" in English, the bare number elsewhere (the translations word around it). */
export function renewDayLabel(locale: string, iso: string): string {
  const day = new Date(iso).getUTCDate();
  if (locale !== "en") return formatNumber(locale, day);
  return `${day}${ENGLISH_ORDINAL_SUFFIX[new Intl.PluralRules("en", { type: "ordinal" }).select(day)]}`;
}

export type TaxLabelParts = Readonly<{
  status: "TAXABLE" | "NON_TAXABLE" | "NOT_REGISTERED" | "REVERSE_CHARGE";
  /** The quote's `tax`, a decimal ("4.20"): the amount, shown before the rate as spec §1.3 does. */
  taxAmount: string;
  taxName: string;
  rateBasisPoints: number;
  country: string;
}>;

/** "$4.20 VAT (21%, Romania)", built in the reader's locale from the quote's parts (spec §1.3, §2.5.3). */
export function taxLabel(catalog: MessageCatalog, locale: string, parts: TaxLabelParts): string {
  if (parts.status === "REVERSE_CHARGE") return t(catalog, "billing.checkout.taxReverseCharge");
  if (parts.status !== "TAXABLE" || parts.rateBasisPoints === 0) return t(catalog, "billing.checkout.noTax");
  return t(catalog, "billing.checkout.taxLabel", {
    tax: formatUsd(locale, parts.taxAmount),
    taxName: parts.taxName,
    // P8b/P12c: basis points may carry a half (887.5 = 8.875 %), so three decimals are kept.
    rate: formatNumber(locale, parts.rateBasisPoints / 100, { maximumFractionDigits: 3 }),
    country: countryName(locale, parts.country)
  });
}
