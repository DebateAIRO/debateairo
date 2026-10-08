import { cookies } from "next/headers";
import { PasswordResetFlow } from "@/components/PasswordResetFlow";
import { LOCALE_COOKIE } from "@/lib/i18n/locales";
import en from "@/messages/en/password-reset.json";
import ro from "@/messages/ro/password-reset.json";

export default async function ResetPasswordPage() {
  const locale = (await cookies()).get(LOCALE_COOKIE)?.value === "ro" ? "ro" : "en";
  return <PasswordResetFlow locale={locale} catalog={locale === "ro" ? ro : en} />;
}
