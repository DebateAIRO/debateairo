"use client";

import { LanguageSwitcher } from "@/components/LanguageSwitcher";
import { CookiePreferencesButton } from "@/components/legal/CookiePreferencesButton";
import type { LineFooterBilling, SiteFooterBilling } from "@/lib/billing/footerBilling";
import { netopiaLogoOnDark, type PaymentMarks } from "@/lib/billing/paymentMarks";
import { useChromeI18n } from "@/lib/i18n/I18nProvider";
import { t, type MessageCatalog } from "@/lib/i18n/translate";
import { ADR_URL, COMPANY, isUnverified, LEGAL_PAGES } from "@/lib/legal/pages";
import { useSupportOffered } from "@/components/support/availability";
import { ReportProblemLink } from "@/components/BetaNotice";

const PRODUCT_NAME = "Dialectical Engine";

type FooterLink = Readonly<{ href: string; labelKey: string }>;

const PRODUCT_LINKS = [
  { href: "/", labelKey: "chrome.footer.home" },
  { href: "/help", labelKey: "chrome.help" },
  { href: "/settings", labelKey: "chrome.settings" }
] as const;

/**
 * Shown only while billing is on: the pricing, cancel and withdraw pages are "not found" otherwise, and the delivery
 * rules in Terms section 12 concern only a buyer. Pricing joins the PRODUCT column; delivery, cancel and withdraw are
 * consumer information, so they join the LEGAL column. The one-line footer shows cancel and withdraw too, so a buyer
 * finds both from every page; the delivery rules stay with the full footer.
 */
const BILLING_PRODUCT_LINKS = [{ href: "/pricing", labelKey: "chrome.footer.pricing" }] as const;
const CANCEL_LINK = { href: "/cancel", labelKey: "chrome.footer.cancel" } as const;
const WITHDRAW_LINK = { href: "/withdraw", labelKey: "chrome.footer.withdraw" } as const;
const BILLING_LEGAL_LINKS = [
  { href: "/terms#legal-section-12", labelKey: "chrome.footer.delivery" },
  CANCEL_LINK,
  WITHDRAW_LINK
] as const;
const LINE_BILLING_LINKS = [CANCEL_LINK, WITHDRAW_LINK] as const;

/** A mail address as a link, or as plain text while it still waits for the owner (the brackets /legal shows too). */
function FooterEmail({ address }: { address: string }) {
  return (
    <bdi>
      {isUnverified(address) ? address : <a className="siteFooterLink" href={`mailto:${address}`}>{address}</a>}
    </bdi>
  );
}

/** One list item per link, in the footer's link style. */
function linkItems(links: ReadonlyArray<FooterLink>, catalog: MessageCatalog) {
  return links.map(({ href, labelKey }) => (
    <li key={href}>
      <a className="siteFooterLink" href={href}>
        {t(catalog, labelKey)}
      </a>
    </li>
  ));
}

/** DB-IP Lite's CC BY 4.0 licence asks for this credit link on the site (spec §1.5, §2.10); A14 keeps it billing-free. */
const DBIP_URL = "https://db-ip.com";

/** Where NETOPIA's hosted logo links, as NETOPIA's own logo component does. */
const NETOPIA_URL = "https://netopia-payments.com/";

/**
 * ANPC's pictogram for alternative dispute resolution (SAL), the consumer-protection link Romanian law asks a shop to show
 * (design 15a/15b/15c). The EU's ODR platform (SOL) closed on 20 July 2025, so it has no badge. The artwork and its words
 * are ANPC's own, in Romanian, so the alt text and the title stay Romanian in every locale, marked `lang="ro"`. The link
 * is `ADR_URL`, the route the Terms name.
 */
const ANPC_SAL_TITLE = "ANPC – Soluționarea alternativă a litigiilor";
const ANPC_SAL_ALT = `${ANPC_SAL_TITLE}. Detalii`;
const ANPC_SAL_SRC = "/consumer-protection/anpc-sal.png";

/**
 * Both footer shapes show it, billing on or off. legal.css sizes it per shape: a 250 × 50 box in the full footer at
 * every width, the size ANPC's order sets for the home page; 22px high on the one line.
 */
function AnpcSalBadge() {
  return (
    <a className="siteFooterAnpc" href={ADR_URL} target="_blank" rel="noopener noreferrer" title={ANPC_SAL_TITLE} lang="ro">
      <img src={ANPC_SAL_SRC} alt={ANPC_SAL_ALT} width={337} height={88} />
    </a>
  );
}

const MADE_IN_HEART = "{heart}";
const MADE_IN_FLAG = "{flag}";
const MADE_IN_MARKS = /(\{heart\}|\{flag\})/;

/**
 * "Made with ♥ in Romania" plus the flag, in both footer shapes. The sentence is one catalogue value that says where the
 * heart and the flag go, because their place in the sentence differs from language to language. Both are drawn: Windows
 * shows a flag emoji as the letters "RO". A screen reader gets the plain sentence instead of the two pictures.
 */
function MadeInRomania() {
  const { catalog } = useChromeI18n();
  const parts = t(catalog, "chrome.footer.madeIn").split(MADE_IN_MARKS);
  return (
    <span className="siteFooterMadeIn">
      <span aria-hidden>
        {parts.map((part, index) => {
          if (part === MADE_IN_HEART) {
            return (
              <svg key={index} className="siteFooterMadeInHeart" viewBox="0 0 24 24" focusable="false">
                <path
                  fill="currentColor"
                  d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z"
                />
              </svg>
            );
          }
          if (part === MADE_IN_FLAG) {
            return (
              <svg key={index} className="siteFooterMadeInFlag" viewBox="0 0 18 12" focusable="false">
                <rect width="6" height="12" fill="#002B7F" />
                <rect x="6" width="6" height="12" fill="#FCD116" />
                <rect x="12" width="6" height="12" fill="#CE1126" />
              </svg>
            );
          }
          return part;
        })}
      </span>
      <span className="srOnly">{t(catalog, "chrome.footer.madeInSpoken")}</span>
    </span>
  );
}

const NO_MARKS: PaymentMarks = Object.freeze({ netopia: false, visa: false, mastercard: false });

/** Spec §2.18: NETOPIA's logo first, then the card marks; each brand name stays untranslated in every locale. */
const MARK_IMAGES = [
  { mark: "netopia", src: "/payment-marks/netopia.svg", altKey: "chrome.footer.netopia" },
  { mark: "visa", src: "/payment-marks/visa.svg", altKey: "chrome.footer.visa" },
  { mark: "mastercard", src: "/payment-marks/mastercard.svg", altKey: "chrome.footer.mastercard" }
] as const satisfies ReadonlyArray<Readonly<{ mark: keyof PaymentMarks; src: string; altKey: string }>>;

/**
 * The payment marks in one group: the full footer's, and the checkout's under its Continue button. NETOPIA's hosted
 * logo (the NETOPIA_LOGO_ID setting, `netopiaLogoAddress()`), when a server page hands it over, is the whole group: its
 * picture already holds the Visa and Mastercard marks, so the files the `PAYMENT_MARKS_AVAILABLE` setting names
 * (`availablePaymentMarks()`) are not drawn beside it. Nothing at all when neither setting names any.
 *
 * The logo comes in two versions, as NETOPIA's own logo script draws it: blue wordmarks for a light background, white
 * ones for a dark background. Both are in the page and legal.css shows the one for the theme, so a theme switch needs
 * no script here.
 */
export function PaymentMarksGroup({ marks, netopiaLogo = null }: { marks: PaymentMarks; netopiaLogo?: string | null }) {
  const { catalog } = useChromeI18n();
  if (netopiaLogo !== null) {
    const netopia = t(catalog, "chrome.footer.netopia");
    // The picture shows the three brands, whose names are the same in every locale.
    const alt = [netopia, t(catalog, "chrome.footer.visa"), t(catalog, "chrome.footer.mastercard")].join(", ");
    return (
      <div className="siteFooterMarks" role="group" aria-label={t(catalog, "chrome.footer.paymentMarks")}>
        <a className="siteFooterNetopia" href={NETOPIA_URL} target="_blank" rel="noopener noreferrer" title={netopia}>
          {/* Lazy: the browser asks NETOPIA's server only when the footer comes near the screen, and the server render
              adds no preload for it; a lazy image that is not displayed is not asked for at all, so only the theme's
              version loads. No referrer: NETOPIA's server is not told which page the visitor is on. No crossOrigin:
              NETOPIA's server allows no cross-origin read, and a plain image needs none. */}
          <img className="siteFooterNetopiaOnLight" src={netopiaLogo} alt={alt} width={418} height={75} loading="lazy" referrerPolicy="no-referrer" />
          <img className="siteFooterNetopiaOnDark" src={netopiaLogoOnDark(netopiaLogo)} alt={alt} width={418} height={75} loading="lazy" referrerPolicy="no-referrer" />
        </a>
      </div>
    );
  }
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
 * - `full` — marketing and legal pages: company block, PRODUCT and LEGAL columns, the CONSUMER
 *   PROTECTION row (ANPC's SAL badge), then the copyright line with the made-in sentence and the
 *   language switcher. On a phone the columns stack (15c) in CSS.
 * - `line` — every other screen: copyright, the made-in sentence, the seven legal links, cookie preferences and the
 *   small SAL badge on one line, so the canvas keeps its room (15b).
 *
 * While the site is in Beta both shapes hold a "Report a problem" link (it starts a mail to our support address), so a
 * person can report from the page the problem showed on: the `line` shape after its page links and before cookie
 * preferences, which still closes the list; the `full` shape at the end of the PRODUCT column.
 *
 * The root layout renders the `line` footer after every page; a page that renders the `full`
 * footer hides it through `.appShell:has(.siteFooterFull) > .siteFooterLine` in `app/legal.css`,
 * so no page has to know which footer the layout drew.
 *
 * Paid plans extend the `full` shape through the optional `billing` facts a server page hands over
 * (`siteFooterBilling()`, `billingPageFooter()`, the landing's `landingPlans`): the DB-IP credit always, and while billing
 * is on the pricing, delivery, cancel and withdraw links and the payment marks (`PaymentMarksGroup`): NETOPIA's hosted
 * logo when its setting is set, otherwise the files the server's `PAYMENT_MARKS_AVAILABLE` setting names. The `line`
 * shape gets only whether billing is on (`lineFooterBilling()`, read by the root layout) and then adds the cancel and
 * withdraw links; it never shows a mark or the logo, since its one line has no room for them and it is on every page.
 * Without the prop (local mode alike) nothing about paying shows in either shape.
 */
export function SiteFooter(
  props: Readonly<{ variant: "full"; billing?: SiteFooterBilling | null }> | Readonly<{ variant: "line"; billing?: LineFooterBilling | null }>
) {
  const { catalog } = useChromeI18n();
  const offered = useSupportOffered();
  const copyright = `© ${new Date().getFullYear()} ${COMPANY.legalName}`;
  const cookiePreferences = t(catalog, "chrome.footer.cookiePreferences");
  const legalLinks = linkItems(LEGAL_PAGES, catalog);

  if (props.variant === "line") {
    return (
      <footer className="siteFooterLine" aria-label={t(catalog, "chrome.footer.label")}>
        <span className="siteFooterCopyright">{copyright}</span>
        <MadeInRomania />
        <nav aria-label={t(catalog, "chrome.legalPages")}>
          <ul className="siteFooterLineLinks">
            {legalLinks}
            {props.billing?.billingOn === true ? linkItems(LINE_BILLING_LINKS, catalog) : null}
            <li>
              <ReportProblemLink className="siteFooterLink" />
            </li>
            <li>
              <CookiePreferencesButton className="siteFooterLink" label={cookiePreferences} />
            </li>
          </ul>
        </nav>
        {/* Design Document v2 (3a, 8h): the top bars draw no language switcher, so every page's footer line has it,
            before the badge the line ends with (15b). */}
        <span className="siteFooterLang">
          <LanguageSwitcher />
        </span>
        <AnpcSalBadge />
      </footer>
    );
  }

  const billing = props.billing ?? null;
  const billingOn = billing?.billingOn === true;
  const marks = billing !== null && billing.billingOn ? billing.marks : NO_MARKS;
  // The same gate as the marks: NETOPIA's logo shows only while billing is on. `?? null` covers billing facts built
  // without the field.
  const netopiaLogo = billing !== null && billing.billingOn ? billing.netopiaLogo ?? null : null;
  const visibleProductLinks = PRODUCT_LINKS.filter(({ href }) => href !== "/help" || offered === "offered");
  const productLinks: ReadonlyArray<FooterLink> = billingOn
    ? [...visibleProductLinks, ...BILLING_PRODUCT_LINKS]
    : visibleProductLinks;
  const billingLegalLinks = billingOn ? linkItems(BILLING_LEGAL_LINKS, catalog) : null;

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
          {/* The seller's facts, all from COMPANY, as the /legal page states them: who sells, where its registered
              office is, its tax and trade-register codes, and how to reach it (support, and privacy for the GDPR). */}
          <span>{COMPANY.legalName}</span>
          <span>{t(catalog, "chrome.footer.office", { office: COMPANY.registeredOffice })}</span>
          <span>{t(catalog, "chrome.footer.codes", { cui: COMPANY.cui, register: COMPANY.tradeRegisterNo })}</span>
          <span>
            {t(catalog, "chrome.footer.phone")}{" "}
            <bdi>
              {isUnverified(COMPANY.phone)
                ? COMPANY.phone
                : <a className="siteFooterLink" href={`tel:${COMPANY.phone.replace(/\s/g, "")}`}>{COMPANY.phone}</a>}
            </bdi>
          </span>
          <span>
            {t(catalog, "chrome.footer.email")}{" "}
            <FooterEmail address={COMPANY.emails.general} />
            {" · "}
            <FooterEmail address={COMPANY.emails.privacy} />
          </span>
        </div>
        <nav className="siteFooterColumn" aria-label={t(catalog, "chrome.footer.product")}>
          <span className="siteFooterHead" aria-hidden>
            {t(catalog, "chrome.footer.product")}
          </span>
          <ul>
            {linkItems(productLinks, catalog)}
            <li>
              <ReportProblemLink className="siteFooterLink" />
            </li>
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
      <div className="siteFooterConsumer">
        <span className="siteFooterHead">{t(catalog, "chrome.footer.consumerProtection")}</span>
        <AnpcSalBadge />
      </div>
      <PaymentMarksGroup marks={marks} netopiaLogo={netopiaLogo} />
      <div className="siteFooterBase">
        <span className="siteFooterCopyright">{copyright}</span>
        <MadeInRomania />
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
