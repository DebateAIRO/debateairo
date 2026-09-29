// @vitest-environment jsdom

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { act, type ReactElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import chromeEnglish from "../../apps/ui/messages/en/chrome.json" with { type: "json" };
import legalEnglish from "../../apps/ui/messages/en/legal.json" with { type: "json" };
import { CONSENT_KEY, subscribeToPreferenceRequests } from "../../apps/ui/lib/consent.js";
import { LOCALE_COOKIE } from "../../apps/ui/lib/i18n/locales.js";
import {
  LEGAL_BROWSER_STORAGE,
  LEGAL_COOKIES,
  LEGAL_PAGES,
  MODEL_PROVIDERS,
  TERMS_VERSIONS
} from "../../apps/ui/lib/legal/pages.js";
import { PRIVACY_POLICY } from "../../apps/ui/lib/privacyPolicy.js";
import { TERMS_OF_SERVICE } from "../../apps/ui/lib/termsOfService.js";
import { LegalPageLayout } from "../../apps/ui/components/legal/LegalPageLayout.js";
import {
  LegalCookiesBody,
  LegalDocumentBody,
  LegalHealthBody,
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

describe("the six legal pages share one navigation", () => {
  it("lists the six pages in the design's order with their public paths", () => {
    expect(LEGAL_PAGES.map(({ key, href }) => [key, href])).toEqual([
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
    expect(MODEL_PROVIDERS.map(({ family }) => family)).toEqual(families);
  });

  it("renders the table with every provider and its models", () => {
    const view = render(<LegalProvidersBody legalCatalog={legalEnglish} />);
    const rows = [...view.querySelectorAll(".legalTable tbody tr")];
    expect(rows.map((row) => row.querySelector("th")?.textContent)).toEqual(MODEL_PROVIDERS.map(({ provider }) => provider));
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
  it("the one-line footer carries the six legal links and cookie preferences", () => {
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
      expect(footer?.textContent).toContain(`© ${new Date().getFullYear()} DebateAIRO SRL`);
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
    expect(hrefs).toEqual(expect.arrayContaining(["/", "/help", "/settings", ...LEGAL_PAGES.map(({ href }) => href)]));
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
