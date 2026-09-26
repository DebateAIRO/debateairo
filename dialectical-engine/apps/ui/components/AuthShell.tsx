"use client";

import { createContext, useContext, type ReactNode } from "react";
import type { LocaleCode } from "@/lib/i18n/locales";
import type { MessageCatalog } from "@/lib/i18n/translate";
import authEnglish from "@/messages/en/auth.json";

/**
 * The reader's `auth` catalogue for the client-only auth routes (/enroll-mfa and
 * its /verify-email entry), SERVED WITH THE SERVER RENDER by those routes'
 * layouts (FIX-DEBATE-CATALOGS follow-up 4, review F5). It replaces 35 client
 * `import()` chunks behind an English first state, so the enrolment page paints
 * in the reader's locale on its first render and never falls back to English
 * when a chunk fails.
 */
const AuthCatalogContext = createContext<MessageCatalog | null>(null);

export function AuthCatalogProvider({ catalog, children }: { catalog: MessageCatalog; children: ReactNode }) {
  return <AuthCatalogContext.Provider value={catalog}>{children}</AuthCatalogContext.Provider>;
}

export function useSelectedAuthCatalog(locale: LocaleCode): MessageCatalog {
  const served = useContext(AuthCatalogContext);
  if (served !== null) return served;
  // English is the English path only: an "en" reader outside the provider
  // (isolated component renders) reads it directly.
  if (locale === "en") return authEnglish;
  throw new Error(
    `useSelectedAuthCatalog: no auth catalogue was served for "${locale}"; mount AuthCatalogProvider with the locale's auth namespace`
  );
}

/* The design document's auth card (Turn 7 · 7a/7b, Turn 8 · 8a-8c): a 540px
   card on a dotted ground, holding a brand mark, the eyebrow/headline/lede
   block, and a shell-around-core bezel panel that carries the form. */
export function AuthShell({
  eyebrow,
  title,
  description,
  children,
  footer
}: Readonly<{
  eyebrow: string;
  title: string;
  description: string;
  children: ReactNode;
  footer: ReactNode;
}>) {
  return (
    <main className="authScreen scroll" aria-labelledby="auth-title">
      <div className="authCard">
        <div className="authCardInner">
          <div className="authBrand">
            <span className="authBrandMark" aria-hidden="true">
              <span className="authBrandDiamond" />
            </span>
            <span className="authBrandName">Dialectical Engine</span>
          </div>
          <header className="authIntro">
            <p className="authEyebrow">{eyebrow}</p>
            <h1 className="authHeadline" id="auth-title">{title}</h1>
            <p className="authLede">{description}</p>
          </header>
          <div className="authPanel">
            <div className="authPanelCore">{children}</div>
          </div>
          {footer === null ? null : <footer className="authFooter">{footer}</footer>}
        </div>
      </div>
    </main>
  );
}
