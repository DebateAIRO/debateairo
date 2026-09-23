"use client";

import { useEffect, useState } from "react";

import { useSelectedAuthCatalog } from "../components/AuthShell";
import {
  DEFAULT_LOCALE,
  getLocale,
  isLocale,
  LOCALE_COOKIE,
  type LocaleCode
} from "../lib/i18n/locales";
import { CLIENT_REPORTS, reportClientFault } from "../lib/obs/reporter.js";
import { t } from "../lib/i18n/translate";

function selectedLocaleFromCookie(): LocaleCode {
  if (typeof document === "undefined") return DEFAULT_LOCALE;
  const prefix = `${LOCALE_COOKIE}=`;
  const value = document.cookie.split(";")
    .map((part) => part.trim())
    .find((part) => part.startsWith(prefix))
    ?.slice(prefix.length);
  return isLocale(value) ? value : DEFAULT_LOCALE;
}

export default function GlobalError({ error, reset }: Readonly<{
  error: Error & { digest?: string };
  reset: () => void;
}>) {
  const [locale, setLocale] = useState<LocaleCode>(DEFAULT_LOCALE);
  const catalog = useSelectedAuthCatalog(locale);
  const localeDefinition = getLocale(locale);
  useEffect(() => {
    void reportClientFault(CLIENT_REPORTS.global);
    setLocale(selectedLocaleFromCookie());
  }, [error]);
  return (
    <html lang={locale} dir={localeDefinition.dir}>
      <body>
        <main role="alert">
          <h1>{t(catalog, "auth.error.globalTitle")}</h1>
          <button type="button" onClick={reset}>{t(catalog, "auth.error.tryAgain")}</button>
        </main>
      </body>
    </html>
  );
}
