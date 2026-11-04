import type { JSX } from "react";
import type { BillingCurrency, BillingPlansPlace, BillingPlansTax, BillingPrices } from "@debateai/contract";
import { allowanceText, countryName, formatMoney, planName, pricedTax, unpricedReason } from "@/lib/billing/format";
import type { BillingPlanId } from "@/lib/billing/plans";
import { formatNumber, t, type MessageCatalog } from "@/lib/i18n/translate";
import billingEnglish from "@/messages/en/billing.json";

export type PricingPlan = Readonly<{
  plan_id: BillingPlanId; net_prices: BillingPrices; total_price: string | null; allowance_vs_plus: string;
}>;

/**
 * The line under a paid plan's price before tax (Terms §12, price + VAT): the place's tax by name and rate with the
 * total it makes, or no tax added there.
 */
function taxNote(
  catalog: MessageCatalog, locale: string, currency: BillingCurrency, tax: BillingPlansTax, added: boolean, total: string
): string {
  const country = countryName(locale, tax.country);
  if (!added) return t(catalog, "billing.pricing.noTaxAdded", { country });
  // Basis points may carry a half (887.5 = 8.875 %), so three decimals are kept, as the checkout's tax label does.
  const rate = formatNumber(locale, tax.tax_rate_bp / 100, { maximumFractionDigits: 3 });
  return t(catalog, "billing.pricing.taxAdded", {
    taxName: tax.tax_name, rate, country, total: formatMoney(locale, total, currency)
  });
}

/**
 * The plan cards (spec 2026-09-29 §2.10): the price, the allowance as a multiple, the next step. The prices are in
 * `currency`, the one the place pays in (spec 2026-10-05 §2.16.1). Terms §12: "Our prices are shown before tax, as
 * price + VAT": every card shows its net price; under a paid one, a PRICED place's tax and the total with it, and
 * otherwise that tax is added where it applies (and what would name it: a country, a postal code). Free costs nothing.
 */
export function PricingCards({
  catalog = billingEnglish,
  locale,
  currency,
  place,
  tax,
  plans
}: Readonly<{
  catalog?: MessageCatalog; locale: string; currency: BillingCurrency; place: BillingPlansPlace;
  tax: BillingPlansTax | null; plans: readonly PricingPlan[];
}>): JSX.Element {
  const priced = pricedTax({ place, tax });
  return (
    <div className="pricingGrid" data-pricing-cards>
      {plans.map((plan) => {
        const name = planName(catalog, plan.plan_id);
        const free = plan.plan_id === "FREE";
        const total = priced === "UNPRICED" || tax == null ? null : plan.total_price ?? null;
        return (
          <article
            key={plan.plan_id}
            className="pricingCard"
            data-plan={plan.plan_id}
            aria-labelledby={`pricing-plan-${plan.plan_id}`}
          >
            <h2 id={`pricing-plan-${plan.plan_id}`}>{name}</h2>
            <p className="pricingPrice">
              {t(catalog, "billing.pricing.perMonth", {
                price: formatMoney(locale, plan.net_prices[currency], currency)
              })}
            </p>
            {free ? null : (
              <p className="pricingNote">
                {total === null || tax == null ? t(catalog, unpricedReason(place.status))
                  : taxNote(catalog, locale, currency, tax, priced === "ADDED", total)}
              </p>
            )}
            <p>{allowanceText(catalog, locale, plan.plan_id, plan.allowance_vs_plus)}</p>
            <p className="pricingNote">
              {t(catalog, free ? "billing.pricing.freeFeatures" : "billing.pricing.paidFeatures")}
            </p>
            <a className={free ? "btn" : "btn btnDark"} href={free ? "/sign-up" : `/checkout?plan=${plan.plan_id}`}>
              {free ? t(catalog, "billing.pricing.startFree") : t(catalog, "billing.pricing.choose", { plan: name })}
            </a>
          </article>
        );
      })}
    </div>
  );
}
