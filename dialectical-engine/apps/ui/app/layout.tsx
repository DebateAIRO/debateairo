import { Fraunces, Plus_Jakarta_Sans, JetBrains_Mono } from "next/font/google";
import { TopBar } from "@/components/TopBar";
import { CookieConsent } from "@/components/consent/CookieConsent";
import { cookies } from "next/headers";
import { I18nProvider } from "@/lib/i18n/I18nProvider";
import { getLocale, isLocale, LOCALE_COOKIE } from "@/lib/i18n/locales";
import { loadNamespace } from "@/lib/i18n/server";
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

export const metadata = {
  title: "Dialectical Engine",
  description: "A reasoning instrument — several AI models argue a claim in a structured tree."
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const cookieLocale = (await cookies()).get(LOCALE_COOKIE)?.value;
  const locale = isLocale(cookieLocale) ? cookieLocale : "en";
  const localeDefinition = getLocale(locale);
  const [chrome, debateViews, support] = await Promise.all([
    loadNamespace(locale, "chrome"),
    loadNamespace(locale, "debateViews"),
    loadNamespace(locale, "support")
  ]);
  const sharedCatalog = Object.freeze({ ...chrome, ...debateViews, ...support });

  return (
    <html
      lang={locale}
      dir={localeDefinition.dir}
      className={`${display.variable} ${sans.variable} ${mono.variable}`}
      suppressHydrationWarning
    >
      <head>
        <script
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
          <div className="appShell">
            <TopBar />
            {children}
            <CookieConsent />
          </div>
        </I18nProvider>
      </body>
    </html>
  );
}
