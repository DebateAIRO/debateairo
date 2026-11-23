import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { AuthShell } from "@/components/AuthShell";
import { LoginFlow } from "@/components/LoginFlow";
import { isLocale, LOCALE_COOKIE } from "@/lib/i18n/locales";
import { loadNamespace } from "@/lib/i18n/server";
import { safeReturnPath } from "@/lib/returnPath";
import { publicTurnstileConfig } from "@/lib/turnstile";
import { NONCE_REQUEST_HEADER } from "../../content-security-policy.mjs";
import { createServerContractClient, readSessionCookie, readTrustedClientIp, sessionCookieValue } from "@/lib/serverApi";
import { t } from "@/lib/i18n/translate";

/** The readable cookie the API sets beside the HttpOnly session cookie, of the same form. */
const CSRF_COOKIE = "__Host-debateai-csrf";

/**
 * Paid plans G3a, sign-in: like sign-up, an address where the service is not offered gets the
 * sentence instead of the form. A failed check shows the form: every sign-in route applies the same
 * gate and refuses with COUNTRY_SERVICE_UNAVAILABLE.
 */
async function signInOpenFor(requestHeaders: Headers): Promise<boolean> {
  try {
    const availability = await createServerContractClient(
      fetch, undefined, requestHeaders.get("user-agent") ?? undefined, readTrustedClientIp(requestHeaders)
    ).getGeoAvailability();
    return availability.service;
  } catch {
    return true;
  }
}

export default async function LoginPage({
  searchParams = Promise.resolve({})
}: {
  searchParams?: Promise<{ next?: string | string[] }>;
}) {
  const cookieStore = await cookies();
  const token = readSessionCookie(cookieStore);
  const requestedLocale = cookieStore.get(LOCALE_COOKIE)?.value;
  const locale = isLocale(requestedLocale) ? requestedLocale : "en";
  const catalog = await loadNamespace(locale, "auth");
  let sessionConfirmed = false;
  // Without its readable cookie a session is of no use in this browser: its pages treat it as signed out and send the
  // person here (lib/api.ts holdsNoSession). Sending them back would go round in a loop, so the form shows instead.
  if (token !== null && sessionCookieValue(cookieStore.get(CSRF_COOKIE)?.value) !== null) {
    const userAgent = (await headers()).get("user-agent") ?? undefined;
    const clientIp = readTrustedClientIp(await headers());
    try {
      await createServerContractClient(fetch, token, userAgent, clientIp).readSession();
      sessionConfirmed = true;
    } catch {
      // A stale or invalid cookie must not prevent a fresh login attempt.
    }
  }
  if (sessionConfirmed) {
    const requested = (await searchParams).next;
    redirect(safeReturnPath(typeof requested === "string" ? requested : null));
  }
  if (!(await signInOpenFor(await headers()))) {
    return (
      <AuthShell
        eyebrow={t(catalog, "auth.login.welcomeBack")}
        title={t(catalog, "auth.login.backToGraph")}
        description={t(catalog, "auth.signUp.countryUnavailable")}
        footer={null}
      >
        {null}
      </AuthShell>
    );
  }
  // Public config only: the "Didn't get the verification email?" entry reuses sign-up's resend screen.
  const requestHeaders = await headers();
  const turnstile = publicTurnstileConfig(process.env.TURNSTILE_SITE_KEY, requestHeaders.get(NONCE_REQUEST_HEADER) ?? undefined, process.env.NODE_ENV === "production");
  return <LoginFlow catalog={catalog} turnstile={turnstile} />;
}
