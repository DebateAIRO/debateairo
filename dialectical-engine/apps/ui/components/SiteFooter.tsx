"use client";

import { LanguageSwitcher } from "@/components/LanguageSwitcher";
import { CookiePreferencesButton } from "@/components/legal/CookiePreferencesButton";
import { useChromeI18n } from "@/lib/i18n/I18nProvider";
import { t } from "@/lib/i18n/translate";
import { COMPANY, LEGAL_PAGES } from "@/lib/legal/pages";

const PRODUCT_NAME = "Dialectical Engine";

const PRODUCT_LINKS = [
  { href: "/", labelKey: "chrome.footer.home" },
  { href: "/help", labelKey: "chrome.help" },
  { href: "/settings", labelKey: "chrome.settings" }
] as const;

/**
 * The site footer (design 15a/15b/15c), one component in two shapes:
 *
 * - `full` — marketing and legal pages: company block, PRODUCT and LEGAL columns, then the
 *   copyright line with the language switcher. On a phone the columns stack (15c) in CSS.
 * - `line` — every other screen: copyright, the seven legal links and cookie preferences on one
 *   line, so the canvas keeps its room (15b).
 *
 * The root layout renders the `line` footer after every page; a page that renders the `full`
 * footer hides it through `.appShell:has(.siteFooterFull) > .siteFooterLine` in `app/legal.css`,
 * so no page has to know which footer the layout drew.
 */
export function SiteFooter({ variant }: { variant: "full" | "line" }) {
  const { catalog } = useChromeI18n();
  const copyright = `© ${new Date().getFullYear()} ${COMPANY.legalName}`;
  const cookiePreferences = t(catalog, "chrome.footer.cookiePreferences");
  const legalLinks = LEGAL_PAGES.map(({ href, labelKey }) => (
    <li key={href}>
      <a className="siteFooterLink" href={href}>
        {t(catalog, labelKey)}
      </a>
    </li>
  ));

  if (variant === "line") {
    return (
      <footer className="siteFooterLine" aria-label={t(catalog, "chrome.footer.label")}>
        <span className="siteFooterCopyright">{copyright}</span>
        <nav aria-label={t(catalog, "chrome.legalPages")}>
          <ul className="siteFooterLineLinks">
            {legalLinks}
            <li>
              <CookiePreferencesButton className="siteFooterLink" label={cookiePreferences} />
            </li>
          </ul>
        </nav>
      </footer>
    );
  }

  return (
    <footer className="siteFooterFull" aria-label={t(catalog, "chrome.footer.label")}>
      <div className="siteFooterColumns">
        <div className="siteFooterCompany">
          <span className="siteFooterBrand">
            <span className="brandDiamond" aria-hidden>
              <span className="brandDiamondCore" />
            </span>
            <span className="siteFooterBrandName">{PRODUCT_NAME}</span>
          </span>
          <span>
            {COMPANY.legalName} · {t(catalog, "chrome.footer.location")}
          </span>
          <a className="siteFooterLink" href={`mailto:${COMPANY.emails.privacy}`}>
            {COMPANY.emails.privacy}
          </a>
        </div>
        <nav className="siteFooterColumn" aria-label={t(catalog, "chrome.footer.product")}>
          <span className="siteFooterHead" aria-hidden>
            {t(catalog, "chrome.footer.product")}
          </span>
          <ul>
            {PRODUCT_LINKS.map(({ href, labelKey }) => (
              <li key={href}>
                <a className="siteFooterLink" href={href}>
                  {t(catalog, labelKey)}
                </a>
              </li>
            ))}
          </ul>
        </nav>
        <nav className="siteFooterColumn" aria-label={t(catalog, "chrome.legalPages")}>
          <span className="siteFooterHead" aria-hidden>
            {t(catalog, "chrome.legalPages")}
          </span>
          <ul className="siteFooterLegalGrid">
            {legalLinks}
            <li>
              <CookiePreferencesButton className="siteFooterLink" label={cookiePreferences} />
            </li>
          </ul>
        </nav>
      </div>
      <div className="siteFooterBase">
        <span className="siteFooterCopyright">{copyright}</span>
        <span className="siteFooterLang">
          <LanguageSwitcher />
        </span>
      </div>
    </footer>
  );
}
