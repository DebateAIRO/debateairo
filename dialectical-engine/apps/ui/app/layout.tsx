import type { Metadata } from "next";
import { headers } from "next/headers";
import { Fraunces, Plus_Jakarta_Sans, JetBrains_Mono } from "next/font/google";
import { TopBar } from "@/components/TopBar";
import { CookieConsent } from "@/components/consent/CookieConsent";
import { LegalDocumentsProvider } from "@/components/consent/LegalDocumentsProvider";
import { ConsentCatalogProvider } from "@/components/consent/useConsentCatalog";
import { cookies } from "next/headers";
import { I18nProvider } from "@/lib/i18n/I18nProvider";
import { getLocale, isLocale, LOCALE_COOKIE, type LocaleCode } from "@/lib/i18n/locales";
import { loadNamespace } from "@/lib/i18n/server";
import { t } from "@/lib/i18n/translate";
import { loadLegalDocument } from "@/lib/legal/server";
import { NONCE_REQUEST_HEADER } from "../content-security-policy.mjs";
import "./globals.css";
import "./language-switcher.css";

const display = Fraunces({
  subsets: ["latin"],
  axes: ["SOFT", "WONK", "opsz"],
  style: ["normal", "italic"],
  variable: "--font-fraunces",
  display: "swap"
});

const sans = Plus_Jakarta_Sans({
  subsets: ["latin"],
  style: ["normal", "italic"],
  variable: "--font-jakarta",
  display: "swap"
});

const mono = JetBrains_Mono({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  variable: "--font-mono-src",
  display: "swap"
});

async function requestLocale(): Promise<LocaleCode> {
  const cookieLocale = (await cookies()).get(LOCALE_COOKIE)?.value;
  return isLocale(cookieLocale) ? cookieLocale : "en";
}

// V ruling (FIX-VRULINGS 2): the description follows the reader's locale; the
// title stays the brand. Pages exporting their own metadata still override it.
export async function generateMetadata(): Promise<Metadata> {
  const chrome = await loadNamespace(await requestLocale(), "chrome");
  return {
    title: "Dialectical Engine",
    description: t(chrome, "chrome.metaDescription")
  };
}

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const locale = await requestLocale();
  const localeDefinition = getLocale(locale);
  const [chrome, debateViews, support, consent, privacy, terms] = await Promise.all([
    loadNamespace(locale, "chrome"),
    loadNamespace(locale, "debateViews"),
    loadNamespace(locale, "support"),
    // Served with the render so every consent surface paints in the reader's locale
    // on its first render, with no client chunk load and no English in between.
    loadNamespace(locale, "consent"),
    loadLegalDocument(locale, "privacy"),
    loadLegalDocument(locale, "terms")
  ]);
  const sharedCatalog = Object.freeze({ ...chrome, ...debateViews, ...support });

  // F-08: the per-request nonce the middleware stamped on the request. Reading
  // headers() also makes every route dynamic, so no prerendered HTML can ever
  // carry a stale nonce.
  const nonce = (await headers()).get(NONCE_REQUEST_HEADER) ?? undefined;
  return (
    <html
      lang={locale}
      dir={localeDefinition.dir}
      className={`${display.variable} ${sans.variable} ${mono.variable}`}
      suppressHydrationWarning
    >
      <head>
        <script
          nonce={nonce}
          // Browsers blank a nonce attribute once parsed (CSP hiding), so hydration would see
          // nonce="" against the server value; the attribute is still enforced.
          suppressHydrationWarning
          dangerouslySetInnerHTML={{
            __html:
              "try{var m=localStorage.getItem('debateai.mode');" +
              "if(m==='chamber'||m==='terracotta')document.documentElement.dataset.mode=m;}catch(e){}"
          }}
        />
      </head>
      <body
        suppressHydrationWarning
        style={{
          fontFamily:
            'var(--font-sans), "Noto Sans", "Noto Sans Arabic", "Noto Sans Hebrew", "Noto Sans Devanagari", "Noto Sans SC", "Noto Sans JP", "Noto Sans KR", sans-serif'
        }}
      >
        <I18nProvider locale={locale} catalog={sharedCatalog}>
          <ConsentCatalogProvider catalog={consent}>
            <LegalDocumentsProvider locale={locale} privacy={privacy} terms={terms}>
              <div className="appShell">
                <TopBar />
                {children}
                <CookieConsent />
              </div>
            </LegalDocumentsProvider>
          </ConsentCatalogProvider>
        </I18nProvider>
      </body>
    </html>
  );
}
