"use client";

import { useEffect, useState, type ReactNode } from "react";
import type { LocaleCode } from "@/lib/i18n/locales";
import type { MessageCatalog } from "@/lib/i18n/translate";
import authEnglish from "@/messages/en/auth.json";

type CatalogModule = Readonly<{ default: MessageCatalog }>;
type CatalogLoader = () => Promise<CatalogModule>;

const AUTH_CATALOG_LOADERS = Object.freeze({
  ar: () => import("@/messages/ar/auth.json"),
  bg: () => import("@/messages/bg/auth.json"),
  cs: () => import("@/messages/cs/auth.json"),
  da: () => import("@/messages/da/auth.json"),
  de: () => import("@/messages/de/auth.json"),
  el: () => import("@/messages/el/auth.json"),
  en: () => import("@/messages/en/auth.json"),
  es: () => import("@/messages/es/auth.json"),
  et: () => import("@/messages/et/auth.json"),
  fi: () => import("@/messages/fi/auth.json"),
  fr: () => import("@/messages/fr/auth.json"),
  ga: () => import("@/messages/ga/auth.json"),
  he: () => import("@/messages/he/auth.json"),
  hi: () => import("@/messages/hi/auth.json"),
  hr: () => import("@/messages/hr/auth.json"),
  hu: () => import("@/messages/hu/auth.json"),
  id: () => import("@/messages/id/auth.json"),
  it: () => import("@/messages/it/auth.json"),
  ja: () => import("@/messages/ja/auth.json"),
  ko: () => import("@/messages/ko/auth.json"),
  lt: () => import("@/messages/lt/auth.json"),
  lv: () => import("@/messages/lv/auth.json"),
  mt: () => import("@/messages/mt/auth.json"),
  nl: () => import("@/messages/nl/auth.json"),
  pl: () => import("@/messages/pl/auth.json"),
  pt: () => import("@/messages/pt/auth.json"),
  ro: () => import("@/messages/ro/auth.json"),
  ru: () => import("@/messages/ru/auth.json"),
  sk: () => import("@/messages/sk/auth.json"),
  sl: () => import("@/messages/sl/auth.json"),
  sv: () => import("@/messages/sv/auth.json"),
  tr: () => import("@/messages/tr/auth.json"),
  uk: () => import("@/messages/uk/auth.json"),
  vi: () => import("@/messages/vi/auth.json"),
  zh: () => import("@/messages/zh/auth.json")
} satisfies Readonly<Record<LocaleCode, CatalogLoader>>);

export function useSelectedAuthCatalog(locale: LocaleCode): MessageCatalog {
  const [catalog, setCatalog] = useState<MessageCatalog>(authEnglish);

  useEffect(() => {
    let active = true;
    setCatalog(authEnglish);
    void AUTH_CATALOG_LOADERS[locale]().then((loaded) => {
      if (active) setCatalog(loaded.default);
    }).catch(() => {
      // Error boundaries and mailed-link enrollment must retain usable English
      // copy if a locale chunk cannot be loaded.
    });
    return () => {
      active = false;
    };
  }, [locale]);

  return catalog;
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
