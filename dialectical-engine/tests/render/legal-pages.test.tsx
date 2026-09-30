// @vitest-environment jsdom

import { readdirSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { act, type ReactElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import chromeEnglish from "../../apps/ui/messages/en/chrome.json" with { type: "json" };
import legalEnglish from "../../apps/ui/messages/en/legal.json" with { type: "json" };
import { CONSENT_KEY, subscribeToPreferenceRequests } from "../../apps/ui/lib/consent.js";
import { LOCALE_COOKIE } from "../../apps/ui/lib/i18n/locales.js";
import {
  ANPC_ADR_URL,
  COMPANY,
  isUnverified,
  LEGAL_BROWSER_STORAGE,
  LEGAL_COOKIES,
  LEGAL_PAGES,
  MODEL_PROVIDERS,
  PROVIDER_REGISTER,
  TERMS_VERSIONS
} from "../../apps/ui/lib/legal/pages.js";
import { PRIVACY_POLICY } from "../../apps/ui/lib/privacyPolicy.js";
import { TERMS_OF_SERVICE } from "../../apps/ui/lib/termsOfService.js";
import { LegalPageLayout } from "../../apps/ui/components/legal/LegalPageLayout.js";
import {
  LegalCookiesBody,
  LegalDocumentBody,
  LegalHealthBody,
  LegalNoticeBody,
  LegalProvidersBody,
  LegalVersionsBody
} from "../../apps/ui/components/legal/LegalBodies.js";
import { SiteFooter } from "../../apps/ui/components/SiteFooter.js";

/**
 * Turn 15 — legal pages and footer (design 15a/15b/15c).
 *
 * The pages state facts about the running product, so the facts are pinned to
 * the code that makes them true: a cookie the API stops setting, or a model
 * family the UI stops knowing, turns this suite red instead of leaving a legal
 * page that describes a different product.
 */

const source = (path: string): string => readFileSync(resolve(process.cwd(), path), "utf8");

let root: Root | null = null;
let container: HTMLDivElement | null = null;

beforeEach(() => {
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root?.unmount());
  container?.remove();
  root = null;
  container = null;
});

function render(element: ReactElement): HTMLDivElement {
  act(() => root?.render(element));
  if (container === null) throw new Error("no container");
  return container;
}

const texts = (nodes: Iterable<Element>): string[] => [...nodes].map((node) => node.textContent?.trim() ?? "");

const catalog = (locale: string, namespace: "chrome" | "legal"): Record<string, string> =>
  JSON.parse(source(`apps/ui/messages/${locale}/${namespace}.json`));

describe("the seven legal pages share one navigation", () => {
  it("lists the seven pages, the legal notice first, with their public paths", () => {
    expect(LEGAL_PAGES.map(({ key, href }) => [key, href])).toEqual([
      ["notice", "/legal"],
      ["terms", "/terms"],
      ["versions", "/terms/versions"],
      ["privacy", "/privacy"],
      ["cookies", "/cookies"],
      ["providers", "/providers"],
      ["health", "/privacy/us-health-data"]
    ]);
  });

  it("has a page.tsx for every path, so no navigation link can 404", () => {
    for (const { href } of LEGAL_PAGES) {
      expect(() => source(`apps/ui/app${href}/page.tsx`), href).not.toThrow();
    }
  });

  it("marks the current page and renders the heading block and the full footer", () => {
    const view = render(
      <LegalPageLayout
        current="cookies"
        chromeCatalog={chromeEnglish}
        legalCatalog={legalEnglish}
        eyebrow="COOKIE POLICY"
        title="Cookies"
        meta="All first-party"
      >
        <p>body</p>
      </LegalPageLayout>
    );
    const nav = view.querySelector("nav.legalNav");
    expect(nav?.getAttribute("aria-label")).toBe(legalEnglish["legal.navLabel"]);
    const links = [...(nav?.querySelectorAll("a") ?? [])];
    expect(links.map((link) => link.getAttribute("href"))).toEqual(LEGAL_PAGES.map(({ href }) => href));
    expect(texts(links)).toEqual([
      "Legal notice",
      "Terms of service",
      "Terms versions",
      "Privacy policy",
      "Cookie policy",
      "Model providers",
      "US health data privacy"
    ]);
    expect(links.filter((link) => link.getAttribute("aria-current") === "page").map((link) => link.getAttribute("href")))
      .toEqual(["/cookies"]);
    expect(view.querySelector("h1")?.textContent).toBe("Cookies");
    expect(view.querySelector(".legalEyebrow")?.textContent).toBe("COOKIE POLICY");
    expect(view.querySelector(".legalMeta")?.textContent).toBe("All first-party");
    expect(view.querySelector("footer.siteFooterFull")).not.toBeNull();
  });
});

describe("the legal notice states the company and seller details from one constant", () => {
  const renderNotice = (locale: string) =>
    render(
      <LegalNoticeBody legalCatalog={catalog(locale, "legal")} chromeCatalog={catalog(locale, "chrome")} locale={locale as never} />
    );
  const factCell = (view: HTMLElement, labelKey: string, locale = "en") =>
    [...view.querySelectorAll(".legalFactTable tr")]
      .find((row) => row.querySelector("th")?.textContent === catalog(locale, "legal")[labelKey])
      ?.querySelector("td");

  it("has a /legal route built like the other legal pages", () => {
    const page = source("apps/ui/app/legal/page.tsx");
    expect(page).toMatch(/legalPageMetadata\("notice"\)/);
    expect(page).toMatch(/<LegalPageLayout\s+current="notice"/);
    expect(page).toMatch(/<LegalNoticeBody /);
    expect(source("apps/ui/components/TopBar.tsx")).toMatch(/"\/legal": "chrome\.legalPages"/);
  });

  it("renders /legal in the shared layout with the notice marked current", () => {
    const view = render(
      <LegalPageLayout current="notice" chromeCatalog={chromeEnglish} legalCatalog={legalEnglish} eyebrow="E" title="Legal notice" meta="M">
        <LegalNoticeBody legalCatalog={legalEnglish} chromeCatalog={chromeEnglish} locale="en" />
      </LegalPageLayout>
    );
    expect(view.querySelector("nav.legalNav a[aria-current='page']")?.getAttribute("href")).toBe("/legal");
    expect(texts(view.querySelectorAll(".legalSectionNo"))).toEqual(["01", "02", "03", "04", "05", "06", "07"]);
    expect(view.querySelector("footer.siteFooterFull a[href='/legal']")).not.toBeNull();
  });

  it("takes every company fact from COMPANY, never from a catalogue", () => {
    const view = renderNotice("en");
    expect(factCell(view, "legal.notice.company.name")?.textContent).toBe(COMPANY.legalName);
    expect(factCell(view, "legal.notice.company.tradingNames")?.textContent).toBe(COMPANY.tradingNames.join(" · "));
    expect(factCell(view, "legal.notice.company.office")?.textContent).toBe(COMPANY.registeredOffice);
    expect(factCell(view, "legal.notice.company.register")?.textContent).toBe(COMPANY.tradeRegisterNo);
    expect(factCell(view, "legal.notice.company.cui")?.textContent).toBe(COMPANY.cui);
    expect(factCell(view, "legal.notice.company.capital")?.textContent).toBe(COMPANY.shareCapital);
    expect(factCell(view, "legal.notice.company.representative")?.textContent).toBe(COMPANY.representative);
    expect(factCell(view, "legal.notice.contact.phone")?.textContent).toBe(COMPANY.phone);
    expect(view.querySelector(".legalSection p")?.textContent).toBe(
      `${COMPANY.tradingNames[0]} (also called ${COMPANY.tradingNames[1]}) is run by ${COMPANY.legalName}, a company registered in Romania.`
    );
    for (const address of Object.values(COMPANY.emails)) expect(view.textContent).toContain(address);
    // No catalogue in any locale may carry a company fact: filling COMPANY once must update all 35.
    const facts = [COMPANY.legalName, COMPANY.tradeRegisterNo, COMPANY.phone, ...Object.values(COMPANY.emails)];
    for (const locale of readdirSync(resolve(process.cwd(), "apps/ui/messages"))) {
      const values = Object.entries(catalog(locale, "legal"))
        .filter(([key]) => key.startsWith("legal.notice."))
        .map(([, value]) => value)
        .join("\n");
      for (const fact of facts) expect(values, `${locale}/legal carries ${fact}`).not.toContain(fact);
    }
  });

  it("renders unverified facts bracketed, and never links a bracketed address", () => {
    const view = renderNotice("en");
    expect(COMPANY.tradeRegisterNo).toBe("[J40/…/…]");
    expect(factCell(view, "legal.notice.company.register")?.textContent).toBe("[J40/…/…]");
    expect(factCell(view, "legal.notice.company.vat")?.textContent).toBe(legalEnglish["legal.notice.company.vatUnconfirmed"]);
    expect(factCell(view, "legal.notice.company.vat")?.textContent).toMatch(/^\[.+\]$/);
    const mailto = [...view.querySelectorAll("a[href^='mailto:']")].map((link) => link.getAttribute("href"));
    expect(mailto).toEqual(
      Object.values(COMPANY.emails).filter((address) => !isUnverified(address)).map((address) => `mailto:${address}`)
    );
    expect(mailto).toContain("mailto:privacy@dezbatere.ro");
    expect(view.querySelector("a[href^='mailto:[']")).toBeNull();
  });

  it("names both Digital Services Act contact points and the languages we answer in", () => {
    const view = renderNotice("en");
    const labels = texts(view.querySelectorAll(".legalFactTable th"));
    expect(labels).toContain("Contact point for authorities (EU Digital Services Act, Art. 11)");
    expect(labels).toContain("Contact point for users (Art. 12)");
    expect(factCell(view, "legal.notice.contact.authorities")?.textContent).toContain(COMPANY.emails.authorities);
    expect(factCell(view, "legal.notice.contact.users")?.textContent).toContain(COMPANY.emails.general);
    expect(factCell(view, "legal.notice.contact.languages")?.textContent).toBe("Romanian and English");
    expect(view.textContent).toContain("A person reads these mailboxes.");
    const ro = renderNotice("ro");
    expect(factCell(ro, "legal.notice.contact.languages", "ro")?.textContent).toBe("Română și engleză");
  });

  it("links ANPC's dispute resolution, the terms, AI transparency and the reading list — and not the closed EU ODR platform", () => {
    const view = renderNotice("en");
    const hrefs = [...view.querySelectorAll("a")].map((link) => link.getAttribute("href") ?? "");
    expect(hrefs).toContain(ANPC_ADR_URL);
    expect(ANPC_ADR_URL).toBe("https://reclamatiisal.anpc.ro");
    expect(hrefs).toEqual(
      expect.arrayContaining(["/ai-transparency", "/terms#legal-section-13", "/terms#legal-section-18", "/terms", "/privacy", "/cookies", "/providers"])
    );
    expect(hrefs.filter((href) => /ec\.europa\.eu\/consumers\/odr|\/odr\b/i.test(href))).toEqual([]);
    expect(view.textContent).not.toMatch(/\bODR\b|online dispute resolution/i);
    // The withdrawal and disputes links point at the sections they name, in every edition.
    expect(TERMS_OF_SERVICE.sections.find(({ no }) => no === "13")?.title).toBe("Your right of withdrawal");
    expect(TERMS_OF_SERVICE.sections.find(({ no }) => no === "18")?.title).toBe("Governing law and where disputes are heard");
  });

  it("states no price: paid plans do not exist yet", () => {
    const view = renderNotice("en");
    expect(view.textContent).not.toMatch(/[€$£]|\bEUR\b|\bUSD\b|\blei\b/);
    expect(view.textContent).toContain("Paid plans are not available yet.");
  });

  it("gives the Japanese page its statutory title, and every locale its own title", () => {
    expect(catalog("ja", "legal")["legal.notice.title"]).toBe("特定商取引法に基づく表記");
    expect(catalog("ja", "chrome")["chrome.legal.notice"]).toBe("特定商取引法に基づく表記");
    for (const locale of readdirSync(resolve(process.cwd(), "apps/ui/messages")).filter((code) => code !== "en")) {
      expect(catalog(locale, "legal")["legal.notice.title"], locale).not.toBe(legalEnglish["legal.notice.title"]);
    }
  });

  it("renders the Arabic notice in Arabic, with the facts left as written", () => {
    // The root layout sets <html dir> from the locale; Arabic is declared right-to-left.
    expect(source("apps/ui/lib/i18n/locales.ts")).toMatch(/locale\("ar", "[^"]+", "[^"]+", "rtl"\)/);
    expect(source("apps/ui/app/layout.tsx")).toMatch(/dir=\{localeDefinition\.dir\}/);
    const view = renderNotice("ar");
    const arabic = catalog("ar", "legal");
    expect(view.querySelector("h2")?.textContent).toBe(arabic["legal.notice.s01.title"]);
    expect(factCell(view, "legal.notice.company.register", "ar")?.textContent).toBe(COMPANY.tradeRegisterNo);
    // Left-to-right facts are isolated, so right-to-left text cannot reorder them into "[…/…/J40]".
    expect(factCell(view, "legal.notice.company.register", "ar")?.querySelector("bdi")?.textContent).toBe(COMPANY.tradeRegisterNo);
    const isolated = texts(view.querySelectorAll("bdi"));
    for (const fact of [COMPANY.legalName, COMPANY.phone, ...Object.values(COMPANY.emails)]) expect(isolated).toContain(fact);
    expect(factCell(view, "legal.notice.contact.languages", "ar")?.textContent).toMatch(/[\u0600-\u06FF]/);
  });
});

describe("the text pages render the same documents as the sign-up modals", () => {
  it("renders every section of the privacy policy with its number, title and blocks", () => {
    const view = render(<LegalDocumentBody document={PRIVACY_POLICY} />);
    const sections = [...view.querySelectorAll("section.legalSection")];
    expect(sections).toHaveLength(PRIVACY_POLICY.sections.length);
    expect(texts(view.querySelectorAll(".legalSectionNo"))).toEqual(PRIVACY_POLICY.sections.map(({ no }) => no));
    expect(texts(view.querySelectorAll(".legalSection h2"))).toEqual(PRIVACY_POLICY.sections.map(({ title }) => title));
    const listItems = PRIVACY_POLICY.sections.flatMap(({ blocks }) =>
      blocks.flatMap((block) => (block.kind === "list" ? block.items : []))
    );
    expect(view.querySelectorAll(".legalSection li")).toHaveLength(listItems.length);
    // Ids are page-owned so they can never collide with the modal's `policy-section-*` ids.
    expect(sections[0]?.id).toBe(`legal-section-${PRIVACY_POLICY.sections[0]?.no}`);
    expect(view.querySelector("[id^='policy-section-']")).toBeNull();
  });

  it("renders the terms of service from the terms document", () => {
    const view = render(<LegalDocumentBody document={TERMS_OF_SERVICE} />);
    expect(texts(view.querySelectorAll(".legalSection h2"))).toEqual(TERMS_OF_SERVICE.sections.map(({ title }) => title));
  });
});

describe("the terms versions page lists only versions that exist", () => {
  it("names the version the terms document itself carries, and only it", () => {
    expect(TERMS_VERSIONS).toHaveLength(1);
    expect(TERMS_OF_SERVICE.eyebrow).toContain(`v${TERMS_VERSIONS[0]?.version}`);
    const view = render(<LegalVersionsBody legalCatalog={legalEnglish} />);
    const rows = view.querySelectorAll(".legalVersionRow");
    expect(rows).toHaveLength(1);
    expect(rows[0]?.querySelector("a")?.getAttribute("href")).toBe("/terms");
    expect(view.querySelector(".legalVersionsNone")?.textContent).toBe(legalEnglish["legal.versions.none"]);
  });
});

describe("the cookie policy describes the cookies the product really sets", () => {
  it("lists exactly the API's two session cookies and the interface-language cookie", () => {
    const api = source("apps/api/src/index.ts");
    const session = api.match(/SESSION_COOKIE_NAME = "([^"]+)"/)?.[1];
    const csrf = api.match(/CSRF_COOKIE_NAME = "([^"]+)"/)?.[1];
    expect(LEGAL_COOKIES.map(({ name }) => name)).toEqual([session, csrf, LOCALE_COOKIE]);
  });

  it("states lifetimes that match the Max-Age the code sets", () => {
    expect(source("apps/api/src/index.ts")).toMatch(/const SESSION_IDLE_MAX_AGE_SECONDS = 14 \* 24 \* 60 \* 60;/);
    expect(source("apps/ui/lib/i18n/localeChoice.ts")).toMatch(/Max-Age=31536000/);
    expect(LEGAL_COOKIES.map(({ lifeKey }) => legalEnglish[lifeKey as keyof typeof legalEnglish]))
      .toEqual(["14 days", "14 days", "1 year"]);
  });

  it("lists the two browser-storage keys the UI writes", () => {
    expect(source("apps/ui/components/ModeToggle.tsx")).toMatch(/localStorage\.setItem\("debateai\.mode"/);
    expect(LEGAL_BROWSER_STORAGE.map(({ name }) => name)).toEqual([CONSENT_KEY, "debateai.mode"]);
  });

  it("renders both tables and a control that reopens the cookie preferences card", () => {
    const requests: Array<HTMLElement | null> = [];
    const unsubscribe = subscribeToPreferenceRequests((opener) => requests.push(opener));
    try {
      const view = render(<LegalCookiesBody legalCatalog={legalEnglish} />);
      expect(texts(view.querySelectorAll(".legalTable code"))).toEqual([
        ...LEGAL_COOKIES.map(({ name }) => name),
        ...LEGAL_BROWSER_STORAGE.map(({ name }) => name)
      ]);
      const button = [...view.querySelectorAll("button")].find(
        (candidate) => candidate.textContent === legalEnglish["legal.cookies.change"]
      );
      expect(button).toBeDefined();
      act(() => button?.click());
      expect(requests).toEqual([button]);
    } finally {
      unsubscribe();
    }
  });
});

describe("the model providers page lists the model families the product runs", () => {
  it("has one row per family the model registry knows", () => {
    const registry = source("apps/ui/lib/models.ts");
    const families = [...(registry.match(/const NAMES[^}]+}/)?.[0] ?? "").matchAll(/^\s+(\w+):/gm)].map((match) => match[1]);
    expect(MODEL_PROVIDERS.map(({ key }) => key)).toEqual(families);
  });

  it("renders one register entry per provider, the support chat's model last", () => {
    const view = render(<LegalProvidersBody legalCatalog={legalEnglish} />);
    const headings = texts(view.querySelectorAll(".legalProviderEntry h2"));
    expect(headings).toEqual([...MODEL_PROVIDERS.map(({ provider }) => provider), "Support chat model"]);
    expect(PROVIDER_REGISTER.at(-1)?.key).toBe("support");
  });

  it("states the Privacy Policy's Register facts for every provider (PP §5, Japan and Korea)", () => {
    const view = render(<LegalProvidersBody legalCatalog={legalEnglish} />);
    const entries = [...view.querySelectorAll(".legalProviderEntry")];
    expect(entries).toHaveLength(PROVIDER_REGISTER.length);
    for (const entry of entries) {
      expect(texts(entry.querySelectorAll("tbody th"))).toEqual([
        "Models",
        "Company",
        "Home country",
        "What it receives, and why",
        "Where it processes",
        "How long it keeps data",
        "Zero data retention",
        "May it train on your data?",
        "Transfer basis",
        "Contact",
        "Last checked"
      ]);
      for (const cell of entry.querySelectorAll("tbody td")) expect(cell.textContent?.trim()).not.toBe("");
    }
  });

  it("names the four jobs a provider can be given, and brackets every job nobody has confirmed", () => {
    const view = render(<LegalProvidersBody legalCatalog={legalEnglish} />);
    const jobs = new Set(texts(view.querySelectorAll(".legalProviderPurposes li")));
    expect([...jobs].sort()).toEqual(
      [
        "Debate text — to write the arguments",
        "Debate text — to judge and check the arguments",
        "The finished debate — to write the verdict story",
        "What you type in the support chat — to answer you"
      ].sort()
    );
    PROVIDER_REGISTER.forEach((entry, index) => {
      const note = view.querySelectorAll(".legalProviderEntry")[index]?.querySelector(".legalProviderPurposes .legalFactNote");
      expect(note === null).toBe(entry.purposesConfirmed);
    });
  });

  it("claims nothing unverified: a cloud provider's contract facts stay bracketed until someone checks the row", () => {
    for (const entry of PROVIDER_REGISTER.filter(({ checkedOn }) => checkedOn === null)) {
      if (entry.key === "qwen") continue;
      expect(isUnverified(entry.entity)).toBe(true);
      expect(isUnverified(entry.contact)).toBe(true);
      expect(entry.training).toBe("unconfirmed");
      expect(entry.zeroRetention).toBe("unconfirmed");
      expect(entry.retentionKey).toBe("legal.providers.unconfirmed");
      expect(entry.locationKey).toBe("legal.providers.unconfirmed");
    }
    const view = render(<LegalProvidersBody legalCatalog={legalEnglish} />);
    expect(view.textContent).toContain("[not checked yet]");
  });

  it("shows every register label in every locale's catalogue", () => {
    const englishKeys = Object.keys(legalEnglish).filter((key) => key.startsWith("legal.providers."));
    expect(englishKeys).not.toContain("legal.providers.colProvider");
    for (const locale of readdirSync(resolve(process.cwd(), "apps/ui/messages"))) {
      expect(Object.keys(catalog(locale, "legal")).filter((key) => key.startsWith("legal.providers.")).sort(), locale).toEqual([...englishKeys].sort());
    }
  });
});

describe("the US consumer health data page", () => {
  it("renders six numbered sections and the rights list", () => {
    const view = render(<LegalHealthBody legalCatalog={legalEnglish} />);
    expect(texts(view.querySelectorAll(".legalSectionNo"))).toEqual(["01", "02", "03", "04", "05", "06"]);
    expect(view.querySelectorAll(".legalSection li")).toHaveLength(3);
  });
});

describe("the footers (15a full, 15b one line)", () => {
  it("the one-line footer carries the seven legal links and cookie preferences", () => {
    const requests: Array<HTMLElement | null> = [];
    const unsubscribe = subscribeToPreferenceRequests((opener) => requests.push(opener));
    try {
      const view = render(<SiteFooter variant="line" />);
      const footer = view.querySelector("footer.siteFooterLine");
      expect(footer).not.toBeNull();
      expect([...(footer?.querySelectorAll("a") ?? [])].map((link) => link.getAttribute("href")))
        .toEqual(LEGAL_PAGES.map(({ href }) => href));
      const button = footer?.querySelector("button");
      expect(button?.textContent).toBe(chromeEnglish["chrome.footer.cookiePreferences"]);
      act(() => button?.click());
      expect(requests).toEqual([button]);
      expect(footer?.textContent).toContain(`© ${new Date().getFullYear()} ${COMPANY.legalName}`);
      expect(footer?.querySelector("a[href='/legal']")?.textContent).toBe("Legal notice");
    } finally {
      unsubscribe();
    }
  });

  it("the full footer adds the company block, product links and the language switcher", () => {
    const view = render(<SiteFooter variant="full" />);
    const footer = view.querySelector("footer.siteFooterFull");
    expect(footer?.textContent).toContain("privacy@dezbatere.ro");
    expect(footer?.querySelector("a[href='mailto:privacy@dezbatere.ro']")).not.toBeNull();
    const hrefs = [...(footer?.querySelectorAll("a") ?? [])].map((link) => link.getAttribute("href"));
    expect(hrefs).toEqual(expect.arrayContaining(["/", "/help", "/settings", "/legal", ...LEGAL_PAGES.map(({ href }) => href)]));
    expect(footer?.querySelector(".languageSwitcher")).not.toBeNull();
  });

  it("the layout renders the one-line footer on every page and CSS hides it under a full footer", () => {
    const layout = source("apps/ui/app/layout.tsx");
    expect(layout).toMatch(/\{children\}\s*<CookieConsent \/>\s*<SiteFooter variant="line" \/>/);
    const css = source("apps/ui/app/legal.css");
    expect(css).toMatch(/\.appShell:has\(\.siteFooterFull\) > \.siteFooterLine\s*\{\s*display: none;/);
  });

  it("the landing renders the full footer", () => {
    expect(source("apps/ui/components/landing/LandingPage.tsx")).toMatch(/<SiteFooter variant="full" \/>/);
  });
});
