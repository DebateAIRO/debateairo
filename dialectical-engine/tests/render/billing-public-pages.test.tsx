import { readFileSync } from "node:fs";
import { resolve } from "node:path";
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
import billingEnglish from "../../apps/ui/messages/en/billing.json" with { type: "json" };

const page = async (render: () => Promise<JSX.Element>): Promise<Document> =>
  new JSDOM(renderToStaticMarkup(await render())).window.document;
const LEGAL_PAGE_RENDERS = [LegalNoticePage, () => TermsPage({}), TermsVersionsPage, () => PrivacyPage({}), HealthPage, CookiesPage, ProvidersPage];
const BILLING_LINKS = ["/pricing", "/cancel", "/withdraw"];

describe("P21 the pages the card processor requires, on the colleague's legal pages (R3-4)", () => {
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
    expect(notice.textContent).not.toContain("NETOPIA");
    for (const href of BILLING_LINKS) expect(notice.querySelector(`a[href="${href}"]`), href).toBeNull();
  });

  it("/legal describes the paid plans while billing is on, names the seller and the card processor, and states no price", async () => {
    const notice = (await page(LegalNoticePage)).querySelector(".legalMain")!;
    const text = notice.textContent ?? "";
    expect(text).not.toContain("Paid plans are not available yet.");
    expect(text).toContain(`${COMPANY.legalName} is also the seller of the paid plans`);
    expect(text).toContain("We accept Visa and Mastercard; we do not accept American Express. Card payments are processed by NETOPIA Payments. We never see or store your full card number.");
    expect(text).toContain("renews every month until you cancel");
    // Owner's decision of 16 November 2026: everyone may withdraw, and the refund is measured by the plan's credit used.
    expect(text).toContain(
      "Wherever you live, you can withdraw from a paid plan within 14 days of subscribing, as section 13 of the Terms explains."
        + " You get back the price minus the share of the plan's credit you have used."
        + " Annex A of the Terms says what else the law gives you where you live."
    );
    expect(text).not.toMatch(/If you live in the EU or the EEA|For users elsewhere|the part already used/u);
    for (const href of [...BILLING_LINKS, "/terms#legal-section-13"]) {
      expect(notice.querySelector(`a[href="${href}"]`), href).not.toBeNull();
    }
    expect(text).not.toMatch(/[€$£]|\bEUR\b|\bUSD\b|\blei\b/);
  });

  it("/legal shows the VAT registration the owner confirmed, with its RO VAT code (R3-4)", async () => {
    const document = await page(LegalNoticePage);
    const vat = [...document.querySelectorAll(".legalFactTable tr")].find((row) => row.querySelector("th")?.textContent === "VAT");
    expect(vat?.querySelector("td")?.textContent).toBe("RO45935221");
  });

  it("/withdraw explains the right, the two steps in Settings with the buttons' own labels, the email route and the model form", async () => {
    const document = await page(WithdrawPage);
    const inner = document.querySelector(".billingInner")!;
    expect(inner.querySelector("h1")?.textContent).toBe("Withdraw from contract");
    // The right is everyone's, and the refund is the price times the share of the plan's credit not used.
    const paragraphs = [...inner.querySelectorAll(":scope > p")].map((paragraph) => paragraph.textContent);
    expect(paragraphs.slice(0, 3)).toEqual([
      "Wherever you live, you can withdraw from a paid plan within 14 days of subscribing, without giving a reason.",
      "You get back the price minus the share of the plan's credit you have used, however many days have passed."
        + " If you have used none, you get the full price back. The money goes back to your card, and the plan ends at once.",
      "This page explains how to withdraw. You withdraw in your account, in two steps, or by email."
    ]);
    expect(inner.textContent).not.toMatch(/\b(?:EU|EEA|UK)\b|the larger of|days used/u);
    // The two steps name the very labels the Settings buttons carry, read from the same keys, as labels, not controls.
    expect([...inner.querySelectorAll("h2")].map((heading) => heading.textContent))
      .toEqual(["In your account, in two steps", "By email", "Model withdrawal form"]);
    const steps = [...inner.querySelectorAll("ol[data-withdraw-steps] > li")];
    expect(steps.map((step) => step.textContent)).toEqual([
      `Sign in and open Settings. Under Subscription, press “${billingEnglish["billing.subscription.withdraw"]}”.`,
      "Check your name, your plan and the day it started, and the email address we will write to. Then press"
        + ` “${billingEnglish["billing.subscription.withdrawConfirm"]}”.`
    ]);
    expect(steps.map((step) => step.querySelector(".withdrawLabel")?.textContent))
      .toEqual(["Withdraw from contract here", "Confirm withdrawal"]);
    expect(inner.querySelector("[data-withdraw-after-confirm]")?.textContent)
      .toBe("Your plan ends at once, and we email you a confirmation with the date and time of your withdrawal.");
    expect(document.querySelector('a[href="/login?next=%2Fsettings"]')?.textContent).toBe("Sign in");
    expect(document.querySelector('.billingInner a[href="/settings"]')?.textContent).toBe("Open Settings");
    // The email route (Terms §13: the model form or any clear statement), and when a withdrawal is in time.
    expect(inner.querySelector("[data-withdraw-by-email]")?.textContent).toBe(
      `Send the model form below, or any clear statement that you withdraw, to ${COMPANY.emails.general}, from the email`
        + " address of your account if you can. We record your withdrawal as of the moment your email reaches us, and"
        + " confirm it by email."
    );
    expect(inner.querySelector("[data-withdraw-in-time]")?.textContent).toBe(
      "Your withdrawal is in time if you send it before the withdrawal period ends. If you have a plan, Settings shows its last day."
    );
    // The model form is the one the confirmation email attaches, line for line, with the company's facts filled in.
    const mail = JSON.parse(readFileSync(resolve("packages/mail-templates/messages/en/mail.json"), "utf8")) as Record<string, string>;
    const filled = (line: string) => line.replace("{merchantName}", COMPANY.legalName)
      .replace("{merchantAddress}", COMPANY.registeredOffice).replace("{merchantEmail}", COMPANY.emails.general);
    expect([...inner.querySelectorAll("[data-withdraw-form] p")].map((line) => line.textContent)).toEqual(
      ["instruction", "to", "notice", "orderedOn", "name", "address", "signature", "date"]
        .map((field) => filled(mail[`mail.withdrawalForm.${field}`]!))
    );
    // The page takes no withdrawal itself: no form, no field, no button, and no sentence saying it does.
    expect(inner.querySelector("form, input, textarea, button")).toBeNull();
    expect(inner.textContent).not.toMatch(/withdraw (?:here|on this page)|this page (?:records|takes)/iu);
  });

  it("/withdraw in Romanian carries the page's one name and the Romanian labels of the Settings buttons", async () => {
    mocks.locale = "ro";
    const document = await page(WithdrawPage);
    const inner = document.querySelector(".billingInner")!;
    expect(inner.querySelector("h1")?.textContent).toBe("Retragere din contract");
    expect([...inner.querySelectorAll("ol[data-withdraw-steps] .withdrawLabel")].map((label) => label.textContent))
      .toEqual(["Retrageți-vă din contract aici", "Confirmați retragerea"]);
    expect(inner.querySelector("[data-withdraw-form] p")?.textContent)
      .toBe("Completați și returnați acest formular numai dacă doriți să vă retrageți din contract.");
  });
});
