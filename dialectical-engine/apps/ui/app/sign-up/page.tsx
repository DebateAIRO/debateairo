import { cookies } from "next/headers";
import { SignUpFlow } from "@/components/SignUpFlow";
import { isLocale, LOCALE_COOKIE } from "@/lib/i18n/locales";
import { loadNamespace } from "@/lib/i18n/server";

export default async function SignUpPage() {
  const requestedLocale = (await cookies()).get(LOCALE_COOKIE)?.value;
  const locale = isLocale(requestedLocale) ? requestedLocale : "en";
  const catalog = await loadNamespace(locale, "auth");
  return <SignUpFlow catalog={catalog} />;
}
