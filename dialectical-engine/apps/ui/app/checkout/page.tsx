import { cookies, headers } from "next/headers";
import { notFound, redirect } from "next/navigation";
import { currentDocument } from "@debateai/legal-manifest";
import { CheckoutFlow, type CheckoutConsents } from "@/components/billing/CheckoutFlow";
import { ageConfirmationHref } from "@/lib/ageConfirmation";
import { isPaidPlanId } from "@/lib/billing/plans";
import { ageConfirmationOwed, billingIsOn } from "@/lib/billing/serverBilling";
import { isLocale, LOCALE_COOKIE, type LocaleCode } from "@/lib/i18n/locales";
import { loadNamespace } from "@/lib/i18n/server";
import { t } from "@/lib/i18n/translate";
import { readSessionCookie } from "@/lib/serverApi";
import { NONCE_REQUEST_HEADER } from "../../content-security-policy.mjs";

/**
 * The consent sentences' manifest pairs for the locale the page shows them in (spec §2.5.3, L2). Never another
 * locale's: P8c checks the pair against `input.locale`'s entry, so an English pair sent with `de` is always refused
 * (LEGAL_DOCUMENT_STALE). Without the reader's own pair the flow shows its error and offers no card step.
 */
function consentPairs(locale: LocaleCode): CheckoutConsents | null {
  const renewal = currentDocument("CONSENT_RENEWAL", locale);
  const immediateStart = currentDocument("CONSENT_IMMEDIATE_START", locale);
  return renewal === null || immediateStart === null ? null : { renewal, immediateStart };
}

export default async function CheckoutPage({
  searchParams = Promise.resolve({})
}: {
  searchParams?: Promise<{ plan?: string | string[] }>;
}) {
  const cookieStore = await cookies();
  const requestedLocale = cookieStore.get(LOCALE_COOKIE)?.value;
  const locale = isLocale(requestedLocale) ? requestedLocale : "en";
  const requestedPlan = (await searchParams).plan;
  const planId = isPaidPlanId(requestedPlan) ? requestedPlan : null;
  const sessionToken = readSessionCookie(cookieStore);
  const here = `/checkout?plan=${planId ?? "PLUS"}`;
  if (sessionToken === null) redirect(`/login?next=${encodeURIComponent(here)}`);
  if (!(await billingIsOn())) notFound();
  // R3-2: the age gate's interstitial comes first, and its own return path brings the person back to this plan.
  if (await ageConfirmationOwed(sessionToken)) redirect(ageConfirmationHref(here));
  const billingCatalog = await loadNamespace(locale, "billing");
  if (planId === null) {
    return (
      <main className="screen scroll billingPage">
        <div className="billingInner narrow">
          <p className="billingError" role="alert">{t(billingCatalog, "billing.checkout.unknownPlan")}</p>
          <p><a className="btn" href="/pricing">{t(billingCatalog, "billing.checkout.pricingLink")}</a></p>
        </div>
      </main>
    );
  }
  const headerStore = await headers();
  const nonce = headerStore.get(NONCE_REQUEST_HEADER) ?? undefined;
  const sdkOrigin = process.env.XMONEY_SDK_ORIGIN?.trim() || null;
  return (
    <main className="screen scroll billingPage">
      <div className="billingInner narrow">
        <CheckoutFlow
          planId={planId}
          locale={locale}
          catalog={billingCatalog}
          consents={consentPairs(locale)}
          sdkOrigin={sdkOrigin}
          nonce={nonce}
        />
      </div>
    </main>
  );
}
