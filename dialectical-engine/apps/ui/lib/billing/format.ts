import type { BillingCurrency, BillingPlansPlace, BillingPlansTax } from "@debateai/contract";
import { formatDate, formatNumber, isEnglishLocale, t, type MessageCatalog } from "../i18n/translate.js";
import type { BillingPlanId } from "./plans.js";

const DECIMAL_PRICE = /^\d{1,9}\.\d{2}$/;

/**
 * A decimal the API sends ("24.20") in the currency it is in (spec 2026-10-05 §2.16.5), in the reader's locale;
 * display only, never arithmetic. Anything else is shown as it came.
 */
export function formatMoney(locale: string, decimal: string, currency: BillingCurrency): string {
  return DECIMAL_PRICE.test(decimal)
    ? formatNumber(locale, Number(decimal), { style: "currency", currency })
    : decimal;
}

/**
 * The tax inside a price the API sent with its net ("24.20" and "20.00" give "4.20"), counted in whole cents so no
 * float rounding can show; null when either is not a plain decimal price or the total is below the net.
 */
export function taxInPrice(total: string, net: string): string | null {
  if (!DECIMAL_PRICE.test(total) || !DECIMAL_PRICE.test(net)) return null;
  const cents = (decimal: string): number => Number(decimal.replace(".", ""));
  const tax = cents(total) - cents(net);
  return tax < 0 ? null : `${Math.trunc(tax / 100)}.${String(tax % 100).padStart(2, "0")}`;
}

/**
 * Terms §12: "Our prices are shown before tax, as price + VAT". How a plans list's tax stands toward its prices, which
 * are always the net ones. ADDED: the place's tax is added at checkout (a card also shows it apart and the total with it);
 * NONE: that place adds none, so the net prices are final; UNPRICED: no place's tax is known yet (no country, a US or
 * Canadian postal code still needed, or the tax service not answering), so a card says tax is added where it applies.
 * `== null`: an answer without the fields (only a hand-made one: the contract client requires them) is UNPRICED.
 */
export type PricedTax = "ADDED" | "NONE" | "UNPRICED";

export function pricedTax(
  answer: Readonly<{ place?: BillingPlansPlace | null; tax?: BillingPlansTax | null }> | null | undefined
): PricedTax {
  const tax = answer?.tax;
  if (answer?.place?.status !== "PRICED" || tax == null) return "UNPRICED";
  return tax.tax_status === "TAXABLE" && tax.tax_rate_bp > 0 ? "ADDED" : "NONE";
}

/** The line under a price before tax whose place's tax is not known yet (Terms §12): tax is added where it applies. */
export function unpricedReason(status: BillingPlansPlace["status"] | undefined): string {
  switch (status) {
    case "COUNTRY_NEEDED": return "billing.pricing.chooseCountry";
    case "POSTAL_CODE_NEEDED": return "billing.pricing.enterPostalCode";
    case "POSTAL_CODE_INVALID": return "billing.checkout.postalCodeInvalid";
    default: return "billing.pricing.plusTax";
  }
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

/** B1's {day}: "29th" in every English (plain, United States, United Kingdom), the bare number elsewhere (the translations word around it). */
export function renewDayLabel(locale: string, iso: string): string {
  const day = new Date(iso).getUTCDate();
  if (!isEnglishLocale(locale)) return formatNumber(locale, day);
  return `${day}${ENGLISH_ORDINAL_SUFFIX[new Intl.PluralRules("en", { type: "ordinal" }).select(day)]}`;
}

export type TaxLabelParts = Readonly<{
  status: "TAXABLE" | "NON_TAXABLE" | "NOT_REGISTERED" | "REVERSE_CHARGE";
  /** The quote's `tax`, a decimal ("4.20"): the amount, shown before the rate as spec §1.3 does. */
  taxAmount: string;
  /** The quote's currency. */
  currency: BillingCurrency;
  taxName: string;
  rateBasisPoints: number;
  country: string;
}>;

/** "€3.80 VAT (19%, Germany)", built in the reader's locale from the quote's parts (spec §1.3, §2.5.3). */
export function taxLabel(catalog: MessageCatalog, locale: string, parts: TaxLabelParts): string {
  if (parts.status === "REVERSE_CHARGE") return t(catalog, "billing.checkout.taxReverseCharge");
  if (parts.status !== "TAXABLE" || parts.rateBasisPoints === 0) return t(catalog, "billing.checkout.noTax");
  return t(catalog, "billing.checkout.taxLabel", {
    tax: formatMoney(locale, parts.taxAmount, parts.currency),
    taxName: parts.taxName,
    // P8b/P12c: basis points may carry a half (887.5 = 8.875 %), so three decimals are kept.
    rate: formatNumber(locale, parts.rateBasisPoints / 100, { maximumFractionDigits: 3 }),
    country: countryName(locale, parts.country)
  });
}
