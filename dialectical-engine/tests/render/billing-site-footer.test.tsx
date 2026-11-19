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
  ({ billingOn: true, marks: { netopia, visa, mastercard }, netopiaLogo: null });
const OFF_WITH_MARKS: SiteFooterBilling = { billingOn: false, marks: { netopia: true, visa: true, mastercard: true }, netopiaLogo: null };
const NO_MARKS = { netopia: false, visa: false, mastercard: false };
const ALL_MARKS = { netopia: true, visa: true, mastercard: true };
/** NETOPIA's hosted logo for a made-up shop id (the real one is never in the repository). */
const LOGO = "https://mny.ro/np-black-0.svg?id=123456";
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

  it("takes billing's state from the one plans read, the marks from PAYMENT_MARKS_AVAILABLE and the logo from NETOPIA_LOGO_ID", async () => {
    const before = { marks: process.env.PAYMENT_MARKS_AVAILABLE, logo: process.env.NETOPIA_LOGO_ID };
    try {
      delete process.env.PAYMENT_MARKS_AVAILABLE;
      delete process.env.NETOPIA_LOGO_ID;
      mocks.billingOn = false;
      expect(await siteFooterBilling()).toEqual({ billingOn: false, marks: NO_MARKS, netopiaLogo: null });
      mocks.billingOn = true;
      expect(await siteFooterBilling()).toEqual({ billingOn: true, marks: NO_MARKS, netopiaLogo: null });
      expect(billingPageFooter()).toEqual({ billingOn: true, marks: NO_MARKS, netopiaLogo: null });
      process.env.PAYMENT_MARKS_AVAILABLE = "netopia,mastercard";
      expect(billingPageFooter().marks).toEqual({ netopia: true, visa: false, mastercard: true });
      process.env.NETOPIA_LOGO_ID = "123456";
      expect(billingPageFooter().netopiaLogo).toBe(LOGO);
      expect((await siteFooterBilling()).netopiaLogo).toBe(LOGO);
      process.env.NETOPIA_LOGO_ID = "12a";
      expect(billingPageFooter().netopiaLogo).toBeNull();
    } finally {
      if (before.marks === undefined) delete process.env.PAYMENT_MARKS_AVAILABLE;
      else process.env.PAYMENT_MARKS_AVAILABLE = before.marks;
      if (before.logo === undefined) delete process.env.NETOPIA_LOGO_ID;
      else process.env.NETOPIA_LOGO_ID = before.logo;
    }
  });
});

describe("NETOPIA's hosted logo in the full footer", () => {
  const withLogo = (billingOn: boolean): SiteFooterBilling => ({ billingOn, marks: ALL_MARKS, netopiaLogo: LOGO });

  it("while billing is on: one picture, linked to NETOPIA's site in a new tab, instead of every mark file", () => {
    const root = full(withLogo(true));
    const groups = root.querySelectorAll('[role="group"]');
    expect(groups).toHaveLength(1);
    expect(groups[0]!.getAttribute("aria-label")).toBe("Cards we accept");
    expect(groups[0]!.className).toBe("siteFooterMarks");
    const links = groups[0]!.querySelectorAll("a");
    expect(links).toHaveLength(1);
    expect(links[0]!.getAttribute("href")).toBe("https://netopia-payments.com/");
    expect(links[0]!.getAttribute("target")).toBe("_blank");
    expect(links[0]!.getAttribute("rel")).toBe("noopener noreferrer");
    expect(links[0]!.getAttribute("title")).toBe("NETOPIA Payments");
    const images = [...root.querySelectorAll("img")].filter((image) => image.closest(".siteFooterAnpc") === null);
    expect(images).toHaveLength(1);
    const image = images[0]!;
    expect(image.getAttribute("src")).toBe(LOGO);
    expect(image.getAttribute("alt")).toBe("NETOPIA Payments, Visa, Mastercard");
    expect(image.getAttribute("loading")).toBe("lazy");
    expect(image.getAttribute("referrerpolicy")).toBe("no-referrer");
    expect(image.hasAttribute("crossorigin")).toBe(false);
    expect(root.querySelector('img[src^="/payment-marks/"]')).toBeNull();
  });

  it("while billing is off, or without billing facts: no logo and nothing from NETOPIA's server", () => {
    for (const root of [full(withLogo(false)), full(null), fullWithoutProp()]) {
      expect(root.querySelector('[role="group"]')).toBeNull();
      expect(root.innerHTML).not.toContain("mny.ro");
    }
  });

  it("sits on a white chip in both themes, inside NETOPIA's 250 x 50 box; each mark file has its own white chip too", () => {
    const css = readFileSync(resolve("apps/ui/app/legal.css"), "utf8");
    const rule = (selector: string): string => {
      const at = css.indexOf(`\n${selector} {`);
      expect(at, selector).toBeGreaterThan(-1);
      return css.slice(at, css.indexOf("}", at));
    };
    expect(rule(".siteFooterMarks > img")).toContain("background: #fff;");
    expect(rule(".siteFooterMarks > img")).toContain("height: 24px;");
    // The page sets border-box on every element; the mark's chip padding and border must not eat into its 24px artwork.
    expect(readFileSync(resolve("apps/ui/app/globals.css"), "utf8")).toMatch(/\n\* \{\s*box-sizing: border-box;/);
    expect(rule(".siteFooterMarks > img")).toContain("box-sizing: content-box;");
    const chip = rule(".siteFooterNetopia");
    for (const part of ["background: #fff;", "border: 1px solid var(--line);", "forced-color-adjust: none;", "max-width: 100%;"]) expect(chip).toContain(part);
    // 245 x 44 (418 x 75 scaled), 223 x 40 on a phone: both inside 250 x 50.
    const image = rule(".siteFooterNetopia img");
    for (const part of ["width: 245px;", "height: auto;", "aspect-ratio: 418 / 75;", "object-fit: contain;"]) expect(image).toContain(part);
    expect(245 * 75 / 418).toBeLessThanOrEqual(50);
    expect(css).toMatch(/@media \(max-width: 760px\) \{\s*\.siteFooterNetopia img \{ width: 223px; \}\s*\}/);
    // The phone width comes after the base rule, so it wins.
    expect(css.indexOf(".siteFooterNetopia img { width: 223px; }")).toBeGreaterThan(css.indexOf("\n.siteFooterNetopia img {"));
    // An image that did not load shows its alt text on the chip, never a broken-image icon.
    expect(rule(".siteFooterNetopia img::after")).toContain("content: attr(alt);");
  });

  it("builds its alt text from the brand keys, the same in every locale", () => {
    for (const locale of readdirSync(resolve("apps/ui/messages"))) {
      const chrome = JSON.parse(readFileSync(resolve("apps/ui/messages", locale, "chrome.json"), "utf8")) as Record<string, string>;
      expect([chrome["chrome.footer.netopia"], chrome["chrome.footer.visa"], chrome["chrome.footer.mastercard"]].join(", "), locale)
        .toBe("NETOPIA Payments, Visa, Mastercard");
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
