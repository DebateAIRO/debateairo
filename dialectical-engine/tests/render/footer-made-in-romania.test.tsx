import { readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";
import { renderToStaticMarkup } from "react-dom/server";
import { JSDOM } from "jsdom";
import { describe, expect, it } from "vitest";

import { SiteFooter } from "../../apps/ui/components/SiteFooter.js";
import chromeEnglish from "../../apps/ui/messages/en/chrome.json" with { type: "json" };

const markup = (element: JSX.Element): Document => new JSDOM(renderToStaticMarkup(element)).window.document;
const full = (): Element => markup(<SiteFooter variant="full" />).querySelector("footer.siteFooterFull")!;
const line = (): Element => markup(<SiteFooter variant="line" />).querySelector("footer.siteFooterLine")!;

const MESSAGES = resolve(process.cwd(), "apps/ui/messages");
const LEGAL_CSS = readFileSync(resolve(process.cwd(), "apps/ui/app/legal.css"), "utf8");

describe("the made-in sentence in the site footer", () => {
  it("both footer shapes show it once, right after the copyright", () => {
    for (const root of [full(), line()]) {
      const sentences = root.querySelectorAll(".siteFooterMadeIn");
      expect(sentences).toHaveLength(1);
      expect(sentences[0]!.previousElementSibling?.className).toBe("siteFooterCopyright");
    }
  });

  it("a reader sees the words with a drawn heart and a drawn flag where the sentence puts them", () => {
    expect(chromeEnglish["chrome.footer.madeIn"]).toBe("Made with {heart} in Romania {flag}");
    const seen = line().querySelector(".siteFooterMadeIn > [aria-hidden]")!;
    expect(seen.textContent).toBe("Made with  in Romania ");
    expect([...seen.childNodes].map((node) => (node.nodeType === 3 ? node.textContent : (node as Element).getAttribute("class")))).toEqual([
      "Made with ",
      "siteFooterMadeInHeart",
      " in Romania ",
      "siteFooterMadeInFlag"
    ]);
  });

  it("the flag is Romania's: blue, yellow, red, in equal upright bands", () => {
    const bands = [...line().querySelectorAll(".siteFooterMadeInFlag rect")];
    expect(bands.map((band) => band.getAttribute("fill"))).toEqual(["#002B7F", "#FCD116", "#CE1126"]);
    expect(bands.map((band) => band.getAttribute("width"))).toEqual(["6", "6", "6"]);
  });

  it("a screen reader hears the plain sentence and none of the pictures", () => {
    for (const root of [full(), line()]) {
      const sentence = root.querySelector(".siteFooterMadeIn")!;
      expect(sentence.querySelector(".srOnly")?.textContent).toBe("Made with love in Romania");
      expect(sentence.querySelectorAll("svg")).toHaveLength(2);
      for (const picture of sentence.querySelectorAll("svg")) expect(picture.closest("[aria-hidden]")).not.toBeNull();
    }
  });

  it("every language's sentence names the heart and the flag exactly once", () => {
    const locales = readdirSync(MESSAGES, { withFileTypes: true }).filter((entry) => entry.isDirectory()).map((entry) => entry.name);
    expect(locales).toHaveLength(35);
    for (const locale of locales) {
      const catalog = JSON.parse(readFileSync(resolve(MESSAGES, locale, "chrome.json"), "utf8")) as Record<string, string>;
      const sentence = catalog["chrome.footer.madeIn"]!;
      expect(sentence.split("{heart}"), locale).toHaveLength(2);
      expect(sentence.split("{flag}"), locale).toHaveLength(2);
      expect(catalog["chrome.footer.madeInSpoken"]?.trim(), locale).not.toBe("");
    }
  });

  /** The body of the first rule for `selector` that is written over several lines. */
  const rule = (css: string, selector: string): string => {
    const start = css.indexOf(`${selector} {\n`);
    expect(start, selector).toBeGreaterThan(-1);
    return css.slice(start, css.indexOf("}", start));
  };

  it("the sentence stays on one line, and on a phone it takes the row under the copyright", () => {
    expect(LEGAL_CSS).toContain(".siteFooterMadeIn { font-size: 11px; color: var(--muted); white-space: nowrap; }");
    const phone = LEGAL_CSS.slice(LEGAL_CSS.indexOf("@media (max-width: 760px)"));
    expect(phone).toContain(".siteFooterBase { flex-wrap: wrap;");
    expect(phone).toContain(".siteFooterMadeIn { flex-basis: 100%; white-space: normal; }");
    const phoneLine = rule(phone, ".siteFooterLine .siteFooterMadeIn");
    for (const declaration of ["display: block;", "flex: 0 0 100%;", "height: auto;", "overflow: visible;"]) {
      expect(phoneLine).toContain(declaration);
    }
  });

  it("on the one line it only uses room the links leave, so it never pushes them to a second row", () => {
    const wide = LEGAL_CSS.slice(0, LEGAL_CSS.indexOf("@media (max-width: 760px)"));
    const slot = rule(wide, ".siteFooterLine .siteFooterMadeIn");
    for (const declaration of ["flex: 1 1 0;", "flex-wrap: wrap;", "min-width: 0;", "height: 15px;", "overflow: hidden;"]) {
      expect(slot).toContain(declaration);
    }
    expect(wide).toContain('.siteFooterLine .siteFooterMadeIn::before { content: ""; height: 100%; }');
  });
});
