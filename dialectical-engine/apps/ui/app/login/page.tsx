import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { LoginFlow } from "@/components/LoginFlow";
import { isLocale, LOCALE_COOKIE } from "@/lib/i18n/locales";
import { loadNamespace } from "@/lib/i18n/server";
import { createServerContractClient, readSessionCookie, readTrustedClientIp } from "@/lib/serverApi";

export default async function LoginPage() {
  const cookieStore = await cookies();
  const token = readSessionCookie(cookieStore);
  const requestedLocale = cookieStore.get(LOCALE_COOKIE)?.value;
  const locale = isLocale(requestedLocale) ? requestedLocale : "en";
  const catalog = await loadNamespace(locale, "auth");
  let sessionConfirmed = false;
  if (token !== null) {
    const userAgent = (await headers()).get("user-agent") ?? undefined;
    const clientIp = readTrustedClientIp(await headers());
    try {
      await createServerContractClient(fetch, token, userAgent, clientIp).readSession();
      sessionConfirmed = true;
    } catch {
      // A stale or invalid cookie must not prevent a fresh login attempt.
    }
  }
  if (sessionConfirmed) redirect("/#start-a-debate");
  return <LoginFlow catalog={catalog} />;
}
