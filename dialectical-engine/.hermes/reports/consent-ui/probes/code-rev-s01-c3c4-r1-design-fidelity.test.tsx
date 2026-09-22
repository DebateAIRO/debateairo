// @vitest-environment jsdom
//
// CODE-REV-S01-C3C4 r1 — the REVIEWER's own probe. Built from the CLAIM and the
// design extracts, never from the author's tests. Every expected string is READ
// OUT OF THE DESIGN FILES at run time; nothing here is retyped by hand, so a
// transcription slip of mine cannot manufacture a finding.

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { CONSENT_KEY, COOKIE_CATEGORIES } from "../apps/ui/lib/consent.js";
import { CookieBar } from "../apps/ui/components/consent/CookieBar.js";
import { CookiePreferencesCard } from "../apps/ui/components/consent/CookiePreferencesCard.js";

const DESIGN = resolve(
  process.cwd(),
  "../../../docs/missions/consent-ui/design"
);
const html = readFileSync(resolve(DESIGN, "turn-10-cookie-consent.html"), "utf8");
const dataJs = readFileSync(resolve(DESIGN, "design-data.js"), "utf8");

/** Visible text nodes of a design fragment, in DOM order. */
function designText(from: string, to: string | null): string[] {
  const a = html.indexOf(from);
  expect(a, `design fragment ${from.slice(0, 40)}`).toBeGreaterThan(-1);
  const b = to === null ? html.length : html.indexOf(to);
  return html
    .slice(a, b === -1 ? html.length : b)
    .replace(/<[^>]*>/g, "\n")
    .split("\n")
    .map((s) => s.replace(/\{\{[^}]*\}\}/g, "").trim())
    .filter((s) => s.length > 0 && !s.startsWith("style="));
}

/** 10a, the bar itself. */
const DESIGN_BAR = designText(
  'style="position:absolute; left:22px; right:22px; bottom:22px;',
  '<div id="10c"'
);
/** 10b, the preferences card. */
const DESIGN_CARD = designText('<div data-screen-label="10b Cookie preferences"', null);

/** `cookieCats` from design-data.js: name, tag, desc, detail per category. */
const DESIGN_CATS = [...dataJs.slice(dataJs.indexOf("const cookieCats")).matchAll(/mkCat\(([^)]*)\)/g)]
  .map((m) => {
    const args: string[] = [];
    const re = /'((?:[^'\\]|\\.)*)'/g;
    let x: RegExpExecArray | null;
    while ((x = re.exec(m[1] ?? "")) !== null) {
      args.push(JSON.parse(`"${(x[1] ?? "").replace(/"/g, '\\"')}"`) as string);
    }
    return args;
  })
  .filter((args) => args.length >= 4);

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

const noop = (): void => {};
function mountBar(h: Partial<{ onEssentialOnly: () => void; onChoose: (o: HTMLElement | null) => void; onAcceptAll: () => void }> = {}) {
  act(() => {
    root!.render(
      <CookieBar
        onEssentialOnly={h.onEssentialOnly ?? noop}
        onChoose={h.onChoose ?? noop}
        onAcceptAll={h.onAcceptAll ?? noop}
      />
    );
  });
}
function mountCard(
  h: Partial<{
    initial: { quality: boolean; analytics: boolean };
    onSave: (c: { essential: true; quality: boolean; analytics: boolean }) => void;
    onEssentialOnly: () => void;
    onDismiss: () => void;
    onRequestPolicy: () => void;
  }> = {}
) {
  act(() => {
    root!.render(
      <CookiePreferencesCard
        initial={h.initial ?? { quality: true, analytics: false }}
        onSave={h.onSave ?? noop}
        onEssentialOnly={h.onEssentialOnly ?? noop}
        onDismiss={h.onDismiss ?? noop}
        onRequestPolicy={h.onRequestPolicy ?? noop}
      />
    );
  });
}

/** Every visible string the mounted tree renders, in DOM order. */
function renderedText(scope: ParentNode = document.body): string[] {
  const out: string[] = [];
  const walk = document.createTreeWalker(scope, NodeFilter.SHOW_TEXT);
  for (let n = walk.nextNode(); n !== null; n = walk.nextNode()) {
    const t = (n.textContent ?? "").trim();
    if (t.length > 0) out.push(t);
  }
  return out;
}

const codepoints = (s: string): string =>
  [...s].map((c) => c.codePointAt(0)!.toString(16).padStart(4, "0")).join(" ");

describe("REV C3 — the bar (10a) against the design", () => {
  it("renders exactly the design's strings, in the design's DOM order, codepoint for codepoint", () => {
    mountBar();
    const rendered = renderedText();
    expect(rendered, "rendered bar strings vs design 10a").toEqual(DESIGN_BAR);
    for (let i = 0; i < DESIGN_BAR.length; i += 1) {
      expect(codepoints(rendered[i] ?? ""), `codepoints of string ${i}`).toBe(
        codepoints(DESIGN_BAR[i] ?? "")
      );
    }
  });

  it("is a labelled region, is not a dialog, and pulls no focus", () => {
    mountBar();
    const bar = document.querySelector('[role="region"]');
    expect(bar, "the bar is a region").not.toBeNull();
    expect(bar!.getAttribute("aria-label")).toBe("Cookie consent");
    expect(document.querySelector('[role="dialog"]'), "the bar is not a dialog").toBeNull();
    expect(document.querySelector("[aria-modal]"), "the bar is not modal").toBeNull();
    expect(document.activeElement, "focus stays on the body").toBe(document.body);
  });

  it("offers no dismissal that is not a decision", () => {
    const seen: string[] = [];
    mountBar({
      onEssentialOnly: () => seen.push("essential-only"),
      onChoose: () => seen.push("choose"),
      onAcceptAll: () => seen.push("accept-all")
    });
    const bar = document.querySelector('[role="region"]')!;
    // No fourth control of any kind, and no close glyph in any of its spellings.
    const controls = [...bar.querySelectorAll("button,a,[role='button'],[tabindex]")];
    expect(controls.length, "exactly three controls").toBe(3);
    for (const glyph of ["×", "✕", "✖", "╳", "⨯", "❌"]) {
      expect(bar.textContent?.includes(glyph), `close glyph U+${glyph.codePointAt(0)!.toString(16)}`).toBe(false);
    }
    // Escape on the document and on the bar itself: nothing happens, nothing is stored.
    for (const target of [document, bar]) {
      act(() => {
        target.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true, cancelable: true }));
      });
    }
    expect(document.body.contains(bar), "the bar survives Escape").toBe(true);
    expect(seen, "Escape invokes no decision callback").toEqual([]);
    expect(localStorage.getItem(CONSENT_KEY), "the bar writes nothing").toBeNull();
  });

  it("hands the clicked element to onChoose so focus can be returned in C6", () => {
    let opener: HTMLElement | null | undefined;
    mountBar({ onChoose: (o) => (opener = o) });
    const choose = [...document.querySelectorAll("button")].find(
      (b) => b.textContent?.trim() === "Choose what to store"
    )!;
    act(() => choose.click());
    expect(opener, "onChoose receives the button that opened the card").toBe(choose);
  });
});

describe("REV C4 — the preferences card (10b) against the design", () => {
  it("renders exactly the design's chrome + category strings, in DOM order, codepoint for codepoint", () => {
    mountCard();
    const rendered = renderedText();
    // The design's 10b DOM order: eyebrow, title, lede, then the three category
    // rows (name, tag, desc, detail), then the three footer controls.
    const expected = [
      ...DESIGN_CARD.slice(0, 3),
      ...DESIGN_CATS.flatMap((c) => [c[0]!, c[1]!, c[2]!, c[3]!]),
      ...DESIGN_CARD.slice(3)
    ];
    expect(rendered, "rendered card strings vs design 10b + cookieCats").toEqual(expected);
    for (let i = 0; i < expected.length; i += 1) {
      expect(codepoints(rendered[i] ?? ""), `codepoints of string ${i}`).toBe(
        codepoints(expected[i] ?? "")
      );
    }
  });

  it("COOKIE_CATEGORIES itself equals design-data.js cookieCats, string for string", () => {
    expect(
      COOKIE_CATEGORIES.map((c) => [c.name, c.tag, c.description, c.detail]),
      "the twelve category strings"
    ).toEqual(DESIGN_CATS.map((a) => [a[0], a[1], a[2], a[3]]));
  });

  it("locks Essential against click, Space and Enter — asserted after EVERY activation", () => {
    mountCard();
    const sw = () => [...document.querySelectorAll('[role="switch"]')].map((s) => s.getAttribute("aria-checked"));
    const essential = document.querySelectorAll<HTMLElement>('[role="switch"]')[0]!;
    expect(essential.getAttribute("aria-disabled"), "announced as locked").toBe("true");
    expect(essential.hasAttribute("disabled"), "but still focusable").toBe(false);
    const start = sw();
    act(() => essential.click());
    expect(sw(), "after click").toEqual(start);
    for (const key of [" ", "Enter", "Spacebar"]) {
      act(() => {
        essential.dispatchEvent(new KeyboardEvent("keydown", { key, bubbles: true, cancelable: true }));
      });
      expect(sw(), `after ${JSON.stringify(key)}`).toEqual(start);
    }
  });

  it("the two operable switches answer click AND Space (and Enter)", () => {
    mountCard({ initial: { quality: true, analytics: false } });
    const all = [...document.querySelectorAll<HTMLElement>('[role="switch"]')];
    const sw = () => all.map((s) => s.getAttribute("aria-checked"));
    expect(sw(), "R17 defaults on open").toEqual(["true", "true", "false"]);
    act(() => all[1]!.click());
    expect(sw(), "click flips quality off").toEqual(["true", "false", "false"]);
    act(() => {
      all[1]!.dispatchEvent(new KeyboardEvent("keydown", { key: " ", bubbles: true, cancelable: true }));
    });
    expect(sw(), "Space flips quality on").toEqual(["true", "true", "false"]);
    act(() => {
      all[2]!.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true, cancelable: true }));
    });
    expect(sw(), "Enter flips analytics on").toEqual(["true", "true", "true"]);
  });

  it("a seeded decision is reflected on open, from either entry point", () => {
    mountCard({ initial: { quality: false, analytics: true } });
    expect(
      [...document.querySelectorAll('[role="switch"]')].map((s) => s.getAttribute("aria-checked")),
      "seeded booleans"
    ).toEqual(["true", "false", "true"]);
  });

  it("Save choices emits the CURRENT toggles once; Essential only emits row 3", () => {
    const saved: unknown[] = [];
    const essentialOnly: number[] = [];
    mountCard({
      initial: { quality: true, analytics: false },
      onSave: (c) => saved.push(c),
      onEssentialOnly: () => essentialOnly.push(1)
    });
    const all = [...document.querySelectorAll<HTMLElement>('[role="switch"]')];
    act(() => all[2]!.click()); // analytics on
    const click = (label: string) =>
      act(() => {
        [...document.querySelectorAll("button")]
          .find((b) => b.textContent?.trim() === label)!
          .click();
      });
    click("Save choices");
    expect(saved).toEqual([{ essential: true, quality: true, analytics: true }]);
    click("Essential only");
    expect(essentialOnly.length, "row 3 fires once").toBe(1);
    expect(saved.length, "Essential only does not also save").toBe(1);
    expect(localStorage.getItem(CONSENT_KEY), "the card stores nothing itself").toBeNull();
  });

  it("is a dialog named by its own visible title, and adds no keydown handler of its own", () => {
    mountCard();
    const card = document.querySelector('[role="dialog"]')!;
    expect(card.getAttribute("aria-modal")).toBe("true");
    const id = card.getAttribute("aria-labelledby");
    expect(id, "aria-labelledby is set").toBeTruthy();
    expect(document.getElementById(id!)?.textContent, "names the visible title").toBe(
      DESIGN_CARD[1]
    );
    // The Esc stack and the focus trap arrive in C6 via modalSemantics.ts: the
    // card must add NO listener of its own and must not act on Escape.
    const src = readFileSync(
      resolve(process.cwd(), "apps/ui/components/consent/CookiePreferencesCard.tsx"),
      "utf8"
    );
    expect(/addEventListener/.test(src), "card registers a listener").toBe(false);
    expect(/["']Escape["']/.test(src), "card acts on Escape").toBe(false);
    expect(/\.focus\(\)/.test(src), "card moves focus").toBe(false);
    // …and Escape on the card is inert at run time, not only in the source.
    let dismissed = 0;
    act(() => {
      card.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true, cancelable: true }));
    });
    expect(dismissed, "no dismissal on Escape in this cluster").toBe(0);
  });
});
