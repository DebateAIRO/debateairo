"use client";

import { LanguageSwitcher } from "@/components/LanguageSwitcher";
import { CookiePreferencesButton } from "@/components/legal/CookiePreferencesButton";
import type { SiteFooterBilling } from "@/lib/billing/footerBilling";
import type { PaymentMarks } from "@/lib/billing/paymentMarks";
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
 * Paid plans (spec 2026-09-29 §2.10, R3-4), shown only while billing is on: each page is "not found" otherwise.
 * Pricing joins the PRODUCT column; cancel and withdraw are consumer rights, so they join the LEGAL column, which
 * also stays on a phone (legal.css hides the PRODUCT column there).
 */
const BILLING_PRODUCT_LINKS = [{ href: "/pricing", labelKey: "chrome.footer.pricing" }] as const;
const BILLING_LEGAL_LINKS = [
  { href: "/cancel", labelKey: "chrome.footer.cancel" },
  { href: "/withdraw", labelKey: "chrome.footer.withdraw" }
] as const;

/** DB-IP Lite's CC BY 4.0 licence asks for this credit link on the site (spec §1.5, §2.10); A14 keeps it billing-free. */
const DBIP_URL = "https://db-ip.com";

const NO_MARKS: PaymentMarks = Object.freeze({ netopia: false, visa: false, mastercard: false });

/** Spec §2.18: NETOPIA's logo first, then the card marks; each brand name stays untranslated in every locale. */
const MARK_IMAGES = [
  { mark: "netopia", src: "/payment-marks/netopia.svg", altKey: "chrome.footer.netopia" },
  { mark: "visa", src: "/payment-marks/visa.svg", altKey: "chrome.footer.visa" },
  { mark: "mastercard", src: "/payment-marks/mastercard.svg", altKey: "chrome.footer.mastercard" }
] as const satisfies ReadonlyArray<Readonly<{ mark: keyof PaymentMarks; src: string; altKey: string }>>;

/**
 * The marks whose artwork the owner supplied (`availablePaymentMarks()`, read by a server page), in one group: the full
 * footer's, and the checkout's under its Continue button (N25b). Nothing at all when none of the files is there.
 */
export function PaymentMarksGroup({ marks }: { marks: PaymentMarks }) {
  const { catalog } = useChromeI18n();
  const shown = MARK_IMAGES.filter(({ mark }) => marks[mark]);
  if (shown.length === 0) return null;
  return (
    <div className="siteFooterMarks" role="group" aria-label={t(catalog, "chrome.footer.paymentMarks")}>
      {shown.map(({ src, altKey }) => <img key={src} src={src} alt={t(catalog, altKey)} />)}
    </div>
  );
}

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
 *
 * Paid plans (P21, R3-4) extend the `full` shape only, through the optional `billing` facts a server page hands over
 * (`siteFooterBilling()`, `billingPageFooter()`, the landing's `landingPlans`): the DB-IP credit always, and while billing
 * is on the pricing, cancel and withdraw links and the marks whose artwork the owner supplied (NETOPIA's logo, Visa,
 * Mastercard: `PaymentMarksGroup`). Without the prop (local mode alike) nothing about paying shows. The `line` shape
 * never knows billing's state: it renders on every page.
 */
export function SiteFooter({ variant, billing = null }: { variant: "full" | "line"; billing?: SiteFooterBilling | null }) {
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

  const billingOn = billing?.billingOn === true;
  const marks = billing !== null && billing.billingOn ? billing.marks : NO_MARKS;
  const productLinks: ReadonlyArray<Readonly<{ href: string; labelKey: string }>> = billingOn
    ? [...PRODUCT_LINKS, ...BILLING_PRODUCT_LINKS]
    : PRODUCT_LINKS;
  const billingLegalLinks = billingOn
    ? BILLING_LEGAL_LINKS.map(({ href, labelKey }) => (
      <li key={href}>
        <a className="siteFooterLink" href={href}>
          {t(catalog, labelKey)}
        </a>
      </li>
    ))
    : null;

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
            {productLinks.map(({ href, labelKey }) => (
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
            {billingLegalLinks}
            <li>
              <CookiePreferencesButton className="siteFooterLink" label={cookiePreferences} />
            </li>
          </ul>
        </nav>
      </div>
      <PaymentMarksGroup marks={marks} />
      <div className="siteFooterBase">
        <span className="siteFooterCopyright">{copyright}</span>
        <a className="siteFooterLink siteFooterCredit" href={DBIP_URL}>
          {t(catalog, "chrome.footer.dbipCredit")}
        </a>
        <span className="siteFooterLang">
          <LanguageSwitcher />
        </span>
      </div>
    </footer>
  );
}
