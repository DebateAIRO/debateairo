import { cookies } from "next/headers";
import { notFound, redirect } from "next/navigation";
import { ChargeStatusPoller } from "@/components/billing/ChargeStatusPoller";
import { SiteFooter } from "@/components/SiteFooter";
import { billingPageFooter } from "@/lib/billing/footerBilling";
import { billingIsOn, sessionConfirmed } from "@/lib/billing/serverBilling";
import { isLocale, LOCALE_COOKIE } from "@/lib/i18n/locales";
import { loadNamespace } from "@/lib/i18n/server";
import { t } from "@/lib/i18n/translate";
import { readSessionCookie } from "@/lib/serverApi";

const CHARGE_REF = /^[0-9a-f]{32}$/;

/** xMoney's backUrl (spec §2.10). It shows the charge state our server reports, never a browser verdict. */
export default async function CheckoutReturnPage({
  searchParams = Promise.resolve({})
}: {
  searchParams?: Promise<{ charge?: string | string[] }>;
}) {
  const cookieStore = await cookies();
  const requestedLocale = cookieStore.get(LOCALE_COOKIE)?.value;
  const locale = isLocale(requestedLocale) ? requestedLocale : "en";
  const charge = (await searchParams).charge;
  const chargeRef = typeof charge === "string" && CHARGE_REF.test(charge) ? charge : null;
  // Like /pricing: billing off (or local mode) is "not found" for everyone, signed in or not, before any redirect.
  if (!(await billingIsOn())) notFound();
  const sessionToken = readSessionCookie(cookieStore);
  const signIn = `/login?next=${encodeURIComponent(chargeRef === null ? "/settings" : `/checkout/return?charge=${chargeRef}`)}`;
  if (sessionToken === null) redirect(signIn);
  // Spec §2.10: an expired or revoked session is no sign-in either (only the API's 401 says so).
  if (!(await sessionConfirmed(sessionToken))) redirect(signIn);
  const billingCatalog = await loadNamespace(locale, "billing");
  return (
    <main className="screen scroll billingPage">
      <div className="billingInner narrow">
        <h1 className="setTitle">{t(billingCatalog, "billing.checkout.returnTitle")}</h1>
        {chargeRef === null
          ? <p className="billingError" role="alert">{t(billingCatalog, "billing.checkout.genericError")}</p>
          : (
            <ChargeStatusPoller
              chargeRef={chargeRef}
              catalog={billingCatalog}
              successText={t(billingCatalog, "billing.checkout.returnSucceeded")}
              failureText={t(billingCatalog, "billing.checkout.failed")}
            />
          )}
        <p className="billingActions"><a className="btn" href="/settings">{t(billingCatalog, "billing.checkout.goToSettings")}</a></p>
      </div>
      <SiteFooter variant="full" billing={billingPageFooter()} />
    </main>
  );
}
