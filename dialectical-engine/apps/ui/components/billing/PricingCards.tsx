import type { JSX } from "react";
import { allowanceText, formatUsd, planName } from "@/lib/billing/format";
import type { BillingPlanId } from "@/lib/billing/plans";
import { t, type MessageCatalog } from "@/lib/i18n/translate";
import billingEnglish from "@/messages/en/billing.json";

export type PricingPlan = Readonly<{ plan_id: BillingPlanId; net_price: string; allowance_vs_plus: string }>;

/** The plan cards (spec 2026-09-29 §2.10): price before tax, the allowance as a multiple, the next step. */
export function PricingCards({
  catalog = billingEnglish,
  locale,
  plans
}: Readonly<{ catalog?: MessageCatalog; locale: string; plans: readonly PricingPlan[] }>): JSX.Element {
  return (
    <div className="pricingGrid" data-pricing-cards>
      {plans.map((plan) => {
        const name = planName(catalog, plan.plan_id);
        const free = plan.plan_id === "FREE";
        return (
          <article
            key={plan.plan_id}
            className="pricingCard"
            data-plan={plan.plan_id}
            aria-labelledby={`pricing-plan-${plan.plan_id}`}
          >
            <h2 id={`pricing-plan-${plan.plan_id}`}>{name}</h2>
            <p className="pricingPrice">
              {t(catalog, "billing.pricing.perMonth", { price: formatUsd(locale, plan.net_price) })}
            </p>
            {free ? null : <p className="pricingNote">{t(catalog, "billing.pricing.plusTax")}</p>}
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
