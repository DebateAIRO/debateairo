"use client";

import { useSyncExternalStore } from "react";
import chromeEnglish from "@/messages/en/chrome.json";
import chromeRomanian from "@/messages/ro/chrome.json";
import { LOCALE_COOKIE } from "@/lib/i18n/locales";
import { t, type MessageCatalog } from "@/lib/i18n/translate";
import "./globals.css";

/*
 * The page for an error in the root layout itself. It replaces that layout, so it draws its own <html> and <body> and has
 * no catalogue from the server: it reads the reader's language from the same cookie the server reads. The site offers
 * English and Romanian, so those two catalogues are bundled here; any other language reads English, which is what its
 * chrome.error lines hold. The server's first draw (no cookie to read there) is English; the browser then shows the
 * reader's language. What went wrong is never shown.
 */
function cookieLocale(): "en" | "ro" {
  const prefix = `${LOCALE_COOKIE}=`;
  const values = document.cookie.split(";").map((part) => part.trim()).filter((part) => part.startsWith(prefix));
  // Of two same-named cookies the last wins, as the server reads them.
  return values.at(-1)?.slice(prefix.length) === "ro" ? "ro" : "en";
}

const noChanges = (): (() => void) => () => undefined;
const englishOnServer = (): "en" => "en";

export default function GlobalError({ reset }: Readonly<{ error: Error & { digest?: string }; reset: () => void }>) {
  const locale = useSyncExternalStore(noChanges, cookieLocale, englishOnServer);
  const catalog: MessageCatalog = locale === "ro" ? chromeRomanian : chromeEnglish;
  return (
    <html lang={locale}>
      <body>
        <main id="main-content" className="appMain">
          <div className="screen scroll">
            <div className="screenInner narrow">
              <h1>{t(catalog, "chrome.error.title")}</h1>
              <p className="muted" role="alert">{t(catalog, "chrome.error.body")}</p>
              <p>
                <button type="button" className="btn" onClick={() => reset()}>{t(catalog, "chrome.error.retry")}</button>
              </p>
              <p>
                {/* A full load, not a client move: the layout that failed is built again from the server. */}
                <a href="/">{t(catalog, "chrome.footer.home")}</a>
              </p>
            </div>
          </div>
        </main>
      </body>
    </html>
  );
}
