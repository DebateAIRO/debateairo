import { renderToStaticMarkup } from "react-dom/server";
import { JSDOM } from "jsdom";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ locale: "en", billingOn: true }));
vi.mock("next/headers", async () => {
  const { LOCALE_COOKIE } = await import("../../apps/ui/lib/i18n/locales.js");
  return {
    cookies: async () => ({ get: (name: string) => (name === LOCALE_COOKIE ? { value: mocks.locale } : undefined) }),
    headers: async () => new Headers({ "user-agent": "billing-public-pages-test" })
  };
});
// P19's one plans read (what /cancel and /withdraw ask), and this task's footer facts (what the legal pages ask).
vi.mock("@/lib/billing/serverBilling", () => ({ billingIsOn: async () => mocks.billingOn }));
vi.mock("@/lib/billing/footerBilling", () => ({
  siteFooterBilling: async () => ({ billingOn: mocks.billingOn, marks: { visa: false, mastercard: false } }),
  billingPageFooter: () => ({ billingOn: true, marks: { visa: false, mastercard: false } })
}));

import CancelPage from "../../apps/ui/app/cancel/page.js";
import CookiesPage from "../../apps/ui/app/cookies/page.js";
import LegalNoticePage from "../../apps/ui/app/legal/page.js";
import PrivacyPage from "../../apps/ui/app/privacy/page.js";
import HealthPage from "../../apps/ui/app/privacy/us-health-data/page.js";
import ProvidersPage from "../../apps/ui/app/providers/page.js";
import TermsPage from "../../apps/ui/app/terms/page.js";
import TermsVersionsPage from "../../apps/ui/app/terms/versions/page.js";
import WithdrawPage from "../../apps/ui/app/withdraw/page.js";
import { COMPANY } from "../../apps/ui/lib/legal/pages.js";

const page = async (render: () => Promise<JSX.Element>): Promise<Document> =>
  new JSDOM(renderToStaticMarkup(await render())).window.document;
const LEGAL_PAGE_RENDERS = [LegalNoticePage, () => TermsPage({}), TermsVersionsPage, () => PrivacyPage({}), HealthPage, CookiesPage, ProvidersPage];
const BILLING_LINKS = ["/pricing", "/cancel", "/withdraw"];

describe("P21 the pages xMoney requires, on the colleague's legal pages (R3-4)", () => {
  beforeEach(() => { mocks.locale = "en"; mocks.billingOn = true; });

  it("/withdraw and /cancel are not found while billing is off, and carry the full footer with billing on", async () => {
    mocks.billingOn = false;
    await expect(WithdrawPage()).rejects.toThrow("NEXT_NOT_FOUND");
    await expect(CancelPage()).rejects.toThrow("NEXT_NOT_FOUND");
    mocks.billingOn = true;
    for (const render of [CancelPage, WithdrawPage]) {
      const footer = (await page(render)).querySelector("footer.siteFooterFull");
      for (const href of BILLING_LINKS) expect(footer?.querySelector(`a[href="${href}"]`), href).not.toBeNull();
      expect(footer?.querySelector('a[href="https://db-ip.com"]')?.textContent).toBe("IP Geolocation by DB-IP");
    }
  });

  it("every legal page's full footer follows billing: its links while on, none while off, the DB-IP credit always", async () => {
    for (const billingOn of [true, false]) {
      mocks.billingOn = billingOn;
      for (const render of LEGAL_PAGE_RENDERS) {
        const footer = (await page(render)).querySelector("footer.siteFooterFull");
        expect(footer, render.name).not.toBeNull();
        for (const href of BILLING_LINKS) {
          expect(footer?.querySelector(`a[href="${href}"]`) !== null, `${render.name} ${href} billing ${String(billingOn)}`).toBe(billingOn);
        }
        expect(footer?.querySelector('a[href="https://db-ip.com"]')?.textContent, render.name).toBe("IP Geolocation by DB-IP");
      }
    }
  });

  it("/legal keeps the colleague's free-product text while billing is off", async () => {
    mocks.billingOn = false;
    const notice = (await page(LegalNoticePage)).querySelector(".legalMain")!;
    expect(notice.textContent).toContain("Paid plans are not available yet.");
    expect(notice.textContent).not.toContain("xMoney");
    for (const href of BILLING_LINKS) expect(notice.querySelector(`a[href="${href}"]`), href).toBeNull();
  });

  it("/legal describes the paid plans while billing is on, names the seller and the card processor, and states no price", async () => {
    const notice = (await page(LegalNoticePage)).querySelector(".legalMain")!;
    const text = notice.textContent ?? "";
    expect(text).not.toContain("Paid plans are not available yet.");
    expect(text).toContain(`${COMPANY.legalName} is also the seller of the paid plans`);
    expect(text).toContain("Card payments are processed by NETOPIA Payments. We never see or store your card number.");
    expect(text).toContain("renews every month until you cancel");
    expect(text).toContain("within 14 days of subscribing");
    for (const href of [...BILLING_LINKS, "/terms#legal-section-13"]) {
      expect(notice.querySelector(`a[href="${href}"]`), href).not.toBeNull();
    }
    expect(text).not.toMatch(/[€$£]|\bEUR\b|\bUSD\b|\blei\b/);
  });

  it("/legal shows the VAT registration the owner confirmed, its number still bracketed (R3-4)", async () => {
    const document = await page(LegalNoticePage);
    const vat = [...document.querySelectorAll(".legalFactTable tr")].find((row) => row.querySelector("th")?.textContent === "VAT");
    expect(vat?.querySelector("td")?.textContent).toBe("[RO…]");
  });

  it("/withdraw explains the right, sends the person to sign in and to Settings, and names the email route (Q-9)", async () => {
    const document = await page(WithdrawPage);
    expect(document.body.textContent).toContain("within 14 days of subscribing");
    expect(document.querySelector('a[href="/login?next=%2Fsettings"]')).not.toBeNull();
    expect(document.querySelector('a[href="/settings"]')).not.toBeNull();
    // Terms §13 lets a consumer withdraw by the model form or any clear statement; the owner carries it out.
    expect(document.querySelector("[data-withdraw-by-email]")?.textContent).toBe(
      `You can also send the model withdrawal form from your confirmation email, or any clear statement that you withdraw, to ${COMPANY.emails.general}. We carry it out and confirm it by email.`
    );
  });
});
