import { publicTurnstileConfig } from "@/lib/turnstile";
import { NONCE_REQUEST_HEADER } from "../../content-security-policy.mjs";
import Link from "next/link";
import { cookies, headers } from "next/headers";
import { AGE_REFUSAL_COOKIE_NAME, AGE_REFUSAL_COOKIE_VALUE } from "@debateai/contract";
import { AuthShell } from "@/components/AuthShell";
import { SignUpFlow } from "@/components/SignUpFlow";
import { resolveDobLocale } from "@/lib/dob/dobLocale";
import { isLocale, LOCALE_COOKIE } from "@/lib/i18n/locales";
import { loadNamespace } from "@/lib/i18n/server";
import { t } from "@/lib/i18n/translate";
import { createServerContractClient, readTrustedClientIp } from "@/lib/serverApi";

/**
 * Paid plans G3b (sentence G1). The visitor's address is checked server-side through
 * GET /v1/geo/availability, which answers two booleans and never the country. A failed check shows the
 * form: POST /v1/auth/register applies the same gate (before the age gate judges the date) and refuses
 * with the same sentence.
 */
async function signupOpenFor(requestHeaders: Headers): Promise<boolean> {
  try {
    const availability = await createServerContractClient(
      fetch, undefined, requestHeaders.get("user-agent") ?? undefined, readTrustedClientIp(requestHeaders)
    ).getGeoAvailability();
    return availability.signup;
  } catch {
    return true;
  }
}

export default async function SignUpPage() {
  const requestHeaders = await headers();
  // Public config only. Task11 consumes this through the reusable managed widget.
  const turnstile = publicTurnstileConfig(process.env.TURNSTILE_SITE_KEY, requestHeaders.get(NONCE_REQUEST_HEADER) ?? undefined, process.env.NODE_ENV === "production");
  const cookieStore = await cookies();
  const requestedLocale = cookieStore.get(LOCALE_COOKIE)?.value;
  const locale = isLocale(requestedLocale) ? requestedLocale : "en";
  const catalog = await loadNamespace(locale, "auth");
  // Age gate (8j): while the lockout lasts, a reload, a back navigation or a second attempt
  // renders the same refusal, straight from the server.
  const refused = cookieStore.get(AGE_REFUSAL_COOKIE_NAME)?.value === AGE_REFUSAL_COOKIE_VALUE;
  const dobLocale = resolveDobLocale(locale, (await headers()).get("accept-language"));
  // Paid plans G3b: sign-up closed for this address says so instead of showing a form. Asked only when
  // no age lockout is set, so during the lockout the age refusal stays all this browser sees (8j).
  if (!refused && !(await signupOpenFor(await headers()))) {
    return (
      <AuthShell
        eyebrow={t(catalog, "auth.signUp.eyebrow")}
        title={t(catalog, "auth.signUp.title")}
        description={t(catalog, "auth.signUp.countryUnavailable")}
        footer={null}
      >
        <p className="authPanelFooter">
          {t(catalog, "auth.signUp.alreadyHaveOne")} <Link href="/login">{t(catalog, "auth.signUp.logIn")}</Link>
        </p>
      </AuthShell>
    );
  }
  return <SignUpFlow catalog={catalog} dobLocale={dobLocale} refused={refused} turnstile={turnstile} />;
}
