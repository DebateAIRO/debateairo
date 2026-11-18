"use client";

import Link from "next/link";
import { useChromeI18n } from "@/lib/i18n/I18nProvider";
import { t } from "@/lib/i18n/translate";

/* The app's page for an unexpected error while a page is shown, in the reader's language: the root layout around it
   still stands, so its chrome catalogue is read from the layout's provider. Next's built-in page printed English for
   every reader. What went wrong is never shown (it can carry server detail); the reader gets one plain line, a button
   that draws the page again (reset), and the way home. */
export default function PageError({ reset }: Readonly<{ error: Error & { digest?: string }; reset: () => void }>) {
  const { catalog } = useChromeI18n();
  return (
    <div className="screen scroll">
      <div className="screenInner narrow">
        <h1>{t(catalog, "chrome.error.title")}</h1>
        <p className="muted" role="alert">{t(catalog, "chrome.error.body")}</p>
        <p>
          <button type="button" className="btn" onClick={() => reset()}>{t(catalog, "chrome.error.retry")}</button>
        </p>
        <p>
          <Link href="/">{t(catalog, "chrome.footer.home")}</Link>
        </p>
      </div>
    </div>
  );
}
