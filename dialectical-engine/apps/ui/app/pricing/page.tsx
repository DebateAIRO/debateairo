import { cookies, headers } from "next/headers";
import { notFound } from "next/navigation";
import { ContractHttpError, type BillingCurrency } from "@debateai/contract";
import { PricingCards, type PricingPlan } from "@/components/billing/PricingCards";
import { SiteFooter } from "@/components/SiteFooter";
import { billingPageFooter } from "@/lib/billing/footerBilling";
import { isBillingPlanId } from "@/lib/billing/plans";
import { isLocale, LOCALE_COOKIE } from "@/lib/i18n/locales";
import { loadNamespace } from "@/lib/i18n/server";
import { t } from "@/lib/i18n/translate";
import { createServerContractClient, readTrustedClientIp } from "@/lib/serverApi";

/** The plans, and the currency the visitor's connection pays in (spec 2026-10-05 §2.16.1). */
async function readPlans(): Promise<Readonly<{ currency: BillingCurrency; plans: readonly PricingPlan[] }> | null> {
  const headerStore = await headers();
  try {
    const answer = await createServerContractClient(
      fetch, undefined, headerStore.get("user-agent") ?? undefined, readTrustedClientIp(headerStore)
    ).getBillingPlans();
    return {
      currency: answer.currency,
      plans: answer.plans.filter((plan): plan is PricingPlan => isBillingPlanId(plan.plan_id))
    };
  } catch (failure) {
    // Billing off, or local mode: the route answers 404, and so does this page (spec §2.2 rule 1).
    if (failure instanceof ContractHttpError && failure.status === 404) notFound();
    return null;
  }
}

export default async function PricingPage() {
  const requestedLocale = (await cookies()).get(LOCALE_COOKIE)?.value;
  const locale = isLocale(requestedLocale) ? requestedLocale : "en";
  const [billingCatalog, plans] = await Promise.all([loadNamespace(locale, "billing"), readPlans()]);
  return (
    <main className="screen scroll pricingPage">
      <div className="pricingInner">
        <p className="setEyebrow">{t(billingCatalog, "billing.pricing.eyebrow")}</p>
        <h1 className="setTitle">{t(billingCatalog, "billing.pricing.title")}</h1>
        <p className="setLede">{t(billingCatalog, "billing.pricing.lede")}</p>
        {plans === null
          ? <p className="billingError" role="status">{t(billingCatalog, "billing.pricing.unavailable")}</p>
          : (
            <>
              <PricingCards catalog={billingCatalog} locale={locale} currency={plans.currency} plans={plans.plans} />
              <p className="pricingNote">{t(billingCatalog, "billing.pricing.currencyNote")}</p>
            </>
          )}
        <section className="pricingFaq" aria-labelledby="pricing-faq">
          <h2 id="pricing-faq">{t(billingCatalog, "billing.pricing.faqTitle")}</h2>
          <h3>{t(billingCatalog, "billing.pricing.faqLimitsQuestion")}</h3>
          <p>{t(billingCatalog, "billing.pricing.faqLimitsAnswer")}</p>
          <h3>{t(billingCatalog, "billing.pricing.faqCancelQuestion")}</h3>
          <p>{t(billingCatalog, "billing.pricing.faqCancelAnswer")}</p>
          <h3>{t(billingCatalog, "billing.pricing.faqTaxQuestion")}</h3>
          <p>{t(billingCatalog, "billing.pricing.faqTaxAnswer")}</p>
          <p className="billingActions">
            <a href="/terms">{t(billingCatalog, "billing.pricing.termsLink")}</a>
            <a href="/privacy">{t(billingCatalog, "billing.pricing.privacyLink")}</a>
          </p>
        </section>
      </div>
      <SiteFooter variant="full" billing={billingPageFooter()} />
    </main>
  );
}
