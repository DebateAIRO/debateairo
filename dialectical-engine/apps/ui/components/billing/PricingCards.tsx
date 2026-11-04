import type { JSX } from "react";
import type { BillingCurrency, BillingPlansPlace, BillingPlansTax, BillingPrices } from "@debateai/contract";
import { allowanceText, countryName, formatMoney, planName, pricedTax, taxInPrice, unpricedReason } from "@/lib/billing/format";
import type { BillingPlanId } from "@/lib/billing/plans";
import { formatNumber, t, type MessageCatalog } from "@/lib/i18n/translate";
import billingEnglish from "@/messages/en/billing.json";

export type PricingPlan = Readonly<{
  plan_id: BillingPlanId; net_prices: BillingPrices; total_price: string | null; allowance_vs_plus: string;
}>;

/**
 * A priced paid plan's two lines. Where the place adds tax: the price and its tax apart ("€20.00 + €4.20 VAT"), then
 * the total a month with the rate, so the price before tax is never shown without the total beside it. Where the
 * place adds none: the total a month, and that no tax is added there.
 */
function pricedLines(
  catalog: MessageCatalog, locale: string, currency: BillingCurrency, tax: BillingPlansTax, included: boolean,
  total: string, net: string
): Readonly<{ price: string; note: string }> {
  const country = countryName(locale, tax.country);
  const totalPerMonth = t(catalog, "billing.pricing.perMonth", { price: formatMoney(locale, total, currency) });
  if (!included) return { price: totalPerMonth, note: t(catalog, "billing.pricing.noTaxAdded", { country }) };
  // Basis points may carry a half (887.5 = 8.875 %), so three decimals are kept, as the checkout's tax label does.
  const rate = formatNumber(locale, tax.tax_rate_bp / 100, { maximumFractionDigits: 3 });
  const taxAmount = taxInPrice(total, net);
  return {
    price: taxAmount === null ? totalPerMonth : t(catalog, "billing.pricing.priceWithTax", {
      price: formatMoney(locale, net, currency), tax: formatMoney(locale, taxAmount, currency), taxName: tax.tax_name
    }),
    note: t(catalog, "billing.pricing.totalPerMonth", { total: formatMoney(locale, total, currency), rate, country })
  };
}

/**
 * The plan cards (spec 2026-09-29 §2.10): the price, the allowance as a multiple, the next step. The prices are in
 * `currency`, the one the place pays in (spec 2026-10-05 §2.16.1). Terms §12: "Prices include VAT, GST or sales tax,
 * which depends on where you live": a paid card shows a price only for a PRICED place, its tax apart and its
 * `total_price` beside it, and otherwise says what the price still needs (a country, a postal code, a moment), never a
 * price before tax alone. Free costs nothing anywhere.
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
        const lines = free || total === null || tax == null ? null
          : pricedLines(catalog, locale, currency, tax, priced === "INCLUDED", total, plan.net_prices[currency]);
        return (
          <article
            key={plan.plan_id}
            className="pricingCard"
            data-plan={plan.plan_id}
            aria-labelledby={`pricing-plan-${plan.plan_id}`}
          >
            <h2 id={`pricing-plan-${plan.plan_id}`}>{name}</h2>
            {free ? (
              <p className="pricingPrice">
                {t(catalog, "billing.pricing.perMonth", { price: formatMoney(locale, plan.net_prices[currency], currency) })}
              </p>
            ) : lines === null
              ? <p className="pricingPrice pricingUnpriced">{t(catalog, unpricedReason(place.status))}</p>
              : <>
                <p className="pricingPrice">{lines.price}</p>
                <p className={priced === "INCLUDED" ? "pricingTotal" : "pricingNote"}>{lines.note}</p>
              </>}
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
