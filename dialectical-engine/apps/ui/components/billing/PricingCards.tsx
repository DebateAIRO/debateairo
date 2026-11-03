import type { JSX } from "react";
import type { BillingCurrency, BillingPlansPlace, BillingPlansTax, BillingPrices } from "@debateai/contract";
import { allowanceText, countryName, formatMoney, planName, pricedTax, unpricedReason } from "@/lib/billing/format";
import type { BillingPlanId } from "@/lib/billing/plans";
import { formatNumber, t, type MessageCatalog } from "@/lib/i18n/translate";
import billingEnglish from "@/messages/en/billing.json";

export type PricingPlan = Readonly<{
  plan_id: BillingPlanId; net_prices: BillingPrices; total_price: string | null; allowance_vs_plus: string;
}>;

/** The line under a priced paid plan: the place's tax already in it, or no tax added there. */
function taxNote(catalog: MessageCatalog, locale: string, tax: BillingPlansTax, included: boolean): string {
  const country = countryName(locale, tax.country);
  if (!included) return t(catalog, "billing.pricing.noTaxAdded", { country });
  // Basis points may carry a half (887.5 = 8.875 %), so three decimals are kept, as the checkout's tax label does.
  const rate = formatNumber(locale, tax.tax_rate_bp / 100, { maximumFractionDigits: 3 });
  return t(catalog, "billing.pricing.taxIncluded", { rate, country });
}

/**
 * The plan cards (spec 2026-09-29 §2.10): the price, the allowance as a multiple, the next step. The prices are in
 * `currency`, the one the place pays in (spec 2026-10-05 §2.16.1). Terms §12: "Prices include VAT, GST or sales tax,
 * which depends on where you live": a paid card shows its `total_price` only for a PRICED place, and otherwise says
 * what the price still needs (a country, a postal code, a moment), never a price before tax. Free costs nothing anywhere.
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
            {free || total !== null ? (
              <p className="pricingPrice">
                {t(catalog, "billing.pricing.perMonth", {
                  price: formatMoney(locale, total ?? plan.net_prices[currency], currency)
                })}
              </p>
            ) : <p className="pricingPrice pricingUnpriced">{t(catalog, unpricedReason(place.status))}</p>}
            {free || total === null || tax == null ? null
              : <p className="pricingNote">{taxNote(catalog, locale, tax, priced === "INCLUDED")}</p>}
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
