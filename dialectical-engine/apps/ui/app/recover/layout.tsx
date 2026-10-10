import type { ReactNode } from "react";
import { cookies } from "next/headers";
import { AuthCatalogProvider } from "@/components/AuthShell";
import { MfaRecoveryCatalogProvider } from "@/components/MfaRecoveryCatalog";
import { isLocale, LOCALE_COOKIE } from "@/lib/i18n/locales";
import { loadNamespace } from "@/lib/i18n/server";

/* Serves the reader's `auth` catalogue with the render of the client-only MFA
   enrolment page (and of /verify-email, which re-exports this layout), the way
   the root layout serves chrome and consent: no client chunk, no English first
   paint (FIX-DEBATE-CATALOGS follow-up 4, review F5). */
export default async function EnrollMfaLayout({ children }: { children: ReactNode }) {
  const requestedLocale = (await cookies()).get(LOCALE_COOKIE)?.value;
  const locale = isLocale(requestedLocale) ? requestedLocale : "en";
  // The footer's "Know your password…" link reads the mfa-recovery catalogue (owner, 2026-10-09: all 35 locales).
  const [catalog, mfaRecoveryCatalog] = await Promise.all([loadNamespace(locale, "auth"), loadNamespace(locale, "mfa-recovery")]);
  return <AuthCatalogProvider catalog={catalog}><MfaRecoveryCatalogProvider catalog={mfaRecoveryCatalog}>{children}</MfaRecoveryCatalogProvider></AuthCatalogProvider>;
}
