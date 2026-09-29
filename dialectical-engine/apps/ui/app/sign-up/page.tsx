import { cookies, headers } from "next/headers";
import { AGE_REFUSAL_COOKIE_NAME, AGE_REFUSAL_COOKIE_VALUE } from "@debateai/contract";
import { SignUpFlow } from "@/components/SignUpFlow";
import { resolveDobLocale } from "@/lib/dob/dobLocale";
import { isLocale, LOCALE_COOKIE } from "@/lib/i18n/locales";
import { loadNamespace } from "@/lib/i18n/server";

export default async function SignUpPage() {
  const cookieStore = await cookies();
  const requestedLocale = cookieStore.get(LOCALE_COOKIE)?.value;
  const locale = isLocale(requestedLocale) ? requestedLocale : "en";
  const catalog = await loadNamespace(locale, "auth");
  // Age gate (8j): while the lockout lasts, a reload, a back navigation or a second attempt
  // renders the same refusal, straight from the server.
  const refused = cookieStore.get(AGE_REFUSAL_COOKIE_NAME)?.value === AGE_REFUSAL_COOKIE_VALUE;
  const dobLocale = resolveDobLocale(locale, (await headers()).get("accept-language"));
  return <SignUpFlow catalog={catalog} dobLocale={dobLocale} refused={refused} />;
}
