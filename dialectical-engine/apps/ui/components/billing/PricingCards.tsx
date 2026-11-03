import type { JSX } from "react";
import type { BillingCurrency, BillingPlansTax, BillingPrices } from "@debateai/contract";
import { allowanceText, countryName, formatMoney, planName, pricedTax } from "@/lib/billing/format";
import type { BillingPlanId } from "@/lib/billing/plans";
import { formatNumber, t, type MessageCatalog } from "@/lib/i18n/translate";
import billingEnglish from "@/messages/en/billing.json";

export type PricingPlan = Readonly<{
  plan_id: BillingPlanId; net_prices: BillingPrices; total_price: string | null; allowance_vs_plus: string;
}>;

/** The line under a paid plan's price: the country's tax already in it, or, with no country's tax known, "plus tax". */
function taxNote(catalog: MessageCatalog, locale: string, tax: BillingPlansTax | null): string {
  const priced = pricedTax(tax);
  if (tax == null || priced === "BEFORE") return t(catalog, "billing.pricing.plusTax");
  const country = countryName(locale, tax.country);
  if (priced === "NONE") return t(catalog, "billing.pricing.noTaxAdded", { country });
  // Basis points may carry a half (887.5 = 8.875 %), so three decimals are kept, as the checkout's tax label does.
  const rate = formatNumber(locale, tax.tax_rate_bp / 100, { maximumFractionDigits: 3 });
  return t(catalog, "billing.pricing.taxIncluded", { rate, country });
}

/**
 * The plan cards (spec 2026-09-29 §2.10): the price, the allowance as a multiple, the next step. The prices are in
 * `currency`, the one the visitor's connection pays in (spec 2026-10-05 §2.16.1). Terms §12: "Prices include VAT, GST
 * or sales tax": with `tax`, the connection country's tax, each card shows its `total_price`; only when no country's
 * tax is known does it fall back to the net price "plus tax".
 */
export function PricingCards({
  catalog = billingEnglish,
  locale,
  currency,
  tax,
  plans
}: Readonly<{
  catalog?: MessageCatalog; locale: string; currency: BillingCurrency; tax: BillingPlansTax | null; plans: readonly PricingPlan[];
}>): JSX.Element {
  return (
    <div className="pricingGrid" data-pricing-cards>
      {plans.map((plan) => {
        const name = planName(catalog, plan.plan_id);
        const free = plan.plan_id === "FREE";
        // `!= null`: a plan without both (an API from before Terms §12's totals) shows its net price "plus tax".
        const priced = tax != null && plan.total_price != null;
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
                price: formatMoney(locale, priced ? plan.total_price : plan.net_prices[currency], currency)
              })}
            </p>
            {free ? null : <p className="pricingNote">{taxNote(catalog, locale, priced ? tax : null)}</p>}
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
