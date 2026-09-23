"use client";

import { useEffect } from "react";

import { useSelectedAuthCatalog } from "../components/AuthShell";
import { useChromeI18n } from "../lib/i18n/I18nProvider";
import { CLIENT_REPORTS, reportClientFault } from "../lib/obs/reporter.js";
import { t } from "../lib/i18n/translate";

export default function SegmentError({ error, reset }: Readonly<{
  error: Error & { digest?: string };
  reset: () => void;
}>) {
  const { locale } = useChromeI18n();
  const catalog = useSelectedAuthCatalog(locale);
  useEffect(() => {
    void reportClientFault(CLIENT_REPORTS.segment);
  }, [error]);
  return (
    <main className="screen" role="alert">
      <h1>{t(catalog, "auth.error.segmentTitle")}</h1>
      <button type="button" onClick={reset}>{t(catalog, "auth.error.tryAgain")}</button>
    </main>
  );
}
