import { cookies } from "next/headers";
import { PasswordResetFlow } from "@/components/PasswordResetFlow";
import { isLocale, LOCALE_COOKIE } from "@/lib/i18n/locales";
import { loadNamespace } from "@/lib/i18n/server";

export default async function ResetPasswordPage() {
  const requested = (await cookies()).get(LOCALE_COOKIE)?.value;
  const locale = isLocale(requested) ? requested : "en";
  // Every language has its own password-reset texts; the sign-in method names come from the mfa-recovery texts.
  const [catalog, mfaCatalog] = await Promise.all([loadNamespace(locale, "password-reset"), loadNamespace(locale, "mfa-recovery")]);
  return <PasswordResetFlow locale={locale} catalog={catalog} mfaCatalog={mfaCatalog} />;
}
