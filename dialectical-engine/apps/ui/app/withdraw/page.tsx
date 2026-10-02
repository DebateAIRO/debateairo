import { cookies } from "next/headers";
import { notFound } from "next/navigation";
import { SiteFooter } from "@/components/SiteFooter";
import { billingPageFooter } from "@/lib/billing/footerBilling";
import { billingIsOn } from "@/lib/billing/serverBilling";
import { isLocale, LOCALE_COOKIE } from "@/lib/i18n/locales";
import { loadNamespace } from "@/lib/i18n/server";
import { t } from "@/lib/i18n/translate";
import { COMPANY } from "@/lib/legal/pages";

/**
 * Terms §13: the page explains the withdrawal, links to where it is done when signed in (Settings), and names the
 * email route (the model form, or any clear statement, to the company's address), which the owner carries out with
 * D6b's `pnpm billing:withdraw` (ruling Q-9; README §14.8). Not found while billing is off, like /pricing.
 */
export default async function WithdrawPage() {
  if (!(await billingIsOn())) notFound();
  const requestedLocale = (await cookies()).get(LOCALE_COOKIE)?.value;
  const locale = isLocale(requestedLocale) ? requestedLocale : "en";
  const billingCatalog = await loadNamespace(locale, "billing");
  return (
    <main className="screen scroll billingPage">
      <div className="billingInner narrow">
        <h1 className="setTitle">{t(billingCatalog, "billing.withdrawPage.title")}</h1>
        <p>{t(billingCatalog, "billing.withdrawPage.who")}</p>
        <p>{t(billingCatalog, "billing.withdrawPage.refund")}</p>
        <p>{t(billingCatalog, "billing.withdrawPage.how")}</p>
        <div className="billingActions">
          <a className="btn btnDark" href={`/login?next=${encodeURIComponent("/settings")}`}>{t(billingCatalog, "billing.withdrawPage.signIn")}</a>
          <a className="btn" href="/settings">{t(billingCatalog, "billing.withdrawPage.settings")}</a>
        </div>
        <p data-withdraw-by-email>{t(billingCatalog, "billing.withdrawPage.byEmail", { email: COMPANY.emails.general })}</p>
      </div>
      <SiteFooter variant="full" billing={billingPageFooter()} />
    </main>
  );
}
