// @vitest-environment jsdom

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { CONSENT_KEY, COOKIE_CATEGORIES } from "../../apps/ui/lib/consent.js";
import { CookiePreferencesCard } from "../../apps/ui/components/consent/CookiePreferencesCard.js";
import consentEnglish from "../../apps/ui/messages/en/consent.json" with { type: "json" };
import { t } from "../../apps/ui/lib/i18n/translate.js";

// The acceptance command is pinned to the lane root, so source fixtures resolve
// from process.cwd(); `import.meta.url` can carry a non-file scheme under vitest
// (TOOLING-TRAPS, CODE-T1C3 / CODE-T5C1).
const cardSource = (): string =>
  readFileSync(
    resolve(process.cwd(), "apps/ui/components/consent/CookiePreferencesCard.tsx"),
    "utf8"
  );
const globalsSource = (): string =>
  readFileSync(resolve(process.cwd(), "apps/ui/app/globals.css"), "utf8");

// SPEC §Copy, extracted with a codepoint dump rather than retyped: the lede
// carries U+2192 RIGHT ARROW (TOOLING-TRAPS, CODE-S01-C1C2).
const EYEBROW = "CHOOSE WHAT TO STORE";
const TITLE = "Cookie preferences";
const LEDE = "Asked once. Revisit any time from Settings → Privacy.";
const FOOTER = ["Privacy notice", "Essential only", "Save choices"];
/**
 * Dev's twelve category strings, by row ([name, tag, description, detail]) — the bytes dev's
 * `COOKIE_CATEGORIES` carried before localization moved them into `messages/en/consent.json`.
 */
const DEV_CATEGORY_STRINGS = [
  [
    "Essential",
    "ALWAYS ON",
    "Session, MFA state and the device record that lets you spot a login you do not recognise.",
    "de_session · de_mfa · de_device — 30 days"
  ],
  [
    "Model quality telemetry",
    "OPTIONAL",
    "Which arguments you challenge or flag, used to tune judge panels. Never tied to your debates’ text.",
    "de_quality — 90 days · first-party"
  ],
  [
    "Product analytics",
    "OPTIONAL",
    "Aggregate page and feature usage. No cross-site tracking, no advertising, never sold.",
    "de_analytics — 90 days · first-party"
  ]
];
/** Every string the card renders that is NOT one of the twelve category strings. */
const CARD_CHROME = [EYEBROW, TITLE, LEDE, ...FOOTER];

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
  initial?: { quality: boolean; analytics: boolean };
  onSave?: (choice: { essential: true; quality: boolean; analytics: boolean }) => void;
  onEssentialOnly?: () => void;
  onDismiss?: () => void;
  onRequestPolicy?: () => void;
};

/** R17's defaults when no valid `v: 1` decision is stored, from EITHER entry point. */
const DEFAULTS = { quality: true, analytics: false };

function mountCard(handlers: CardHandlers = {}): HTMLElement {
  act(() => {
    root!.render(
      <CookiePreferencesCard
        catalog={consentEnglish}
        initial={handlers.initial ?? DEFAULTS}
        onSave={handlers.onSave ?? ((): void => {})}
        onEssentialOnly={handlers.onEssentialOnly ?? ((): void => {})}
        onDismiss={handlers.onDismiss ?? ((): void => {})}
        onRequestPolicy={handlers.onRequestPolicy ?? ((): void => {})}
      />
    );
  });
  const card = document.querySelector<HTMLElement>('[role="dialog"]');
  expect(card, "the card renders as a dialog").not.toBeNull();
  return card!;
}

const switches = (): HTMLElement[] => [...document.querySelectorAll<HTMLElement>('[role="switch"]')];
const checked = (): string[] =>
  switches().map((control) => control.getAttribute("aria-checked") ?? "");

function press(control: HTMLElement, key: string): void {
  act(() => {
    control.dispatchEvent(new KeyboardEvent("keydown", { key, bubbles: true, cancelable: true }));
  });
}

function clickLabelled(label: string): void {
  const button = [...document.querySelectorAll("button")].find(
    (candidate) => candidate.textContent?.trim() === label
  );
  expect(button, `missing rendered control ${label}`).toBeDefined();
  act(() => {
    (button as HTMLButtonElement).click();
  });
}

describe("S01-C4 the cookie preferences card (10b)", () => {
  it("renders the three categories from COOKIE_CATEGORIES, all twelve strings, in the design's order", () => {
    // PROPERTY (S01-R16, S01-R28): the card renders the three categories in
    // `cookieCats` order — name, tag pill, description and mono detail line —
    // and every one of the twelve strings comes from `COOKIE_CATEGORIES`, so a
    // component that inlines one fails and V's ruling on the five cookie names
    // (contested row Q7-01) stays a one-line data edit.
    mountCard();

    const rows = [...document.querySelectorAll(".consentCatRow")];
    expect(rows.length, "one row per category").toBe(3);
    expect(
      rows.map((row) => [
        row.querySelector(".consentCatName")?.textContent,
        row.querySelector(".consentTag")?.textContent,
        row.querySelector(".consentCatDesc")?.textContent,
        row.querySelector(".consentCatDetail")?.textContent
      ]),
      "the twelve strings, by row, in the design's order"
    ).toEqual(
      COOKIE_CATEGORIES.map((category) => [
        t(consentEnglish, category.nameKey),
        t(consentEnglish, category.tagKey),
        t(consentEnglish, category.descriptionKey),
        t(consentEnglish, category.detailKey, category.detailVars)
      ])
    );
    // ...and the rendered English is dev's bytes, pinned literally.
    expect(
      rows.map((row) => [
        row.querySelector(".consentCatName")?.textContent,
        row.querySelector(".consentTag")?.textContent,
        row.querySelector(".consentCatDesc")?.textContent,
        row.querySelector(".consentCatDetail")?.textContent
      ]),
      "dev's twelve category strings"
    ).toEqual(DEV_CATEGORY_STRINGS);

    // The containment arm: a category string INLINED in the component appears
    // either as a quoted literal or as a JSX text node, i.e. bounded by a quote
    // or an angle bracket. That distinguishes it from `onEssentialOnly` (an
    // identifier) and from the footer's own `Essential only` label, neither of
    // which is a category string.
    const source = cardSource();
    for (const value of COOKIE_CATEGORIES.flatMap((category) => [
      t(consentEnglish, category.nameKey),
      t(consentEnglish, category.tagKey),
      t(consentEnglish, category.descriptionKey),
      t(consentEnglish, category.detailKey, category.detailVars)
    ])) {
      const inlined = new RegExp(`["'>]\\s*${value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\s*["'<]`);
      expect(inlined.test(source), `"${value}" is inlined in CookiePreferencesCard.tsx`).toBe(false);
    }

    expect(source.includes("localStorage"), "the card reaches storage itself").toBe(false);
  });

  it("renders the card's own four strings of SPEC §Copy byte-exact", () => {
    // PROPERTY (S01-R16 / §Copy): the eyebrow, the Fraunces title and the lede
    // are the design's, byte for byte — the lede's U+2192 included, since it is
    // the sentence that promises the Settings re-entry R21 exists to keep.
    mountCard();

    expect(document.querySelector(".consentEyebrow")?.textContent, "eyebrow").toBe(EYEBROW);
    expect(document.querySelector(".consentCardTitle")?.textContent, "title").toBe(TITLE);
    expect(document.querySelector(".consentLede")?.textContent, "lede").toBe(LEDE);
  });

  it("opens at R17's defaults when nothing valid is stored, in category order", () => {
    // PROPERTY (S01-R17): each category row carries ONE `role="switch"` control
    // whose `aria-checked` is the single source of truth for its state, and a
    // card opened with no valid stored decision shows Essential on, Model
    // quality telemetry on and Product analytics off — from EITHER entry point,
    // because the discriminator is the stored decision and never the opener
    // (REQ-REV-01 B1's class).
    mountCard({ initial: DEFAULTS });

    expect(switches().length, "one switch per category").toBe(3);
    expect(checked(), "aria-checked in category order").toEqual(["true", "true", "false"]);
  });

  it("reflects a seeded decision's booleans on open", () => {
    // PROPERTY (S01-R17): when a valid decision exists the toggles are ITS
    // booleans, again from either entry point — R17's hook case.
    mountCard({ initial: { quality: false, analytics: true } });

    expect(checked(), "the seeded decision, reflected").toEqual(["true", "false", "true"]);
  });

  it("locks Essential against click, Space and Enter alike", () => {
    // PROPERTY (S01-R17): Essential is permanently `true` and inert. It stays
    // FOCUSABLE — `aria-disabled`, not `disabled` — so a keyboard visitor can
    // still reach it and be told it is locked, but no activation changes it.
    mountCard();
    const essential = switches()[0]!;

    expect(essential.getAttribute("aria-disabled"), "Essential announces itself locked").toBe(
      "true"
    );

    // Asserted after EVERY activation, never once at the end. Three flips of a
    // boolean land back where they started, so a single closing assertion is
    // satisfied by a switch that moved three times — measured: a mutant that
    // holds `essential` in state and flips it like the others passed 9/9
    // against the closing form and is caught by this one.
    act(() => {
      essential.click();
    });
    expect(checked(), "a click does not move the locked switch").toEqual(["true", "true", "false"]);

    press(essential, " ");
    expect(checked(), "Space does not move the locked switch").toEqual(["true", "true", "false"]);

    press(essential, "Enter");
    expect(checked(), "Enter does not move the locked switch").toEqual(["true", "true", "false"]);

    // jsdom computes no styles, so `cursor: not-allowed` is asserted as the
    // shipped rule TEXT; whether a mouse user PERCEIVES the lock is V's,
    // acceptance step 6.
    const block = s01Block();
    expect(
      block.includes('.consentSwitch[aria-disabled="true"]'),
      "the locked switch is styled by its own ARIA state"
    ).toBe(true);
    expect(
      declarationsFor(withoutComments(block), '.consentSwitch[aria-disabled="true"]').includes(
        "cursor: not-allowed"
      ),
      "the locked switch declares cursor: not-allowed"
    ).toBe(true);
  });

  it("flips the two operable toggles on click, on Space and on Enter", () => {
    // PROPERTY (S01-R17): the two operable switches respond identically to the
    // three activations a switch must answer. The pin is on the component's own
    // keydown handler, never on the browser: jsdom implements no native
    // activation from a key, so a test that dispatched Space and waited for the
    // BROWSER to click would be red against a correct implementation
    // (TOOLING-TRAPS, ARCH-S02-REWORK-R1).
    mountCard();
    const [, quality, analytics] = switches() as [HTMLElement, HTMLElement, HTMLElement];

    act(() => {
      quality.click();
    });
    expect(checked(), "click turns the quality toggle off").toEqual(["true", "false", "false"]);

    press(quality, " ");
    expect(checked(), "Space turns it back on").toEqual(["true", "true", "false"]);

    press(quality, "Enter");
    expect(checked(), "Enter turns it off again").toEqual(["true", "false", "false"]);

    act(() => {
      analytics.click();
    });
    expect(checked(), "click turns the analytics toggle on").toEqual(["true", "false", "true"]);

    press(analytics, " ");
    expect(checked(), "Space turns it off").toEqual(["true", "false", "false"]);

    press(analytics, "Enter");
    expect(checked(), "Enter turns it on").toEqual(["true", "false", "true"]);
  });

  it("ships R15's card geometry inside the SAME delimited S01 block", () => {
    // PROPERTY (S01-R15, S01-R25): R15's numbers appear in the shipped
    // stylesheet as written, inside the ONE block cluster C3 opened — never a
    // second one — and the card's two layers come from tokens rather than from
    // literals. jsdom computes no layout: the rendered 520px width, the 92vh
    // cap and the 38x22 toggle are V's, acceptance steps 6 and 14.
    const css = globalsSource();
    expect(css.split(OPEN_MARKER).length - 1, "still exactly one S01 block").toBe(1);

    const base = unconditional(withoutComments(s01Block()));

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
    expectDeclarations(base, ".consentSwitch", ["width: 38px", "height: 22px", "padding: 2px"]);
    expectDeclarations(base, ".consentKnob", ["width: 16px", "height: 16px"]);
    expectDeclarations(base, ".consentScrim", [
      "background: var(--scrim)",
      "z-index: var(--z-consent-scrim)"
    ]);
    // The category list is the element that scrolls under the 92vh cap.
    expectDeclarations(base, ".consentCatList", ["overflow-y: auto"]);

    const literals = s01Block()
      .split("\n")
      .filter((line) => COLOUR_LITERAL.test(line));
    expect(literals, "no colour literal anywhere in the S01 block").toEqual([]);
  });

  it("draws the card's primary at 10b's own 18px padding and the knob at 10b's own shadow", () => {
    // PROPERTY (CODE-REV-S01-C3C4 r1 N1/N2/N3): a class shared by two artboards
    // carries EACH artboard's values, and a token is reused only when its VALUE
    // equals the design's, never because its shape matches.
    //   Accept all   padding=10px 19px  border=NONE  (10a, design line 39)
    //   Save choices padding=10px 18px  border=NONE  (10b, design line 130)
    //   knob shadow  0 1px 3px rgba(0,0,0,.3)        (10b, design line 121)
    // `--shadow-thumb` is `0 1px 4px rgba(0,0,0,.3)` (globals.css:55) and may not
    // be re-valued: `.ndSlider::-webkit-slider-thumb` / `::-moz-range-thumb`
    // (:5106, :5115) are another mission's surface. So the knob gets its own
    // mode-independent token, declared beside it in `:root` exactly as C1's own
    // six mode-independent tokens are, and registered in the t9 maps.
    const base = unconditional(withoutComments(s01Block()));

    expectDeclarations(base, ".consentPrimary", ["padding: 10px 19px", "border: none"]);
    expectDeclarations(base, ".consentCardFooter .consentPrimary", ["padding: 10px 18px"]);
    expectDeclarations(base, ".consentKnob", ["box-shadow: var(--shadow-knob)"]);
    expect(
      s01Block().includes("--shadow-thumb"),
      "the S01 block still reaches for the slider's own shadow token"
    ).toBe(false);

    // The token itself: declared in `:root`, absent from the Chamber block —
    // C1's pattern for a mode-independent value, and `--shadow-thumb`'s own.
    const css = globalsSource();
    const chamberAt = css.indexOf('html[data-mode="chamber"] {');
    expect(chamberAt, "globals.css declares the Chamber token block").toBeGreaterThan(-1);
    const rootBlock = css.slice(css.indexOf(":root {"), chamberAt);
    const chamberBlock = css.slice(chamberAt, chamberAt + css.slice(chamberAt).indexOf("\n}"));
    expect(
      rootBlock.includes("--shadow-knob: 0 1px 3px rgba(0,0,0,.3);"),
      ":root declares --shadow-knob comma-tight"
    ).toBe(true);
    expect(chamberBlock.includes("--shadow-knob"), "the Chamber block re-declares it").toBe(false);
  });

  it("documents at the prop that `initial` is read once, by the mount", () => {
    // PROPERTY (CODE-REV-S01-C3C4 r1 N6): a prop consumed by a `useState`
    // initialiser is read at MOUNT and never again, and the consumer is told so
    // at the prop rather than left to discover it. Measured by the reviewer's
    // probe: re-rendering the mounted card with a different `initial` keeps the
    // FIRST value, so a caller that keeps the card mounted and re-renders it
    // after a save shows the visitor stale toggles and can write a decision
    // nobody picked. The remedy on THIS side of the boundary is the contract
    // sentence; cluster C5 owns the fresh mount that honours it.
    const source = cardSource();
    expect(
      source.includes(
        "read once, by the mount; the caller mounts the card fresh for each open"
      ),
      "the `initial` prop states that it is read once"
    ).toBe(true);
    expect(
      source.includes("a re-render with a new `initial` is ignored"),
      "the `initial` prop states what a re-render does NOT do"
    ).toBe(true);
  });

  it("writes R04's rows from the footer's three controls, and offers no fourth", () => {
    // PROPERTY (S01-R19, S01-R04): `Essential only` and `Save choices` each
    // invoke exactly one callback carrying the decision R04's table names, and
    // the footer is the design's three controls in the design's order with no
    // close glyph — 10b is drawn without one, so none is added (row V-11).
    const saved: unknown[] = [];
    const essentialOnly: number[] = [];
    mountCard({
      initial: DEFAULTS,
      onSave: (choice) => saved.push(choice),
      onEssentialOnly: () => essentialOnly.push(1)
    });

    const footer = document.querySelector(".consentCardFooter");
    expect(footer, "the card has a footer").not.toBeNull();
    expect(
      [...footer!.querySelectorAll("button,a,[role='button']")].map((control) =>
        control.textContent?.trim()
      ),
      "exactly three footer controls, in the design's order"
    ).toEqual(FOOTER);
    expect(document.body.textContent?.includes("×"), "the card renders no close glyph").toBe(false);

    // R04 row 4 — the CURRENT toggles: quality off, analytics on.
    const [, quality, analytics] = switches() as [HTMLElement, HTMLElement, HTMLElement];
    act(() => {
      quality.click();
    });
    act(() => {
      analytics.click();
    });
    clickLabelled("Save choices");
    expect(saved, "Save choices writes the current toggles, once").toEqual([
      { essential: true, quality: false, analytics: true }
    ]);

    // R04 row 3 — `Essential only` from the card, whatever the toggles say.
    clickLabelled("Essential only");
    expect(essentialOnly.length, "Essential only fires exactly once").toBe(1);

    expect(localStorage.getItem(CONSENT_KEY), "the card itself stores nothing").toBeNull();
  });

  it("announces itself as a modal dialog named by its own visible title", () => {
    // PROPERTY (S01-R18): a screen-reader user is told what the surface is
    // before its contents. The three attributes are NECESSARY, not sufficient —
    // whether a screen reader announces it correctly is UNVERIFIED by anyone
    // and is stated as such in the PLAN's refutation table for S01-S24.
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
    // focus trap of any kind: the shared `modalSemantics.ts` (S02's, wired in
    // cluster C6) is the only one. Asserted mechanically here. The switch's own
    // JSX `onKeyDown` is R17's activation handler on a single control — it
    // registers nothing on the document and is not a listener this file owns;
    // `S01-S45`'s slice-wide guard bans `addEventListener("keydown"`, the
    // string `Escape` and `.focus()`, none of which appear.
    const source = cardSource();
    expect(source.includes("addEventListener"), "the card registers a listener").toBe(false);
    expect(source.includes(".focus()"), "the card moves focus itself").toBe(false);
    expect(/\bdocument\b/.test(source), "the card reaches the document").toBe(false);
    expect(/["']Escape["']/.test(source), "the card acts on Escape").toBe(false);
  });
});
