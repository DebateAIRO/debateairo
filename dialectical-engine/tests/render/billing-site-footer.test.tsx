import { readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";
import { renderToStaticMarkup } from "react-dom/server";
import { JSDOM } from "jsdom";
import { describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ billingOn: true }));
// footerBilling.ts reaches P19's billingIsOn() through its relative import; the one plans read is answered here.
vi.mock("../../apps/ui/lib/billing/serverBilling.js", () => ({ billingIsOn: async () => mocks.billingOn }));

import { SiteFooter } from "../../apps/ui/components/SiteFooter.js";
import { billingPageFooter, siteFooterBilling, type SiteFooterBilling } from "../../apps/ui/lib/billing/footerBilling.js";
import { COMPANY, LEGAL_PAGES } from "../../apps/ui/lib/legal/pages.js";
import chromeEnglish from "../../apps/ui/messages/en/chrome.json" with { type: "json" };

const markup = (element: JSX.Element): Document => new JSDOM(renderToStaticMarkup(element)).window.document;
const full = (billing: SiteFooterBilling | null): Element =>
  markup(<SiteFooter variant="full" billing={billing} />).querySelector("footer.siteFooterFull")!;
const fullWithoutProp = (): Element => markup(<SiteFooter variant="full" />).querySelector("footer.siteFooterFull")!;
const hrefs = (root: Element): string[] => [...root.querySelectorAll("a")].map((link) => link.getAttribute("href") ?? "");
const on = (visa: boolean, mastercard: boolean): SiteFooterBilling => ({ billingOn: true, marks: { visa, mastercard } });
const OFF_WITH_MARKS: SiteFooterBilling = { billingOn: false, marks: { visa: true, mastercard: true } };
const BILLING_LINKS = ["/pricing", "/cancel", "/withdraw"];

describe("P21 the site footer, extended for paid plans (R3-4; xMoney's website rules, DB-IP's licence)", () => {
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

  it("with billing on: links pricing, cancel and withdraw, and keeps the company block and every legal link", () => {
    const root = full(on(false, false));
    expect(hrefs(root)).toEqual(expect.arrayContaining([...BILLING_LINKS, ...LEGAL_PAGES.map(({ href }) => href)]));
    expect(root.querySelector('a[href="/pricing"]')?.textContent).toBe("Pricing");
    expect(root.querySelector('a[href="/cancel"]')?.textContent).toBe("Cancel a plan");
    expect(root.querySelector('a[href="/withdraw"]')?.textContent).toBe("Withdraw from a plan");
    expect(root.textContent).toContain(COMPANY.legalName);
  });

  it("with billing off, or with no billing facts at all (local mode alike): no pricing, cancel or withdraw link and no card mark", () => {
    for (const root of [fullWithoutProp(), full(null), full(OFF_WITH_MARKS)]) {
      for (const href of BILLING_LINKS) expect(root.querySelector(`a[href="${href}"]`), href).toBeNull();
      expect(root.querySelectorAll("img")).toHaveLength(0);
      expect(hrefs(root)).toEqual(expect.arrayContaining(LEGAL_PAGES.map(({ href }) => href)));
    }
  });

  it("shows exactly the card marks whose files the owner supplied", () => {
    expect(full(on(false, false)).querySelectorAll("img")).toHaveLength(0);
    expect([...full(on(true, false)).querySelectorAll("img")].map((image) => image.getAttribute("src"))).toEqual(["/payment-marks/visa.svg"]);
    const both = full(on(true, true));
    expect([...both.querySelectorAll("img")].map((image) => image.getAttribute("alt"))).toEqual(["Visa", "Mastercard"]);
    expect(both.querySelector('[role="group"]')?.getAttribute("aria-label")).toBe("Cards we accept");
  });

  it("leaves the one-line footer exactly as it was: the seven legal links, and nothing about paying", () => {
    const line = markup(<SiteFooter variant="line" />).querySelector("footer.siteFooterLine")!;
    expect(hrefs(line)).toEqual(LEGAL_PAGES.map(({ href }) => href));
  });

  it("takes billing's state from the one plans read, and the marks from the owner's files (none in the repository)", async () => {
    mocks.billingOn = false;
    expect(await siteFooterBilling()).toEqual({ billingOn: false, marks: { visa: false, mastercard: false } });
    mocks.billingOn = true;
    expect(await siteFooterBilling()).toEqual({ billingOn: true, marks: { visa: false, mastercard: false } });
    expect(billingPageFooter()).toEqual({ billingOn: true, marks: { visa: false, mastercard: false } });
  });
});
