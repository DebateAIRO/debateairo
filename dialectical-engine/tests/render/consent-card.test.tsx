// @vitest-environment jsdom

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { CONSENT_KEY } from "../../apps/ui/lib/consent.js";
import { CookiePreferencesCard } from "../../apps/ui/components/consent/CookiePreferencesCard.js";
import { LEGAL_INVENTORY, inventoryCopy } from "../../apps/ui/lib/legal/pages.js";
import consentEnglish from "../../apps/ui/messages/en/consent.json" with { type: "json" };
import legalEnglish from "../../apps/ui/messages/en/legal.json" with { type: "json" };
import type { MessageCatalog } from "../../apps/ui/lib/i18n/translate.js";

// The acceptance command is pinned to the lane root, so source fixtures resolve
// from process.cwd(); `import.meta.url` can carry a non-file scheme under vitest
// (TOOLING-TRAPS, CODE-T1C3 / CODE-T5C1).
const cardSource = (): string =>
  readFileSync(
    resolve(process.cwd(), "apps/ui/components/consent/CookiePreferencesCard.tsx"),
    "utf8"
  );
const consentSource = (): string =>
  readFileSync(resolve(process.cwd(), "apps/ui/components/consent/CookieConsent.tsx"), "utf8");
const globalsSource = (): string =>
  readFileSync(resolve(process.cwd(), "apps/ui/app/globals.css"), "utf8");

// PLAN §3 copy drafts, adopted by DONE.md as the copy of record (artboard S01-04).
const EYEBROW = "WHAT WE STORE";
const TITLE = "Cookies and browser storage";
const LEDE =
  "18 items, each needed for the service to work. Nothing here is optional, and nothing is shared with anyone else.";
const FOOTER = ["Privacy notice", "Cookie policy", "Close"];

/** PLAN §2 Key map, en, EXACT (SPEC-v2 R09): kind and lifetime per INV item, in INV order. */
const EN_KIND = [
  "Cookie (HttpOnly)",
  "Cookie",
  "Cookie (HttpOnly)",
  "Cookie",
  "Cookie (HttpOnly)",
  "Cookie",
  "Cookie (HttpOnly)",
  "Cookie",
  "Cookie (HttpOnly)",
  "Cookie",
  "Cookie (HttpOnly)",
  "Cookie (HttpOnly)",
  "Cookie (HttpOnly)",
  "Local storage",
  "Local storage",
  "Session storage",
  "Session storage",
  "Session storage"
];
const EN_LIFE = [
  "14 days",
  "14 days",
  "30 days",
  "1 year",
  "Up to 8 hours; 15-minute idle expiry",
  "Up to 8 hours; 15-minute idle expiry",
  "Up to 30 minutes",
  "Up to 30 minutes",
  "Up to 299 seconds",
  "Up to 299 seconds",
  "Up to 5 minutes",
  "Up to 5 minutes",
  "Up to 5 minutes",
  "Until you clear it",
  "Until you clear it",
  "Until you close the tab",
  "Until you close the tab",
  "15 minutes or until earlier clearing"
];
const DURATION = /\b\d+\s*(days?|years?|months?|hours?|minutes?|seconds?)\b/gi;

/** The catalogue the card is served: consent plus the 24 inventory strings of legal (D-28). */
const CARD_CATALOG: MessageCatalog = {
  ...consentEnglish,
  ...inventoryCopy(legalEnglish as MessageCatalog)
};

const OPEN_MARKER = "/* === consent-ui S01 === */";
const CLOSE_MARKER = "/* === end consent-ui S01 === */";
const COLOUR_LITERAL = /oklch\(|#[0-9a-f]{3,8}\b|\brgba?\(/i;

// The four CSS readers below are duplicated from `consent-bar.test.tsx` rather
// than shared: a helper module would be a file outside cluster C4's own surface
// (PLAN §Boundaries, "a cluster may write no file outside its own row").

/** The ONE delimited S01 block, markers included (S01-R25). */
function s01Block(): string {
  const css = globalsSource();
  const start = css.indexOf(OPEN_MARKER);
  const end = css.indexOf(CLOSE_MARKER);
  expect(start, "globals.css opens the consent-ui S01 block").toBeGreaterThan(-1);
  expect(end, "globals.css closes the consent-ui S01 block").toBeGreaterThan(start);
  return css.slice(start, end + CLOSE_MARKER.length);
}

const withoutComments = (css: string): string => css.replace(/\/\*[\s\S]*?\*\//g, "");

/** The block with every at-rule removed — the unconditional rules. */
function unconditional(css: string): string {
  let out = "";
  let index = 0;
  for (;;) {
    const at = css.indexOf("@media", index);
    if (at === -1) return out + css.slice(index);
    out += css.slice(index, at);
    let depth = 0;
    let cursor = css.length;
    for (let position = css.indexOf("{", at); position < css.length; position += 1) {
      if (css[position] === "{") depth += 1;
      else if (css[position] === "}") {
        depth -= 1;
        if (depth === 0) {
          cursor = position + 1;
          break;
        }
      }
    }
    index = cursor;
  }
}

/** Every declaration this stylesheet fragment applies to exactly `selector`. */
function declarationsFor(css: string, selector: string): string {
  const bodies: string[] = [];
  const rules = /([^{}]+)\{([^{}]*)\}/g;
  for (;;) {
    const match = rules.exec(css);
    if (match === null) break;
    const selectors = (match[1] ?? "").split(",").map((one) => one.trim());
    if (selectors.includes(selector)) bodies.push(match[2] ?? "");
  }
  expect(bodies.length, `${selector} is declared`).toBeGreaterThan(0);
  return bodies.join(" ");
}

function expectDeclarations(css: string, selector: string, declarations: string[]): void {
  const body = declarationsFor(css, selector);
  for (const declaration of declarations) {
    expect(body.includes(declaration), `${selector} declares ${declaration}`).toBe(true);
  }
}

let root: Root | null = null;

beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  localStorage.clear();
  const container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
});

afterEach(() => {
  if (root !== null) act(() => root!.unmount());
  root = null;
  document.body.replaceChildren();
  vi.unstubAllGlobals();
  localStorage.clear();
});

type CardHandlers = {
  onDismiss?: () => void;
  onRequestPolicy?: () => void;
};

function mountCard(handlers: CardHandlers = {}, catalog: MessageCatalog = CARD_CATALOG): HTMLElement {
  act(() => {
    root!.render(
      <CookiePreferencesCard
        catalog={catalog}
        onDismiss={handlers.onDismiss ?? ((): void => {})}
        onRequestPolicy={handlers.onRequestPolicy ?? ((): void => {})}
      />
    );
  });
  const card = document.querySelector<HTMLElement>('[role="dialog"]');
  expect(card, "the card renders as a dialog").not.toBeNull();
  return card!;
}

const footerControls = (): HTMLElement[] => [
  ...document.querySelectorAll<HTMLElement>(".consentCardFooter button, .consentCardFooter a[href]")
];

describe("S01 the cookie card (10b): a read-only list of the eight items", () => {
  it("renders one row per LEGAL_INVENTORY item, in order: the name, and kind and lifetime equal to the English /cookies strings, and a purpose", () => {
    // PROPERTY (R02, R18 card side): one row per LISTED item in INV order; the row's name is the
    // INV name, its kind and lifetime are the English /cookies strings of that item (R09, EXACT),
    // and its purpose is that item's /cookies purpose, non-empty.
    mountCard();
    const rows = [...document.querySelectorAll<HTMLElement>(".consentCatRow")];
    expect(rows.length, "one row per LEGAL_INVENTORY item").toBe(LEGAL_INVENTORY.length);
    expect(LEGAL_INVENTORY.length, "eight items").toBe(18);
    rows.forEach((row, index) => {
      const item = LEGAL_INVENTORY[index]!;
      const legal = legalEnglish as MessageCatalog;
      expect(row.querySelector("code")?.textContent, `row ${index + 1} name`).toBe(item.name);
      expect(row.querySelector(".consentTag-kind")?.textContent, `row ${index + 1} kind`).toBe(legal[item.kindKey]);
      expect(row.querySelector(".consentTag-kind")?.textContent, `row ${index + 1} kind (R09)`).toBe(EN_KIND[index]);
      expect(row.querySelector(".consentCatDetail")?.textContent, `row ${index + 1} lifetime`).toBe(legal[item.lifeKey]);
      expect(row.querySelector(".consentCatDetail")?.textContent, `row ${index + 1} lifetime (R09)`).toBe(EN_LIFE[index]);
      const purpose = row.querySelector(".consentCatDesc")?.textContent ?? "";
      expect(purpose.trim(), `row ${index + 1} purpose is non-empty`).not.toBe("");
      expect(purpose, `row ${index + 1} purpose`).toBe(legal[item.purposeKey]);
    });
    expect(cardSource().includes("localStorage"), "the card reaches storage itself").toBe(false);
  });

  it("renders the card's own strings byte-exact", () => {
    // PROPERTY (R07, DONE.md 10b): eyebrow, title, lede and the three footer controls are the
    // copy of record; the footer carries Privacy notice, the /cookies link and Close, in order.
    mountCard();
    expect(document.querySelector(".consentEyebrow")?.textContent, "eyebrow").toBe(EYEBROW);
    expect(document.querySelector(".consentCardTitle")?.textContent, "title").toBe(TITLE);
    expect(document.querySelector(".consentLede")?.textContent, "lede").toBe(LEDE);
    expect(footerControls().map((control) => control.textContent?.trim()), "footer, in DOM order").toEqual(FOOTER);
    expect(consentEnglish["consent.preferences.eyebrow"]).toBe(EYEBROW);
    expect(consentEnglish["consent.preferences.title"]).toBe(TITLE);
    expect(consentEnglish["consent.preferences.lede"]).toBe(LEDE);
  });

  it("ships the card's geometry inside the SAME delimited S01 block, with no switch rule", () => {
    // PROPERTY (R02 look, D-45, DONE.md 10b declarations): the card's numbers stay in the ONE S01
    // block, the drawn row classes carry DONE.md's declarations, no rule for a deleted element
    // survives, and no colour literal appears. jsdom computes no layout: the drawn look is V's.
    const css = globalsSource();
    expect(css.split(OPEN_MARKER).length - 1, "still exactly one S01 block").toBe(1);

    const block = withoutComments(s01Block());
    const base = unconditional(block);

    expectDeclarations(base, ".consentCard", [
      "width: min(520px, calc(100vw - 32px))",
      "max-height: 92vh",
      "background: var(--shell)",
      "padding: 7px",
      "border-radius: 18px",
      "z-index: var(--z-consent-card)"
    ]);
    expectDeclarations(base, ".consentCardCore", [
      "background: var(--core)",
      "border: 1px solid var(--line)",
      "border-radius: 12px",
      "padding: 22px 24px 20px",
      "position: relative",
      "overflow: hidden"
    ]);
    expectDeclarations(base, ".consentCardCore .consentTab", ["left: 24px"]);
    expectDeclarations(base, ".consentCatRow", [
      "padding: 14px 0",
      "border-bottom: 1px solid var(--line)"
    ]);
    expectDeclarations(base, ".consentScrim", [
      "background: var(--scrim)",
      "z-index: var(--z-consent-scrim)"
    ]);
    // The item list is the element that scrolls under the 92vh cap (DONE.md step 5).
    expectDeclarations(base, ".consentCatList", ["overflow-y: auto"]);
    // The drawn row (declarations/S01-04-card-frombar-terracotta.md:293-295).
    expectDeclarations(base, ".consentItemName", [
      "color: var(--ink)",
      "font-family: var(--font-mono)",
      "font-size: 11px",
      "font-weight: 700",
      "overflow-wrap: anywhere"
    ]);
    expectDeclarations(base, ".consentTag-kind", [
      "background: var(--muted-bg)",
      "border: 1px solid var(--muted-border)",
      "color: var(--muted)",
      "white-space: nowrap"
    ]);
    expectDeclarations(base, ".consentCatHead", ["flex-wrap: wrap", "row-gap: 4px"]);

    const deleted = /\.consentSwitch|\.consentKnob|\.consentTag-quality|\.consentTag-analytics/;
    const selectors = [...block.matchAll(/([^{}]+)\{/g)].map((match) => (match[1] ?? "").trim());
    expect(
      selectors.filter((selector) => deleted.test(selector)),
      "rules for a deleted element (switch, knob, quality or analytics tag)"
    ).toEqual([]);

    const literals = s01Block()
      .split("\n")
      .filter((line) => COLOUR_LITERAL.test(line));
    expect(literals, "no colour literal anywhere in the S01 block").toEqual([]);
  });

  it("draws the Close button at 10b's primary padding", () => {
    // PROPERTY (D-31, DONE.md default 3): Close is the dark primary pill of the card footer, and
    // that pill carries 10b's own padding (10px 18px), borderless like 10a's.
    mountCard();
    const close = footerControls().at(-1);
    expect(close?.textContent?.trim(), "the last footer control is Close").toBe("Close");
    expect(close?.classList.contains("consentPrimary"), "Close is the primary pill").toBe(true);

    const base = unconditional(withoutComments(s01Block()));
    expectDeclarations(base, ".consentPrimary", ["padding: 10px 19px", "border: none"]);
    expectDeclarations(base, ".consentCardFooter .consentPrimary", ["padding: 10px 18px"]);
  });

  it("offers nothing to choose: no switch, checkbox, input, select or textarea, no Save choices or Essential only, and one link to /cookies", () => {
    // PROPERTY (R02, R04): the card is read-only.
    const card = mountCard();
    expect(card.querySelectorAll('[role="switch"], [role="checkbox"]').length, "switches or checkboxes").toBe(0);
    expect(card.querySelectorAll("input, select, textarea").length, "form fields").toBe(0);
    const labels = [...card.querySelectorAll("button")].map((button) => button.textContent?.trim());
    expect(labels, "no Save choices").not.toContain("Save choices");
    expect(labels, "no Essential only").not.toContain("Essential only");
    expect(card.querySelectorAll('a[href="/cookies"]').length, "one link to /cookies").toBe(1);
    expect(localStorage.getItem(CONSENT_KEY), "the card itself stores nothing").toBeNull();
  });

  it("announces itself as a modal dialog named by its own visible title", () => {
    // PROPERTY (S01-R18, R20): a screen-reader user is told what the surface is
    // before its contents. The three attributes are NECESSARY, not sufficient —
    // whether a screen reader announces it correctly is UNVERIFIED by anyone.
    const card = mountCard();

    expect(card.getAttribute("role"), "role").toBe("dialog");
    expect(card.getAttribute("aria-modal"), "aria-modal").toBe("true");
    const labelledBy = card.getAttribute("aria-labelledby");
    expect(labelledBy, "aria-labelledby is set").toBeTruthy();
    expect(
      document.getElementById(labelledBy!)?.textContent,
      "aria-labelledby points at the visible title"
    ).toBe(TITLE);

    // SPEC §Out of scope bans a second document-level Esc listener and a second
    // focus trap of any kind: the shared `modalSemantics.ts` is the only one.
    const source = cardSource();
    expect(source.includes("addEventListener"), "the card registers a listener").toBe(false);
    expect(source.includes(".focus()"), "the card moves focus itself").toBe(false);
    expect(/\bdocument\b/.test(source), "the card reaches the document").toBe(false);
    expect(/["']Escape["']/.test(source), "the card acts on Escape").toBe(false);
    // R20's own clause: no `.focus(` call in the machine either.
    expect(consentSource().includes(".focus("), "CookieConsent.tsx moves focus itself").toBe(false);
  });

  it("shows every item's name once and no duration outside the eight lifetimes", () => {
    // PROPERTY (R11, card side): the card's code texts are exactly the eight INV names, each
    // once, and every duration string it renders is an INV lifetime that carries a number.
    const card = mountCard();
    const names = [...card.querySelectorAll("code")].map((code) => code.textContent);
    expect([...names].sort(), "every INV name, each once").toEqual(LEGAL_INVENTORY.map((item) => item.name).sort());
    for (const match of (card.textContent ?? "").matchAll(DURATION)) {
      expect(["14 days", "30 days", "1 year", "8 hours", "15 minutes", "30 minutes", "299 seconds", "5 minutes"], `duration ${match[0]}`).toContain(match[0]);
    }
  });
});
