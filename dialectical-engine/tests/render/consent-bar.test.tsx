// @vitest-environment jsdom

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { CONSENT_KEY } from "../../apps/ui/lib/consent.js";
import { CookieBar } from "../../apps/ui/components/consent/CookieBar.js";
import consentEnglish from "../../apps/ui/messages/en/consent.json" with { type: "json" };
import consentRomanian from "../../apps/ui/messages/ro/consent.json" with { type: "json" };
import type { MessageCatalog } from "../../apps/ui/lib/i18n/translate.js";
import {
  S01_CLOSE_MARKER,
  S01_OPEN_MARKER,
  S02_CLOSE_MARKER,
  S02_OPEN_MARKER
} from "../support/consentMarkers.js";

// The acceptance command is pinned to the lane root, so source fixtures resolve
// from process.cwd(); `import.meta.url` can carry a non-file scheme under vitest
// (TOOLING-TRAPS, CODE-T1C3 / CODE-T5C1).
const barSource = (): string =>
  readFileSync(resolve(process.cwd(), "apps/ui/components/consent/CookieBar.tsx"), "utf8");
const globalsSource = (): string =>
  readFileSync(resolve(process.cwd(), "apps/ui/app/globals.css"), "utf8");

// The four marker literals live in `tests/support/consentMarkers.ts`, so S01's suite and S02's
// read the same bytes and a rename cannot fail one slice's file with the other slice's message
// (CODE-REV-S02-C9 r1 N3). The local aliases keep this file's existing call sites unchanged.
const OPEN_MARKER = S01_OPEN_MARKER;
const CLOSE_MARKER = S01_CLOSE_MARKER;
const COLOUR_LITERAL = /oklch\(|#[0-9a-f]{3,8}\b|\brgba?\(/i;

/** The ONE delimited S01 block, markers included (S01-R25, S01-S16). */
function s01Block(): string {
  const css = globalsSource();
  const start = css.indexOf(OPEN_MARKER);
  const end = css.indexOf(CLOSE_MARKER);
  expect(start, "globals.css opens the consent-ui S01 block").toBeGreaterThan(-1);
  expect(end, "globals.css closes the consent-ui S01 block").toBeGreaterThan(start);
  return css.slice(start, end + CLOSE_MARKER.length);
}

const withoutComments = (css: string): string => css.replace(/\/\*[\s\S]*?\*\//g, "");

/** The block with every at-rule (media queries) removed — the unconditional rules. */
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

/** The body of the at-rule whose prelude contains `query`. */
function atRule(css: string, query: string): string {
  const at = css.indexOf(query);
  expect(at, `the block carries ${query}`).toBeGreaterThan(-1);
  const open = css.indexOf("{", at);
  let depth = 0;
  for (let position = open; position < css.length; position += 1) {
    if (css[position] === "{") depth += 1;
    else if (css[position] === "}") {
      depth -= 1;
      if (depth === 0) return css.slice(open + 1, position);
    }
  }
  throw new Error(`unbalanced at-rule for ${query}`);
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

// SPEC §Copy, extracted from `slices/S01/SPEC.md` with a codepoint dump rather
// than retyped (TOOLING-TRAPS, CODE-S01-C1C2): the title carries U+2014 EM DASH
// at index 43 and is 70 characters; every other bar string is pure ASCII.
const EYEBROW = "YOUR DATA, ON THE RECORD";
const TITLE = "We store only what keeps the bench running — unless you say otherwise.";
const BODY =
  "Essential cookies hold your session, MFA state and device record. Analytics and model-quality telemetry are optional and never sold. You can change this any time in Settings.";
const BUTTONS = ["Essential only", "Choose what to store", "Accept all"];

let root: Root | null = null;
let container: HTMLDivElement | null = null;

// vitest.config.ts:19 sets fileParallelism:false and there is no shared setup
// file, so a leaked key survives into later test files in the same worker.
// Precedent: tests/render/t1-canvas.test.tsx:105,133.
beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  localStorage.clear();
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
});

afterEach(() => {
  if (root !== null) act(() => root!.unmount());
  root = null;
  container = null;
  document.body.replaceChildren();
  vi.unstubAllGlobals();
  localStorage.clear();
});

type BarHandlers = {
  onEssentialOnly?: () => void;
  onChoose?: (opener: HTMLElement | null) => void;
  onAcceptAll?: () => void;
};

function mountBar(handlers: BarHandlers = {}, catalog: MessageCatalog = consentEnglish): HTMLElement {
  act(() => {
    root!.render(
      <CookieBar
        catalog={catalog}
        onEssentialOnly={handlers.onEssentialOnly ?? ((): void => {})}
        onChoose={handlers.onChoose ?? ((): void => {})}
        onAcceptAll={handlers.onAcceptAll ?? ((): void => {})}
      />
    );
  });
  const bar = document.querySelector<HTMLElement>(
    `[role="region"][aria-label="${catalog["consent.bar.label"]}"]`
  );
  expect(bar, "the bar renders as a labelled region").not.toBeNull();
  return bar!;
}

function text(selector: string): string {
  const element = document.querySelector(selector);
  expect(element, `missing rendered element ${selector}`).not.toBeNull();
  return element!.textContent ?? "";
}

describe("S01-C3 the cookie bar (10a)", () => {
  it("renders the five bar strings of SPEC §Copy byte-exact, and reaches no storage", () => {
    // PROPERTY (S01-R11): the eyebrow, the Fraunces title, the body paragraph
    // and the three button labels equal SPEC §Copy's strings by `textContent`,
    // so any paraphrase — a swapped dash, a dropped sentence, a reworded
    // button — fails. The bar is presentational: it is handed three callbacks
    // and never touches `localStorage` itself, so the ONE state machine
    // (`CookieConsent`, cluster C5) stays the only writer.
    mountBar();

    expect(text(".consentEyebrow"), "eyebrow").toBe(EYEBROW);
    expect(text(".consentTitle"), "Fraunces title").toBe(TITLE);
    expect(text(".consentBody"), "body paragraph").toBe(BODY);
    expect(
      [...document.querySelectorAll("button")].map((button) => button.textContent?.trim()),
      "the three button labels"
    ).toEqual(BUTTONS);
  });

  it("keeps dev's SPEC §Copy bytes as the English catalogue values", () => {
    // Localization moved the literals into `messages/en/consent.json`; the English bytes
    // are still the codepoint-dumped SPEC §Copy strings above, key for key.
    expect(consentEnglish["consent.bar.eyebrow"]).toBe(EYEBROW);
    expect(consentEnglish["consent.bar.title"]).toBe(TITLE);
    expect(consentEnglish["consent.bar.body"]).toBe(BODY);
    expect([
      consentEnglish["consent.action.essentialOnly"],
      consentEnglish["consent.bar.choose"],
      consentEnglish["consent.bar.acceptAll"]
    ]).toEqual(BUTTONS);
    expect(consentEnglish["consent.bar.label"]).toBe("Cookie consent");
  });

  it("renders Romanian consent copy from the catalogue into the DOM", () => {
    mountBar({}, consentRomanian);

    expect(text(".consentEyebrow"), "Romanian eyebrow").toBe(
      consentRomanian["consent.bar.eyebrow"]
    );
    expect(text(".consentTitle"), "Romanian title").toBe(
      consentRomanian["consent.bar.title"]
    );
    expect(text(".consentBody"), "Romanian body").toBe(consentRomanian["consent.bar.body"]);
    expect(
      [...document.querySelectorAll("button")].map((button) => button.textContent?.trim()),
      "Romanian controls in DOM order"
    ).toEqual([
      consentRomanian["consent.action.essentialOnly"],
      consentRomanian["consent.bar.choose"],
      consentRomanian["consent.bar.acceptAll"]
    ]);
  });

  it("is a labelled region whose focusable descendants are the three buttons in DOM order", () => {
    // PROPERTY (S01-R12): the bar exposes `role="region"` with
    // `aria-label="Cookie consent"`, and its focusable descendants are exactly
    // the three controls in the design's DOM order — the order in which a
    // reader meets the least-committing option first. Focus is never pulled
    // into the bar and never trapped there, so the visitor can read the page
    // before deciding: the component owns no `.focus()` call and registers no
    // listener of its own.
    const bar = mountBar();

    expect(bar.getAttribute("role"), "the bar's role").toBe("region");
    expect(bar.getAttribute("aria-label"), "the bar's accessible name").toBe("Cookie consent");

    const focusable = [
      ...bar.querySelectorAll<HTMLElement>(
        'a[href],button,input,select,textarea,[tabindex]:not([tabindex="-1"])'
      )
    ].filter((element) => !element.hasAttribute("disabled"));
    expect(
      focusable.map((element) => element.textContent?.trim()),
      "every focusable descendant, in DOM order"
    ).toEqual(BUTTONS);

    expect(document.activeElement, "the bar never pulls focus on mount").toBe(document.body);

    const source = barSource();
    expect(source.includes(".focus()"), "CookieBar.tsx calls .focus()").toBe(false);
    expect(source.includes("addEventListener"), "CookieBar.tsx registers a listener").toBe(false);
  });

  it("offers no dismissal that is not a decision: Escape leaves it standing and writes nothing", () => {
    // PROPERTY (S01-R13): the bar leaves only by a decision. There is no close
    // control and no fourth affordance of any kind, Escape does nothing to it,
    // and nothing reaches storage on a keystroke — the design gives 10a three
    // buttons and no close glyph, and row V-7 says the bar shows until they
    // choose.
    const bar = mountBar();

    act(() => {
      document.dispatchEvent(
        new KeyboardEvent("keydown", { key: "Escape", bubbles: true, cancelable: true })
      );
    });

    expect(document.body.contains(bar), "the bar survives Escape").toBe(true);
    expect(localStorage.getItem(CONSENT_KEY), "Escape writes nothing").toBeNull();

    const controls = [...bar.querySelectorAll("button,a,[role='button']")];
    expect(
      controls.map((control) => control.textContent?.trim()),
      "there is no fourth control and no ×"
    ).toEqual(BUTTONS);
    expect(bar.textContent?.includes("×"), "the bar renders no close glyph").toBe(false);
  });

  it("ships R09's geometry inside ONE delimited S01 block, followed only by whitespace or S02's delimited block", () => {
    // PROPERTY (S01-R09, S01-R25): every one of R09's numbers appears in the
    // shipped stylesheet as written, the slice's rules live in exactly ONE
    // delimited block appended after every existing rule, and every colour in
    // it is a `var(--token)` reference.
    // jsdom computes NO layout, so this asserts the declared rule TEXT and not
    // a rendered pixel — the 22px insets, the 7px bezel, the 52x4 gold tab and
    // the 560px copy column are V's, acceptance steps 1-2 in both modes.
    const css = globalsSource();
    expect(css.split(OPEN_MARKER).length - 1, "exactly one S01 block is opened").toBe(1);
    expect(css.split(CLOSE_MARKER).length - 1, "exactly one S01 block is closed").toBe(1);

    // RELAXED BY THE S02-S66 MERGE, and by nothing else (`CODE-S02-C9`, first commit).
    // This assertion read `css.trimEnd().endsWith(CLOSE_MARKER)` — "the S01 block is the last
    // block in the file" — which was true while S01's lane was alone and became false the
    // moment `slice/consent-s01` was merged into `slice/consent-s02`. Both slices append a
    // delimited block at the end of `globals.css`; the vertical-slice law ACCEPTS that
    // conflict and fixes the resolution as S01's block first and S02's second
    // (`slices/S02/PLAN.md` S02-S66 and §"The single-writer rule against S01"). What S01
    // actually owns — its rules live in ONE block appended after every pre-existing rule, and
    // nothing of S01's is stranded outside it — is unchanged, and this is that property in the
    // form that survives the merge: after S01's closing marker there is nothing but whitespace,
    // or S02's ONE delimited block and then nothing but whitespace. A third block, a stray
    // rule between the two, or anything at all after S02's closing marker still fails here.
    //
    // WHAT THE RELAXATION GAVE UP, and who now owns it (CODE-REV-S02-C9 r1 N4, mutant GX3):
    // this case no longer catches S02's whole block being NESTED INSIDE S01's — the tail below
    // is empty in that arrangement and every assertion here passes. The CO-OWNER of that
    // property is `tests/unit/consent-s02-style-contract.test.ts`'s
    // `S02-S59 · appends exactly one delimited S02 block and ends the file with it`, whose
    // `after.trim() === ""` arm reds on GX3 because S01's closing marker then follows S02's.
    // Neither file pins "S01's block is at the end" alone any more; the pair does.
    const tail = css.slice(css.indexOf(CLOSE_MARKER) + CLOSE_MARKER.length);
    const S02_OPEN = S02_OPEN_MARKER;
    const S02_CLOSE = S02_CLOSE_MARKER;
    const s02At = tail.indexOf(S02_OPEN);
    if (s02At === -1) {
      expect(tail.trim(), "nothing but whitespace follows the S01 block").toBe("");
    } else {
      expect(tail.split(S02_OPEN).length - 1, "exactly one S02 block is opened after S01's").toBe(1);
      expect(tail.split(S02_CLOSE).length - 1, "exactly one S02 block is closed after S01's").toBe(1);
      expect(tail.slice(0, s02At).trim(), "nothing but whitespace between the two blocks").toBe("");
      expect(
        tail.slice(tail.indexOf(S02_CLOSE) + S02_CLOSE.length).trim(),
        "nothing but whitespace follows S02's closing marker"
      ).toBe("");
    }

    const block = withoutComments(s01Block());
    const base = unconditional(block);

    expectDeclarations(base, ".consentBar", [
      "position: fixed",
      "left: 22px",
      "right: 22px",
      "bottom: calc(22px + var(--safe-b))",
      "z-index: var(--z-consent-bar)"
    ]);
    expectDeclarations(base, ".consentBarBezel", [
      "background: var(--shell)",
      "border: 1px solid var(--line-strong)",
      "border-radius: var(--r-panel)",
      "padding: 7px",
      "box-shadow: var(--shadow-pop)"
    ]);
    expectDeclarations(base, ".consentBarCore", [
      "background: var(--core)",
      "border: 1px solid var(--line)",
      "border-radius: 10px",
      "padding: 17px 20px 16px",
      "overflow: hidden",
      "position: relative",
      "display: flex",
      "align-items: center",
      "gap: 24px"
    ]);
    expectDeclarations(base, ".consentTab", [
      "position: absolute",
      "top: 0",
      "left: 20px",
      "width: 52px",
      "height: 4px",
      "border-radius: var(--r-tab)",
      "background: var(--gold)"
    ]);
    expectDeclarations(base, ".consentBody", ["max-width: 560px"]);
    expectDeclarations(base, ".consentActions", ["display: flex", "gap: 9px"]);
    expectDeclarations(base, ".consentGhost", ["white-space: nowrap"]);
    expectDeclarations(base, ".consentPrimary", ["white-space: nowrap"]);

    const literals = s01Block()
      .split("\n")
      .filter((line) => COLOUR_LITERAL.test(line));
    expect(literals, "no colour literal anywhere in the S01 block").toEqual([]);
  });

  it("draws the bar's primary at the artboard's padding, borderless, with the design's hover spring", () => {
    // PROPERTY (CODE-REV-S01-C3C4 r1 N1/N2/N4): every declaration of a class the
    // design draws is diffed against the artboard that draws it, not against a
    // neighbouring artboard that happens to share the class. 10a's `Accept all`
    // is `padding:10px 19px`, has NO border, and carries
    // `transition:transform .5s cubic-bezier(.34,1.56,.64,1)` with a hover
    // `scale(1.04)` (turn-10-cookie-consent.html:39).
    //
    // The border is load-bearing arithmetic, not taste: `* { box-sizing:
    // border-box }` (globals.css:176-177) with `width: auto` makes the used size
    // content + padding + border, so a 1px edge the design omits ships a primary
    // 2px taller and 2px wider than the artboard — and breaks the design's own
    // equality, where a ghost pill's `padding: 9px 15px` + 1px border and a
    // primary's `padding: 10px` + 0 border are both 10px of effective edge in the
    // same `align-items: center` row.
    //
    // Motion is shipped rather than dropped (orchestrator ruling on N4), so
    // S01-R27's second branch is now the operative one: the slice animates, and
    // it therefore owns a scoped `prefers-reduced-motion` counterpart. jsdom
    // computes no layout and runs no transition — this asserts the declared rule
    // TEXT; whether the spring reads well is V's, acceptance steps 1-2.
    const block = withoutComments(s01Block());
    const base = unconditional(block);

    expectDeclarations(base, ".consentPrimary", [
      "padding: 10px 19px",
      "border: none",
      "white-space: nowrap"
    ]);
    expect(
      declarationsFor(base, ".consentPrimary").includes("border: 1px solid var(--ink)"),
      "the primary keeps the border the design does not draw"
    ).toBe(false);

    expectDeclarations(base, ".consentBar .consentPrimary", [
      "transition: transform .5s cubic-bezier(.34,1.56,.64,1)"
    ]);
    expectDeclarations(base, ".consentBar .consentPrimary:hover", ["transform: scale(1.04)"]);

    // R27: the slice's own scoped block, naming its own selectors. There is no
    // global reduced-motion reset in this codebase — the four existing blocks
    // (globals.css:269,3663,4681,5244) are each scoped to their own component.
    const reduced = atRule(block, "@media (prefers-reduced-motion: reduce)");
    expectDeclarations(reduced, ".consentBar .consentPrimary", ["transition: none"]);
    expectDeclarations(reduced, ".consentBar .consentPrimary:hover", ["transform: none"]);
  });

  it("stacks below 720px, the width at which the designed row stops fitting", () => {
    // PROPERTY (S01-R10): below the measured breakpoint the button group moves
    // under the copy block and nothing is allowed to wrap mid-label.
    // 720 is DERIVED, not conventional: the three labels at the designed
    // 11.5-12px / 600-700 measure about 118 + 155 + 100 = 373px, plus two 9px
    // gaps = ~391px; a readable copy column needs ~260px; the row gap is 24px
    // and the core's horizontal padding is 40px — 391 + 260 + 24 + 40 = 715px,
    // so the designed row stops fitting just under 720. 720 also sits below the
    // 768px tablet-portrait width, so tablets keep the designed layout.
    // Whether it ACTUALLY stacks is V's, acceptance step 14.
    const stacked = withoutComments(atRule(withoutComments(s01Block()), "@media (max-width: 719.98px)"));

    expectDeclarations(stacked, ".consentBarCore", [
      "flex-direction: column",
      "align-items: stretch",
      "gap: 14px"
    ]);
    expectDeclarations(stacked, ".consentActions", ["flex-wrap: wrap"]);
    for (const selector of [".consentGhost", ".consentPrimary"]) {
      expectDeclarations(stacked, selector, [
        "flex: 1 1 auto",
        "min-width: 0",
        "white-space: nowrap"
      ]);
    }
    expectDeclarations(stacked, ".consentBar", [
      "left: 12px",
      "right: 12px",
      "bottom: calc(12px + var(--safe-b))"
    ]);
  });

  it("carries no route-conditional offset, so no layout-level component learns its route", () => {
    // PROPERTY (S01-R29): the bar's bottom offset is the same expression on
    // every route. The one surface it overlays is the debate route's
    // `.tokenDock` (`globals.css:3396-3403`, z-index 40, rendered only on the
    // owner debate view at `DebatePageClient.tsx:1525-1529`), which holds
    // exactly one NON-interactive status pill — so the bar at
    // `--z-consent-bar: 45` covers a status indicator and never a control.
    // Teaching a layout-level component which route it is on would trade a
    // temporary overlap for permanent coupling.
    const block = withoutComments(s01Block());

    // NOTE (packet defect, reported on the ticket): `S01-S18`'s acceptance says
    // "exactly one `bottom:` declaration for `.consentBar`", which contradicts
    // `S01-S17`'s own requirement that the media query drop the three insets to
    // 12px. The PROPERTY — route-independence — is asserted here in the form
    // that satisfies both frozen requirements R09 and R10: exactly one
    // unconditional `bottom:` for `.consentBar`, and every `bottom:` it has
    // anywhere is a viewport-width form carrying the safe-area inset.
    const unconditionalBottoms = declarationsFor(unconditional(block), ".consentBar").match(
      /bottom:[^;]*/g
    );
    expect(unconditionalBottoms, "the unconditional bottom offset of the bar").toEqual([
      "bottom: calc(22px + var(--safe-b))"
    ]);

    // Scoped to the `bottom` PROPERTY on rules that select `.consentBar`, in
    // the media query too. An unscoped /bottom:/ also matches `border-bottom:`,
    // which C4 added to the same block — measured, and it turned this case red
    // against a correct stylesheet.
    const barBottoms: string[] = [];
    const rules = /([^{}]+)\{([^{}]*)\}/g;
    for (;;) {
      const match = rules.exec(block);
      if (match === null) break;
      const selectors = (match[1] ?? "").split(",").map((one) => one.trim());
      if (!selectors.includes(".consentBar")) continue;
      for (const declaration of (match[2] ?? "").split(";")) {
        const [property, ...rest] = declaration.split(":");
        if (property?.trim() === "bottom") barBottoms.push(rest.join(":").trim());
      }
    }
    expect(barBottoms.length, "the bar declares a bottom offset in both layouts").toBe(2);
    for (const value of barBottoms) {
      expect(value, "every bar offset is a plain inset plus the safe-area inset").toMatch(
        /^calc\(\d+px \+ var\(--safe-b\)\)$/
      );
    }

    const selectors = [...block.matchAll(/([^{}@]+)\{/g)].map((match) => match[1]?.trim() ?? "");
    expect(
      selectors.filter((selector) => /debate|tokendock/i.test(selector)),
      "no selector in the S01 block is conditioned on a route"
    ).toEqual([]);
  });
});
