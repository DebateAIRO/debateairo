import { readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";
import { renderToStaticMarkup } from "react-dom/server";
import { JSDOM } from "jsdom";
import { describe, expect, it } from "vitest";

import { SiteFooter } from "../../apps/ui/components/SiteFooter.js";
import type { SiteFooterBilling } from "../../apps/ui/lib/billing/footerBilling.js";
import chromeEnglish from "../../apps/ui/messages/en/chrome.json" with { type: "json" };

const ANPC_SAL_URL = "https://reclamatiisal.anpc.ro/";
const ANPC_SAL_SRC = "/consumer-protection/anpc-sal.png";
const ANPC_SAL_TITLE = "ANPC – Soluționarea alternativă a litigiilor";
const ANPC_SAL_ALT = "ANPC – Soluționarea alternativă a litigiilor. Detalii";

const markup = (element: JSX.Element): Document => new JSDOM(renderToStaticMarkup(element)).window.document;
const full = (billing?: SiteFooterBilling | null): Element =>
  markup(<SiteFooter variant="full" billing={billing} />).querySelector("footer.siteFooterFull")!;
const line = (): Element => markup(<SiteFooter variant="line" />).querySelector("footer.siteFooterLine")!;
const ALL_MARKS = { netopia: true, visa: true, mastercard: true };

const expectBadge = (root: Element): void => {
  const badges = root.querySelectorAll(`a[href="${ANPC_SAL_URL}"]`);
  expect(badges).toHaveLength(1);
  const badge = badges[0]!;
  expect(badge.className).toBe("siteFooterAnpc");
  expect(badge.getAttribute("target")).toBe("_blank");
  expect(badge.getAttribute("rel")?.split(" ")).toContain("noopener");
  expect(badge.getAttribute("title")).toBe(ANPC_SAL_TITLE);
  expect(badge.getAttribute("lang")).toBe("ro");
  const images = badge.querySelectorAll("img");
  expect(images).toHaveLength(1);
  expect(images[0]!.getAttribute("src")).toBe(ANPC_SAL_SRC);
  expect(images[0]!.getAttribute("alt")).toBe(ANPC_SAL_ALT);
};

describe("ANPC's SAL badge in the site footer (design 15a full, 15b one line, 15c phone)", () => {
  it("the full footer shows it in every billing state, under a CONSUMER PROTECTION head", () => {
    const off: SiteFooterBilling = { billingOn: false, marks: ALL_MARKS };
    const on: SiteFooterBilling = { billingOn: true, marks: ALL_MARKS };
    for (const root of [full(), full(null), full(off), full(on)]) {
      expectBadge(root);
      const row = root.querySelector(".siteFooterConsumer")!;
      expect(row.querySelector(".siteFooterHead")?.textContent).toBe(chromeEnglish["chrome.footer.consumerProtection"]);
      expect(row.lastElementChild?.matches("a.siteFooterAnpc")).toBe(true);
    }
    expect(chromeEnglish["chrome.footer.consumerProtection"]).toBe("Consumer protection");
  });

  it("the full footer's row sits after the link columns, before the card marks and the copyright line (15a)", () => {
    const children = [...full({ billingOn: true, marks: ALL_MARKS }).children].map((child) => child.className);
    expect(children).toEqual(["siteFooterColumns", "siteFooterConsumer", "siteFooterMarks", "siteFooterBase"]);
  });

  it("the one-line footer ends with it, after cookie preferences (15b)", () => {
    const root = line();
    expectBadge(root);
    expect(root.lastElementChild?.matches("a.siteFooterAnpc")).toBe(true);
    expect(root.querySelector("nav")?.contains(root.querySelector("a.siteFooterAnpc"))).toBe(false);
  });

  it("the artwork is in the repository, and its size matches the image's width and height attributes", () => {
    const png = readFileSync(resolve("apps/ui/public", ANPC_SAL_SRC.slice(1)));
    expect(png.subarray(0, 8).toString("hex")).toBe("89504e470d0a1a0a");
    const width = png.readUInt32BE(16);
    const height = png.readUInt32BE(20);
    const image = line().querySelector("a.siteFooterAnpc img")!;
    expect([width, height]).toEqual([Number(image.getAttribute("width")), Number(image.getAttribute("height"))]);
    // Twice the tallest size the CSS draws (44px), so the badge stays sharp on a 2x screen.
    expect(height).toBeGreaterThanOrEqual(88);
  });

  it("names the head in every locale, translated everywhere but English", () => {
    for (const locale of readdirSync(resolve("apps/ui/messages"))) {
      const chrome = JSON.parse(readFileSync(resolve("apps/ui/messages", locale, "chrome.json"), "utf8")) as Record<string, string>;
      const head = chrome["chrome.footer.consumerProtection"];
      expect(head?.trim(), locale).toBeTruthy();
      if (locale !== "en") expect(head, locale).not.toBe(chromeEnglish["chrome.footer.consumerProtection"]);
    }
  });

  it("legal.css draws it 44px tall in the full footer, 22px on the line, 40px on a phone, and the line makes room", () => {
    const css = readFileSync(resolve("apps/ui/app/legal.css"), "utf8");
    expect(css).toMatch(/\.siteFooterAnpc img \{ display: block; width: auto; height: 44px; \}/);
    expect(css).toMatch(/\.siteFooterLine \.siteFooterAnpc img \{ height: 22px; \}/);
    expect(css).toMatch(/@media \(max-width: 760px\) \{[\s\S]*\.siteFooterConsumer \.siteFooterAnpc img \{ height: 40px; \}/);
    // The canvas gives the line exactly this much room: the 28px chip, 10px of padding above and below, the 1px top border.
    expect(css).toMatch(/\.appShell \{ --site-footer-line-h: 49px; \}/);
  });
});
