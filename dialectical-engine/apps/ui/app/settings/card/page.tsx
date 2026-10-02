import { cookies, headers } from "next/headers";
import { notFound, redirect } from "next/navigation";
import { CardChangeFlow } from "@/components/billing/CardChangeFlow";
import { billingIsOn, sessionConfirmed } from "@/lib/billing/serverBilling";
import { isLocale, LOCALE_COOKIE } from "@/lib/i18n/locales";
import { loadNamespace } from "@/lib/i18n/server";
import { readSessionCookie } from "@/lib/serverApi";
import { NONCE_REQUEST_HEADER } from "../../../content-security-policy.mjs";

/** P8c's charge ref: 32 lower-case hex (A24). Anything else in `?charge=` is ignored. */
const CHARGE_REF = /^[0-9a-f]{32}$/;

export default async function CardChangePage({
  searchParams = Promise.resolve({})
}: {
  searchParams?: Promise<{ charge?: string | string[] }>;
}) {
  const cookieStore = await cookies();
  // P12e's backUrl is /settings/card?charge=<ref>: after a bank check that left the page, poll that charge. It is
  // read BEFORE the sign-in redirect, so a person who comes back signed out still lands on the waiting screen, never
  // on "Continue to card details" (which would start a second hold).
  const charge = (await searchParams).charge;
  const returnedChargeRef = typeof charge === "string" && CHARGE_REF.test(charge) ? charge : null;
  // Like /pricing and /checkout: billing off (or local mode) is "not found" for everyone, signed in or not, before
  // any redirect.
  if (!(await billingIsOn())) notFound();
  const sessionToken = readSessionCookie(cookieStore);
  const signIn = `/login?next=${encodeURIComponent(returnedChargeRef === null ? "/settings/card" : `/settings/card?charge=${returnedChargeRef}`)}`;
  if (sessionToken === null) redirect(signIn);
  // Spec §2.10: an expired or revoked session is no sign-in either (only the API's 401 says so).
  if (!(await sessionConfirmed(sessionToken))) redirect(signIn);
  const requestedLocale = cookieStore.get(LOCALE_COOKIE)?.value;
  const locale = isLocale(requestedLocale) ? requestedLocale : "en";
  const billingCatalog = await loadNamespace(locale, "billing");
  const nonce = (await headers()).get(NONCE_REQUEST_HEADER) ?? undefined;
  const sdkOrigin = process.env.XMONEY_SDK_ORIGIN?.trim() || null;
  return (
    <main className="screen scroll billingPage">
      <div className="billingInner narrow">
        <CardChangeFlow catalog={billingCatalog} locale={locale} sdkOrigin={sdkOrigin} nonce={nonce}
          returnedChargeRef={returnedChargeRef} />
      </div>
    </main>
  );
}
