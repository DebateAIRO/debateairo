import { cookies, headers } from "next/headers";
import { notFound } from "next/navigation";
import { ContractHttpError, type BillingCurrency, type BillingPlansPlace, type BillingPlansTax } from "@debateai/contract";
import { PricingCards, type PricingPlan } from "@/components/billing/PricingCards";
import { PricingPlaceForm } from "@/components/billing/PricingPlaceForm";
import { SiteFooter } from "@/components/SiteFooter";
import { billingPageFooter } from "@/lib/billing/footerBilling";
import { pricedTax } from "@/lib/billing/format";
import { isBillingPlanId } from "@/lib/billing/plans";
import { isLocale, LOCALE_COOKIE } from "@/lib/i18n/locales";
import { loadNamespace } from "@/lib/i18n/server";
import { t } from "@/lib/i18n/translate";
import { createServerContractClient, readTrustedClientIp } from "@/lib/serverApi";

type PlaceParams = Readonly<{ country?: string | string[]; postal_code?: string | string[] }>;

/**
 * The place of an answer without one: only a hand-made answer (a test's, a mock's) lacks it, since the contract client
 * requires it; such an answer is priced nowhere, so it shows no price.
 */
const NO_PLACE: BillingPlansPlace = Object.freeze({ country: null, postal_code: null, status: "TAX_UNAVAILABLE" });

/** One value of a search parameter, or nothing: a repeated or empty one is no choice. */
function single(value: string | string[] | undefined): string | undefined {
  return typeof value === "string" && value.trim() !== "" ? value : undefined;
}

/**
 * The plans for a place (Terms §12: the prices include its tax): the country the visitor chose on this page, and in
 * the US and Canada the postal code, else the connection's country; with the currency that place pays in (spec
 * 2026-10-05 §2.16.1).
 */
async function readPlans(params: PlaceParams): Promise<Readonly<{
  currency: BillingCurrency; place: BillingPlansPlace; tax: BillingPlansTax | null; plans: readonly PricingPlan[];
}> | null> {
  const headerStore = await headers();
  const country = single(params.country);
  const postalCode = single(params.postal_code);
  try {
    const answer = await createServerContractClient(
      fetch, undefined, headerStore.get("user-agent") ?? undefined, readTrustedClientIp(headerStore)
    ).getBillingPlans({
      ...(country === undefined ? {} : { country }), ...(postalCode === undefined ? {} : { postalCode })
    });
    return {
      currency: answer.currency,
      place: answer.place ?? NO_PLACE,
      tax: answer.place == null ? null : answer.tax,
      plans: answer.plans.filter((plan): plan is PricingPlan => isBillingPlanId(plan.plan_id))
    };
  } catch (failure) {
    // Billing off, or local mode: the route answers 404, and so does this page (spec §2.2 rule 1).
    if (failure instanceof ContractHttpError && failure.status === 404) notFound();
    return null;
  }
}

const FAQ_TAX_ANSWER = Object.freeze({
  INCLUDED: "billing.pricing.faqTaxAnswerIncluded",
  NONE: "billing.pricing.faqTaxAnswerNoTax",
  UNPRICED: "billing.pricing.faqTaxAnswerChoose"
});

export default async function PricingPage({
  searchParams = Promise.resolve({})
}: {
  searchParams?: Promise<PlaceParams>;
}) {
  const requestedLocale = (await cookies()).get(LOCALE_COOKIE)?.value;
  const locale = isLocale(requestedLocale) ? requestedLocale : "en";
  const params = await searchParams;
  const [billingCatalog, authCatalog, plans] = await Promise.all([
    loadNamespace(locale, "billing"), loadNamespace(locale, "auth"), readPlans(params)
  ]);
  // Terms §12: the FAQ says what the cards say.
  const priced = pricedTax(plans);
  return (
    <div className="screen scroll pricingPage">
      <div className="pricingInner">
        <p className="setEyebrow">{t(billingCatalog, "billing.pricing.eyebrow")}</p>
        <h1 className="setTitle">{t(billingCatalog, "billing.pricing.title")}</h1>
        <p className="setLede">{t(billingCatalog, "billing.pricing.lede")}</p>
        {plans === null
          ? <p className="billingError" role="status">{t(billingCatalog, "billing.pricing.unavailable")}</p>
          : (
            <>
              <PricingPlaceForm
                // A new answer is a new place: the picker starts from it, never from the last page's pick.
                key={`${plans.place.country ?? ""} ${plans.place.postal_code ?? ""} ${plans.place.status}`}
                catalog={billingCatalog} regionCatalog={authCatalog} locale={locale} place={plans.place}
                typedPostalCode={single(params.postal_code)}
              />
              <PricingCards
                catalog={billingCatalog} locale={locale} currency={plans.currency} place={plans.place} tax={plans.tax}
                plans={plans.plans}
              />
              <p className="pricingNote">{t(billingCatalog, "billing.pricing.currencyNote")}</p>
            </>
          )}
        <section className="pricingFaq" aria-labelledby="pricing-faq">
          <h2 id="pricing-faq">{t(billingCatalog, "billing.pricing.faqTitle")}</h2>
          <h3>{t(billingCatalog, "billing.pricing.faqLimitsQuestion")}</h3>
          <p>{t(billingCatalog, "billing.pricing.faqLimitsAnswer")}</p>
          <h3>{t(billingCatalog, "billing.pricing.faqCancelQuestion")}</h3>
          <p>{t(billingCatalog, "billing.pricing.faqCancelAnswer")}</p>
          <h3>{t(billingCatalog, "billing.pricing.faqTaxQuestionIncluded")}</h3>
          <p>{t(billingCatalog, FAQ_TAX_ANSWER[priced])}</p>
          <p className="billingActions">
            <a href="/terms">{t(billingCatalog, "billing.pricing.termsLink")}</a>
            <a href="/privacy">{t(billingCatalog, "billing.pricing.privacyLink")}</a>
          </p>
        </section>
      </div>
      <SiteFooter variant="full" billing={billingPageFooter()} />
    </div>
  );
}
