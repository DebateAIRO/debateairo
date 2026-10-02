import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { renderToStaticMarkup } from "react-dom/server";
import { JSDOM } from "jsdom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { archivedDocument, currentDocument, legalArchive } from "@debateai/legal-manifest";

const mocks = vi.hoisted(() => ({ locale: "en" }));
vi.mock("next/headers", async () => {
  const { LOCALE_COOKIE } = await import("../../apps/ui/lib/i18n/locales.js");
  return {
    cookies: async () => ({ get: (name: string) => (name === LOCALE_COOKIE ? { value: mocks.locale } : undefined) }),
    headers: async () => new Headers({ "user-agent": "legal-versions-pages-test" })
  };
});
// A legal record, not a billing page: the footer's billing facts are answered "off" here, and nothing else changes.
vi.mock("@/lib/billing/footerBilling", () => ({
  siteFooterBilling: async () => ({ billingOn: false, marks: { visa: false, mastercard: false } }),
  billingPageFooter: () => ({ billingOn: true, marks: { visa: false, mastercard: false } })
}));

import PrivacyPage from "../../apps/ui/app/privacy/page.js";
import PrivacyVersionsPage from "../../apps/ui/app/privacy/versions/page.js";
import TermsVersionTextPage from "../../apps/ui/app/terms/versions/[sha256]/page.js";
import PrivacyVersionTextPage from "../../apps/ui/app/privacy/versions/[sha256]/page.js";
import { archivedLegalText } from "../../apps/ui/lib/legal/archive.js";

const page = async (render: () => Promise<JSX.Element>): Promise<Document> =>
  new JSDOM(renderToStaticMarkup(await render())).window.document;
const textPage = (render: typeof TermsVersionTextPage, sha256: string) => () => render({ params: Promise.resolve({ sha256 }) });
const archivedBytes = (kind: "TERMS" | "PRIVACY", sha256: string): string =>
  readFileSync(resolve(archivedDocument(kind, "en", sha256)!.path), "utf8");

describe("P21 the previous versions the Privacy Policy promises, and one page per archived text (ruling Q-3)", () => {
  beforeEach(() => { mocks.locale = "en"; });

  it("/privacy/versions lists every archived Privacy Policy text of the reader's language, the one in force tagged, each linking to its page", async () => {
    for (const locale of ["en", "ro"]) {
      mocks.locale = locale;
      const document = await page(PrivacyVersionsPage);
      const rows = [...document.querySelectorAll('[data-legal-versions="PRIVACY"] li.legalVersionRow')];
      expect(rows.map((row) => row.querySelector("a")?.getAttribute("href")), locale)
        .toEqual(legalArchive("PRIVACY", locale).map((entry) => `/privacy/versions/${entry.sha256}`));
      const current = currentDocument("PRIVACY", locale)!;
      const tagged = rows.filter((row) => row.querySelector(".legalVersionTag") !== null);
      expect(tagged.map((row) => row.querySelector("a")?.getAttribute("href")), locale).toEqual([`/privacy/versions/${current.sha256}`]);
      expect(tagged[0]?.querySelector(".legalVersionNo")?.textContent, locale).toBe(current.version);
      // The colleague's layout, with the Privacy Policy marked in its side navigation.
      expect(document.querySelector("nav.legalNav a[aria-current='page']")?.getAttribute("href"), locale).toBe("/privacy");
    }
    // The policy itself links there, as its own text promises (privacy-policy.md:26).
    mocks.locale = "en";
    expect((await page(PrivacyPage)).querySelector('.legalMain a[href="/privacy/versions"]')?.textContent).toBe("All versions of this policy");
  });

  it("opens one text exactly as it was published, inside the legal layout, and reads it from apps/ui too (the service's working directory)", async () => {
    const terms = currentDocument("TERMS", "en")!;
    const termsPage = await page(textPage(TermsVersionTextPage, terms.sha256));
    expect(termsPage.querySelector("pre[data-legal-archive]")?.textContent).toBe(archivedBytes("TERMS", terms.sha256));
    expect(termsPage.querySelector("h1")?.textContent).toBe(`Version ${terms.version}`);
    expect(termsPage.querySelector("nav.legalNav a[aria-current='page']")?.getAttribute("href")).toBe("/terms/versions");
    expect(termsPage.querySelector('.legalMain a[href="/terms/versions"]')).not.toBeNull();
    expect(termsPage.querySelector('.legalMain a[href="/terms"]')).not.toBeNull();
    const privacy = currentDocument("PRIVACY", "en")!;
    const privacyPage = await page(textPage(PrivacyVersionTextPage, privacy.sha256));
    expect(privacyPage.querySelector("pre[data-legal-archive]")?.textContent).toBe(archivedBytes("PRIVACY", privacy.sha256));
    expect(privacyPage.querySelector('.legalMain a[href="/privacy/versions"]')).not.toBeNull();
    expect(archivedLegalText("TERMS", terms.sha256, "en", join(process.cwd(), "apps/ui"))?.text)
      .toBe(archivedBytes("TERMS", terms.sha256));
    // A link copied from another language still opens: the hash names the text wherever it was archived.
    mocks.locale = "de";
    expect((await page(textPage(TermsVersionTextPage, terms.sha256))).querySelector("pre[data-legal-archive]")?.getAttribute("lang")).toBe("en");
  });

  it("answers not found for an unknown or malformed hash, another document's hash, or a consent sentence's", async () => {
    const terms = currentDocument("TERMS", "en")!;
    const privacy = currentDocument("PRIVACY", "en")!;
    const consent = currentDocument("CONSENT_RENEWAL", "en")!;
    for (const sha256 of ["0".repeat(64), terms.sha256.toUpperCase(), terms.sha256.slice(0, 63), "../../../etc/passwd", privacy.sha256, consent.sha256]) {
      await expect(TermsVersionTextPage({ params: Promise.resolve({ sha256 }) }), sha256).rejects.toThrow("NEXT_NOT_FOUND");
    }
    await expect(PrivacyVersionTextPage({ params: Promise.resolve({ sha256: terms.sha256 }) })).rejects.toThrow("NEXT_NOT_FOUND");
  });

  it("refuses a file whose bytes no longer hash to its name", () => {
    const terms = currentDocument("TERMS", "en")!;
    const root = mkdtempSync(join(tmpdir(), "legal-archive-"));
    try {
      mkdirSync(join(root, "apps/ui/legal/archive/en"), { recursive: true });
      writeFileSync(join(root, `apps/ui/legal/archive/en/${terms.sha256}.md`), "not the published text");
      expect(archivedLegalText("TERMS", terms.sha256, "en", root)).toBeNull();
      expect(archivedLegalText("TERMS", terms.sha256, "en", join(root, "missing"))).toBeNull();
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("hands every one of the colleague's legal pages the footer's billing facts, /terms/versions (L2's list, R3-4) included", () => {
    // (/legal reads them once for its footer AND its body; tests/render/billing-public-pages.test.tsx covers it.)
    for (const path of ["terms", "terms/versions", "privacy", "privacy/us-health-data", "cookies", "providers", "privacy/versions", "terms/versions/[sha256]", "privacy/versions/[sha256]"]) {
      expect(readFileSync(resolve("apps/ui/app", path, "page.tsx"), "utf8"), path).toMatch(/billing=\{await siteFooterBilling\(\)\}/);
    }
  });
});
