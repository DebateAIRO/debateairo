import { readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";
import { renderToStaticMarkup } from "react-dom/server";
import { JSDOM } from "jsdom";
import { describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ billingOn: true }));
// footerBilling.ts reaches P19's billingIsOn() through its relative import; the one plans read is answered here.
vi.mock("../../apps/ui/lib/billing/serverBilling.js", () => ({ billingIsOn: async () => mocks.billingOn }));

import { SiteFooter } from "../../apps/ui/components/SiteFooter.js";
import {
  billingPageFooter, LINE_FOOTER_BILLING_MS, rememberedLineFooterBilling, siteFooterBilling, type SiteFooterBilling
} from "../../apps/ui/lib/billing/footerBilling.js";
import { COMPANY, LEGAL_PAGES } from "../../apps/ui/lib/legal/pages.js";
import chromeEnglish from "../../apps/ui/messages/en/chrome.json" with { type: "json" };

const markup = (element: JSX.Element): Document => new JSDOM(renderToStaticMarkup(element)).window.document;
const full = (billing: SiteFooterBilling | null): Element =>
  markup(<SiteFooter variant="full" billing={billing} />).querySelector("footer.siteFooterFull")!;
const fullWithoutProp = (): Element => markup(<SiteFooter variant="full" />).querySelector("footer.siteFooterFull")!;
const hrefs = (root: Element): string[] => [...root.querySelectorAll("a")].map((link) => link.getAttribute("href") ?? "");
const on = (visa: boolean, mastercard: boolean, netopia = false): SiteFooterBilling =>
  ({ billingOn: true, marks: { netopia, visa, mastercard } });
const OFF_WITH_MARKS: SiteFooterBilling = { billingOn: false, marks: { netopia: true, visa: true, mastercard: true } };
const NO_MARKS = { netopia: false, visa: false, mastercard: false };
const BILLING_LINKS = ["/pricing", "/terms#legal-section-12", "/cancel", "/withdraw"];
const line = (billing?: { billingOn: boolean } | null): Element =>
  markup(billing === undefined ? <SiteFooter variant="line" /> : <SiteFooter variant="line" billing={billing} />)
    .querySelector("footer.siteFooterLine")!;

describe("P21 the site footer, extended for paid plans (R3-4; the card processor's website rules, DB-IP's licence)", () => {
  it("credits DB-IP on every full footer, billing on or off, in exactly those words in every locale", () => {
    for (const root of [fullWithoutProp(), full(null), full(OFF_WITH_MARKS), full(on(false, false))]) {
      expect(root.querySelector('a[href="https://db-ip.com"]')?.textContent).toBe("IP Geolocation by DB-IP");
    }
    expect(chromeEnglish["chrome.footer.dbipCredit"]).toBe("IP Geolocation by DB-IP");
    for (const locale of readdirSync(resolve("apps/ui/messages"))) {
      const chrome = JSON.parse(readFileSync(resolve("apps/ui/messages", locale, "chrome.json"), "utf8")) as Record<string, string>;
      expect(chrome["chrome.footer.dbipCredit"], locale).toBe("IP Geolocation by DB-IP");
    }
  });

  it("with billing on: links pricing, delivery, cancel and withdraw, and keeps the company block and every legal link", () => {
    const root = full(on(false, false));
    expect(hrefs(root)).toEqual(expect.arrayContaining([...BILLING_LINKS, ...LEGAL_PAGES.map(({ href }) => href)]));
    expect(root.querySelector('a[href="/pricing"]')?.textContent).toBe("Pricing");
    expect(root.querySelector('a[href="/terms#legal-section-12"]')?.textContent).toBe("Delivery");
    expect(root.querySelector('a[href="/cancel"]')?.textContent).toBe("Cancel a plan");
    expect(root.querySelector('a[href="/withdraw"]')?.textContent).toBe("Withdraw from contract");
    expect(root.textContent).toContain(COMPANY.legalName);
    // Delivery, cancel and withdraw are consumer information: the LEGAL column, after the legal pages, in that order.
    const legal = [...root.querySelectorAll(".siteFooterLegalGrid a")].map((link) => link.getAttribute("href"));
    expect(legal).toEqual([...LEGAL_PAGES.map(({ href }) => href), "/terms#legal-section-12", "/cancel", "/withdraw"]);
  });

  it("gives the withdrawal page one name: the footer link, the page title and the Terms' name for it", () => {
    const en = (namespace: string) => JSON.parse(readFileSync(resolve("apps/ui/messages/en", `${namespace}.json`), "utf8")) as Record<string, string>;
    const ro = (namespace: string) => JSON.parse(readFileSync(resolve("apps/ui/messages/ro", `${namespace}.json`), "utf8")) as Record<string, string>;
    expect(en("chrome")["chrome.footer.withdraw"]).toBe("Withdraw from contract");
    expect(en("billing")["billing.withdrawPage.title"]).toBe("Withdraw from contract");
    expect(ro("chrome")["chrome.footer.withdraw"]).toBe("Retragere din contract");
    expect(ro("billing")["billing.withdrawPage.title"]).toBe("Retragere din contract");
    expect(readFileSync(resolve("apps/ui/legal/en/terms-of-service.md"), "utf8")).toContain("Withdraw from contract");
    expect(readFileSync(resolve("apps/ui/legal/ro/terms-of-service.md"), "utf8")).toContain("Retragere din contract");
    expect(en("chrome")["chrome.footer.delivery"]).toBe("Delivery");
    expect(ro("chrome")["chrome.footer.delivery"]).toBe("Livrarea serviciului");
  });

  it("with billing off, or with no billing facts at all (local mode alike): no pricing, delivery, cancel or withdraw link and no card mark", () => {
    for (const root of [fullWithoutProp(), full(null), full(OFF_WITH_MARKS)]) {
      for (const href of BILLING_LINKS) expect(root.querySelector(`a[href="${href}"]`), href).toBeNull();
      expect(root.querySelectorAll(".siteFooterMarks img")).toHaveLength(0);
      expect(hrefs(root)).toEqual(expect.arrayContaining(LEGAL_PAGES.map(({ href }) => href)));
    }
  });

  it("shows exactly the card marks that the setting names", () => {
    expect(full(on(false, false)).querySelectorAll(".siteFooterMarks img")).toHaveLength(0);
    expect([...full(on(true, false)).querySelectorAll(".siteFooterMarks img")].map((image) => image.getAttribute("src"))).toEqual(["/payment-marks/visa.svg"]);
    const both = full(on(true, true));
    expect([...both.querySelectorAll(".siteFooterMarks img")].map((image) => image.getAttribute("alt"))).toEqual(["Visa", "Mastercard"]);
    expect(both.querySelector('[role="group"]')?.getAttribute("aria-label")).toBe("Cards we accept");
  });

  it("puts NETOPIA's mark first, before Visa and Mastercard, and shows no group when none of the three is there (spec §2.18)", () => {
    const netopiaOnly = full(on(false, false, true));
    expect([...netopiaOnly.querySelectorAll('[role="group"] img')].map((image) => [image.getAttribute("src"), image.getAttribute("alt")]))
      .toEqual([["/payment-marks/netopia.svg", "NETOPIA Payments"]]);
    const all = full(on(true, true, true));
    expect([...all.querySelectorAll('[role="group"] img')].map((image) => image.getAttribute("src")))
      .toEqual(["/payment-marks/netopia.svg", "/payment-marks/visa.svg", "/payment-marks/mastercard.svg"]);
    expect([...all.querySelectorAll('[role="group"] img')].map((image) => image.getAttribute("alt")))
      .toEqual(["NETOPIA Payments", "Visa", "Mastercard"]);
    expect(full(on(false, false, false)).querySelector('[role="group"]')).toBeNull();
  });

  it("names NETOPIA Payments untranslated in every locale, as Visa and Mastercard are", () => {
    expect(chromeEnglish["chrome.footer.netopia"]).toBe("NETOPIA Payments");
    for (const locale of readdirSync(resolve("apps/ui/messages"))) {
      const chrome = JSON.parse(readFileSync(resolve("apps/ui/messages", locale, "chrome.json"), "utf8")) as Record<string, string>;
      expect(chrome["chrome.footer.netopia"], locale).toBe("NETOPIA Payments");
    }
  });

  it("leaves the one-line footer to the seven legal links and ANPC's SAL badge (15b) while billing is off or unknown", () => {
    for (const root of [line(), line(null), line({ billingOn: false })]) {
      expect(hrefs(root)).toEqual([...LEGAL_PAGES.map(({ href }) => href), "https://reclamatiisal.anpc.ro/"]);
    }
  });

  it("adds cancel and withdraw to the one-line footer while billing is on, after the legal links; never delivery, a mark or the logo", () => {
    const root = line({ billingOn: true });
    expect(hrefs(root)).toEqual([...LEGAL_PAGES.map(({ href }) => href), "/cancel", "/withdraw", "https://reclamatiisal.anpc.ro/"]);
    expect(root.querySelector('a[href="/cancel"]')?.textContent).toBe("Cancel a plan");
    expect(root.querySelector('a[href="/withdraw"]')?.textContent).toBe("Withdraw from contract");
    // The cookie preferences button still closes the list.
    expect(root.querySelector(".siteFooterLineLinks > li:last-child button")).not.toBeNull();
    expect(root.querySelector('[role="group"]')).toBeNull();
  });

  it("takes billing's state from the one plans read, and the marks from the PAYMENT_MARKS_AVAILABLE setting", async () => {
    const before = process.env.PAYMENT_MARKS_AVAILABLE;
    try {
      delete process.env.PAYMENT_MARKS_AVAILABLE;
      mocks.billingOn = false;
      expect(await siteFooterBilling()).toEqual({ billingOn: false, marks: NO_MARKS });
      mocks.billingOn = true;
      expect(await siteFooterBilling()).toEqual({ billingOn: true, marks: NO_MARKS });
      expect(billingPageFooter()).toEqual({ billingOn: true, marks: NO_MARKS });
      process.env.PAYMENT_MARKS_AVAILABLE = "netopia,mastercard";
      expect(billingPageFooter().marks).toEqual({ netopia: true, visa: false, mastercard: true });
    } finally {
      if (before === undefined) delete process.env.PAYMENT_MARKS_AVAILABLE;
      else process.env.PAYMENT_MARKS_AVAILABLE = before;
    }
  });
});

describe("the one-line footer's billing read", () => {
  it("reads the plans route at most once a minute, shares one read between pages, and reads again after a minute", async () => {
    let clock = 1_000_000;
    let reads = 0;
    let answer = true;
    const read = async (): Promise<boolean> => { reads += 1; return answer; };
    const lineBilling = rememberedLineFooterBilling(read, () => clock);
    expect(await Promise.all([lineBilling(), lineBilling()])).toEqual([{ billingOn: true }, { billingOn: true }]);
    expect(reads).toBe(1);
    answer = false;
    clock += LINE_FOOTER_BILLING_MS - 1;
    expect(await lineBilling()).toEqual({ billingOn: true });
    expect(reads).toBe(1);
    clock += 1;
    expect(await lineBilling()).toEqual({ billingOn: false });
    expect(reads).toBe(2);
    // A clock that went back reads again rather than keep an answer longer than a minute.
    clock -= 10;
    expect(await lineBilling()).toEqual({ billingOn: false });
    expect(reads).toBe(3);
    expect(LINE_FOOTER_BILLING_MS).toBe(60_000);
  });

  it("uses billingIsOn's rule (only the plans route's 404 is off), and a read that fails outright shows nothing and is not kept", async () => {
    let clock = 0;
    let fail = true;
    let reads = 0;
    const lineBilling = rememberedLineFooterBilling(async () => { reads += 1; if (fail) throw new Error("boom"); return true; }, () => clock);
    expect(await lineBilling()).toEqual({ billingOn: false });
    fail = false;
    expect(await lineBilling()).toEqual({ billingOn: true });
    expect(reads).toBe(2);
    expect(await lineBilling()).toEqual({ billingOn: true });
    expect(reads).toBe(2);
    // The root layout's read is billingIsOn itself (mocked here): its answer is the footer's.
    const source = readFileSync(resolve("apps/ui/lib/billing/footerBilling.ts"), "utf8");
    expect(source).toContain("export const lineFooterBilling = rememberedLineFooterBilling(billingIsOn);");
  });
});
