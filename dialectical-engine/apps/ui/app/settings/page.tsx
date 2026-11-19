import { cookies } from "next/headers";
import { currentDocument } from "@debateai/legal-manifest";
import { SettingsPageClient } from "@/components/SettingsPageClient";
import { billingState } from "@/lib/billing/serverBilling";
import { isLocale, LOCALE_COOKIE } from "@/lib/i18n/locales";
import { loadNamespace } from "@/lib/i18n/server";

export default async function SettingsPage() {
  const requestedLocale = (await cookies()).get(LOCALE_COOKIE)?.value;
  const locale = isLocale(requestedLocale) ? requestedLocale : "en";
  // The same plans read the checkout makes: it says whether card payments are test-only, for the upgrade's note.
  const [catalog, newDebateCatalog, billingCatalog, billing] = await Promise.all([
    loadNamespace(locale, "settings"),
    loadNamespace(locale, "newDebate"),
    loadNamespace(locale, "billing"),
    billingState()
  ]);
  return (
    <SettingsPageClient catalog={catalog} locale={locale} newDebateCatalog={newDebateCatalog} billingCatalog={billingCatalog}
      renewalConsent={currentDocument("CONSENT_RENEWAL", locale)} testMode={billing.testMode} />
  );
}
