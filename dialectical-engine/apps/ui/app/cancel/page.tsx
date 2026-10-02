import { cookies } from "next/headers";
import { notFound } from "next/navigation";
import { CancelFlow } from "@/components/billing/CancelFlow";
import { SiteFooter } from "@/components/SiteFooter";
import { billingPageFooter } from "@/lib/billing/footerBilling";
import { billingIsOn } from "@/lib/billing/serverBilling";
import { isLocale, LOCALE_COOKIE } from "@/lib/i18n/locales";
import { loadNamespace } from "@/lib/i18n/server";

export default async function CancelPage() {
  if (!(await billingIsOn())) notFound();
  const requestedLocale = (await cookies()).get(LOCALE_COOKIE)?.value;
  const locale = isLocale(requestedLocale) ? requestedLocale : "en";
  const billingCatalog = await loadNamespace(locale, "billing");
  return (
    <main className="screen scroll billingPage">
      <div className="billingInner narrow">
        <CancelFlow catalog={billingCatalog} />
      </div>
      <SiteFooter variant="full" billing={billingPageFooter()} />
    </main>
  );
}
