import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

// `.js`, not `.ts`: the root `tsconfig.json` resolves modules as `node16`, which requires an
// explicit extension on a relative ESM import. Same idiom as `tests/unit/t9-mode-tokens.test.ts:326`.
import { contrastRatio } from "../support/contrast.js";

/**
 * S02-C8 — the style contract for slice S02 of mission `consent-ui`.
 *
 * `apps/ui/app/globals.css` is the one file both slices write, so S02's whole stylesheet lives
 * in ONE delimited block appended at the end of it and this suite is that block's contract:
 * where it starts and stops (S02-S59), what may not appear inside it (S02-S60), the geometry
 * and the checkbox-group values the design fixes (S02-S61, S02-S62), the reduced-motion rule
 * (S02-S63), the measured contrast of the disabled `I have read it` (S02-S64), and the standing
 * guard that keeps the fixed scrim's containing block the viewport (S02-S65).
 *
 * jsdom computes no layout and this suite renders nothing: every assertion here is about the
 * STYLESHEET's text. Whether the result LOOKS right is V's at acceptance steps 1-2, 5 and 13.
 * Precedent for reading `globals.css` from a vitest unit test: `tests/unit/t9-mode-tokens.test.ts:35`.
 */

const root = process.cwd();
const globalsPath = resolve(root, "apps/ui/app/globals.css");
const css = readFileSync(globalsPath, "utf8");

const OPEN_MARKER = "/* === consent-ui S02 === */";
const CLOSE_MARKER = "/* === end consent-ui S02 === */";

function occurrences(haystack: string, needle: string): number {
  return haystack.split(needle).length - 1;
}

type Rule = { selector: string; body: string; at: string | null };

function stripComments(text: string): string {
  return text.replace(/\/\*[\s\S]*?\*\//g, "");
}

/**
 * A brace-walking rule reader. It is deliberately NOT a substring scan: `.hermes/TOOLING-TRAPS.md`
 * records a CSS guard that collected `/bottom:\s*([^;]+);/` and went red the day a neighbouring
 * cluster added a perfectly correct `border-bottom:` to the same block — a filter that can match
 * for the wrong reason is not evidence. Every assertion below therefore names a SELECTOR and a
 * PROPERTY, both compared after trimming, never a substring of the stylesheet.
 *
 * `@media` and `@supports` bodies are recursed into so their inner rules are seen with the
 * at-rule recorded; `@keyframes` is kept whole, because its `from`/`to` steps are not rules whose
 * selector any assertion here names. Measured in this file: the only at-rules present are
 * `@keyframes` (7) and `@media` (18).
 */
function parseRules(text: string, at: string | null = null): Rule[] {
  const rules: Rule[] = [];
  let start = 0;
  let preludeEnd = -1;
  let depth = 0;
  for (let i = 0; i < text.length; i += 1) {
    const char = text[i];
    if (char === "{") {
      if (depth === 0) preludeEnd = i;
      depth += 1;
    } else if (char === "}") {
      depth -= 1;
      if (depth === 0) {
        const prelude = text.slice(start, preludeEnd).trim();
        const body = text.slice(preludeEnd + 1, i);
        if (/^@(media|supports)\b/i.test(prelude)) {
          rules.push(...parseRules(body, prelude));
        } else {
          rules.push({ selector: prelude.replace(/\s+/g, " "), body, at });
        }
        start = i + 1;
      }
    }
  }
  return rules;
}

const allRules = parseRules(stripComments(css));
const blockRules = (): Rule[] => parseRules(stripComments(s02Block()));

function declarations(body: string): Array<{ prop: string; value: string }> {
  return body
    .split(";")
    .map((piece) => piece.trim())
    .filter((piece) => piece.length > 0 && piece.includes(":"))
    .map((piece) => {
      const colon = piece.indexOf(":");
      return {
        prop: piece.slice(0, colon).trim(),
        value: piece.slice(colon + 1).trim().replace(/\s+/g, " ")
      };
    })
    .filter((decl) => decl.prop.length > 0);
}

/** The declarations of the ONE rule in S02's block whose selector is exactly `selector`. */
function declsOf(selector: string): Map<string, string> {
  const matches = blockRules().filter((rule) => rule.selector === selector && rule.at === null);
  if (matches.length !== 1) {
    throw new Error(
      `Expected exactly one \`${selector}\` rule in the S02 block, found ${matches.length}`
    );
  }
  const map = new Map<string, string>();
  for (const decl of declarations(matches[0]!.body)) map.set(decl.prop, decl.value);
  return map;
}

/** Asserts `selector { prop: value }` in S02's block, property-exact and value-exact. */
function expectDecl(selector: string, prop: string, value: string): void {
  expect(`${selector} { ${prop}: ${declsOf(selector).get(prop) ?? "<absent>"} }`).toBe(
    `${selector} { ${prop}: ${value} }`
  );
}

/**
 * One token's value out of one of the two blocks S01 owns. Read from the STYLESHEET rather than
 * transcribed, so the ratio computed below is the ratio that ships: a token edited in either
 * block moves this number instead of silently invalidating a constant copied into a test.
 * The blocks hold several declarations per line, so the scan is delimiter-based, not line-based.
 */
function tokenValue(blockSelector: string, name: string): string {
  const open = css.indexOf(`${blockSelector} {`);
  if (open === -1) throw new Error(`No \`${blockSelector}\` block in ${globalsPath}`);
  const end = css.indexOf("\n}", open);
  const block = css.slice(open, end);
  const match = new RegExp(`(?:^|[\\s;{])${name}:\\s*([^;]+);`).exec(block);
  if (match === null) throw new Error(`\`${name}\` is not declared in \`${blockSelector}\``);
  return match[1]!.trim();
}

/** `α·fg + (1-α)·bg` per channel — the flattening `tests/support/contrast.ts` cannot do itself. */
function composite(fg: string, bg: string, alpha: number): string {
  const channels = (hex: string): number[] =>
    [1, 3, 5].map((offset) => Number.parseInt(hex.slice(offset, offset + 2), 16));
  const front = channels(fg);
  const back = channels(bg);
  return `#${front
    .map((value, index) => Math.round(alpha * value + (1 - alpha) * back[index]!).toString(16).padStart(2, "0"))
    .join("")}`;
}

/** The S02 block's inner text, with both markers excluded. Throws if the block is not well formed. */
function s02Block(): string {
  const open = css.indexOf(OPEN_MARKER);
  const close = css.indexOf(CLOSE_MARKER);
  if (open === -1 || close === -1 || close < open) {
    throw new Error(
      `The S02 block is not delimited in ${globalsPath}: open=${open}, close=${close}`
    );
  }
  return css.slice(open + OPEN_MARKER.length, close);
}

describe("S02-C8 consent-ui style contract", () => {
  it("S02-S59 · appends exactly one delimited S02 block and ends the file with it", () => {
    expect(occurrences(css, OPEN_MARKER)).toBe(1);
    expect(occurrences(css, CLOSE_MARKER)).toBe(1);
    expect(css.indexOf(OPEN_MARKER)).toBeLessThan(css.indexOf(CLOSE_MARKER));

    const after = css.slice(css.indexOf(CLOSE_MARKER) + CLOSE_MARKER.length);
    expect(after.trim()).toBe("");
  });

  it("S02-S60 · writes no colour literal and declares no token inside the S02 block", () => {
    const block = s02Block();

    // Every colour in S02's CSS is a `var(--token)` reference, which is WHY both surfaces follow
    // the mode toggle live with nothing wired (R23). The same scan is what
    // `tests/unit/t9-mode-tokens.test.ts`'s colour-literal gate runs over the whole file.
    expect(block.match(/oklch\(|#[0-9a-f]{3,8}\b|\brgba?\(/gi) ?? []).toEqual([]);

    // S02 declares NO token (R22): `tests/unit/t9-mode-tokens.test.ts:376-377` asserts exact set
    // equality between the tokens declared in the two blocks S01 owns and the test's map keys, so
    // one declaration here fails a suite this slice may not edit. A `var(--x)` REFERENCE is not a
    // declaration and is not matched — the pattern is anchored to the start of a line.
    expect(block.match(/^\s*--[a-z0-9-]+\s*:/gim) ?? []).toEqual([]);
  });

  it("S02-S61 · carries the 10c modal geometry, every number derived from the artboard", () => {
    // Scrim: the fixed full-viewport ground that centres the card (R09).
    expectDecl(".policyScrim", "position", "fixed");
    expectDecl(".policyScrim", "inset", "0");
    expectDecl(".policyScrim", "background", "var(--scrim)");
    expectDecl(".policyScrim", "z-index", "var(--z-policy-scrim)");

    // 680 is the artboard's OWN modal width — the 760px artboard less the 40px inset on each
    // side (`design/turn-10-cookie-consent.html:48,50`); `calc(100vw - 32px)` is REQ-01's
    // responsive clamp; 92vh approximates the artboard's vertical proportion (660 less 34px top
    // and bottom = 592, i.e. 89.7%).
    expectDecl(".policyBezel", "width", "min(680px, calc(100vw - 32px))");
    expectDecl(".policyBezel", "max-height", "92vh");
    expectDecl(".policyBezel", "z-index", "var(--z-policy-card)");

    expectDecl(".policyHead", "padding", "22px 24px 14px");

    // The scroll region is the element the scroll-to-end gate measures (R15), so its ability to
    // shrink inside the flex column is load-bearing, not cosmetic.
    expectDecl(".policyBody", "flex", "1");
    expectDecl(".policyBody", "min-height", "0");
    expectDecl(".policyBody", "overflow", "auto");
    expectDecl(".policyBody", "padding", "16px 24px 8px");

    expectDecl(".policyFoot", "padding", "14px 24px");

    // The 52x4 gold tab as drawn at `design/turn-10-cookie-consent.html:52`.
    expectDecl(".policyTab", "top", "0");
    expectDecl(".policyTab", "left", "24px");
    expectDecl(".policyTab", "width", "52px");
    expectDecl(".policyTab", "height", "4px");
    expectDecl(".policyTab", "border-radius", "var(--r-tab)");
  });

  it("S02-S62 · carries the 8a checkbox-group values, read literally off the artboard", () => {
    // Container — `design/turn-8a-checkbox-group.html:1`.
    expectDecl(".consentGroup", "border", "1px solid var(--line)");
    expectDecl(".consentGroup", "border-radius", "11px");
    expectDecl(".consentGroup", "background", "var(--shell)");
    expectDecl(".consentGroup", "padding", "2px 13px");

    // Row — `:2` and `:6`, the two rows byte-identical apart from the first one's rule below.
    expectDecl(".consentRow", "display", "flex");
    expectDecl(".consentRow", "align-items", "flex-start");
    expectDecl(".consentRow", "gap", "10px");
    expectDecl(".consentRow", "padding", "11px 0");
    expectDecl(".consentRow", "cursor", "pointer");

    // The hairline is on the FIRST row only (`:2` has it, `:6` does not). Asserted from BOTH
    // sides — the rule that adds it and the shared rule that must not — and then counted, so a
    // second `border-bottom` on any `.consentRow` selector fails even if both sides still hold.
    expectDecl(".consentGroup > .consentRow:first-child", "border-bottom", "1px solid var(--line)");
    expect(declsOf(".consentRow").has("border-bottom")).toBe(false);
    const rowBorders = blockRules().filter(
      (rule) =>
        rule.selector.includes(".consentRow") &&
        declarations(rule.body).some((decl) => decl.prop === "border-bottom")
    );
    expect(rowBorders.map((rule) => rule.selector)).toEqual([
      ".consentGroup > .consentRow:first-child"
    ]);

    // The 17px square IS the input (`appearance: none` + a pseudo-element), so it keeps native
    // focus, native activation and native `required` — ARCH-S02's ruling, `DECISIONS.md`.
    expectDecl(".consentBox", "appearance", "none");
    expectDecl(".consentBox", "width", "17px");
    expectDecl(".consentBox", "height", "17px");
    expectDecl(".consentBox", "border-radius", "5px");
    expectDecl(".consentBox", "border", "1.5px solid var(--ok-edge)");

    expectDecl(".consentBox:checked", "background", "var(--ok-dot)");

    expectDecl(".consentBox:checked::after", "content", '"✓"');
    expectDecl(".consentBox:checked::after", "color", "var(--core)");
    expectDecl(".consentBox:checked::after", "font-size", "10px");
    expectDecl(".consentBox:checked::after", "font-weight", "800");

    expectDecl(".consentText", "font-size", "11.5px");
    expectDecl(".consentText", "line-height", "1.5");
  });

  it("S02-S63 · neutralises its own motion under `prefers-reduced-motion: reduce`", () => {
    const block = s02Block();

    // R24: there is no global reset in this codebase — the four existing blocks are each
    // component-scoped — so S02 carries its own.
    expect(/@media \(prefers-reduced-motion: reduce\)/.test(block)).toBe(true);

    // And it covers what S02 actually animates. A regex alone is satisfied by an empty query, so
    // the property is stated the other way round: every selector this block animates OUTSIDE the
    // query is switched off INSIDE it. Adding an animation without a matching entry fails here.
    const rules = blockRules();
    const animated = rules
      .filter(
        (rule) => rule.at === null && declarations(rule.body).some((decl) => decl.prop === "animation")
      )
      .flatMap((rule) => rule.selector.split(",").map((part) => part.trim()));
    expect(animated.length).toBeGreaterThan(0);

    const neutralised = rules
      .filter(
        (rule) =>
          rule.at !== null &&
          /prefers-reduced-motion:\s*reduce/.test(rule.at) &&
          declarations(rule.body).some((decl) => decl.prop === "animation" && decl.value === "none")
      )
      .flatMap((rule) => rule.selector.split(",").map((part) => part.trim()));

    expect(animated.filter((selector) => !neutralised.includes(selector))).toEqual([]);
  });

  it("S02-S64 · the disabled `I have read it` clears 4.5:1 in both modes, computed here", () => {
    // The pinned value, and its derivation is a MEASUREMENT rather than a convention: stepping
    // alpha by 0.05 over the composite below gives `.60` -> Terracotta 4.13 (fails 4.5), `.65` ->
    // 4.79 / 7.17, `.70` -> 5.61 / 8.09. `.65` is the smallest 0.05 step clearing 4.5:1 in BOTH
    // modes, i.e. the most dimmed — the most legibly disabled — value that still passes.
    expectDecl(".policyPrimary:disabled", "opacity", ".65");
    const alpha = Number.parseFloat(declsOf(".policyPrimary:disabled").get("opacity")!);
    expect(Number.isFinite(alpha)).toBe(true);

    // The composite is only about the right colours while the button is painted from these two
    // tokens, so the model is pinned beside the number it depends on.
    expectDecl(".policyPrimary", "background", "var(--ink)");
    expectDecl(".policyPrimary", "color", "var(--bg)");

    // `opacity` composites the whole button — face and label together — over the footer's ground,
    // which is `--shell` (`.policyFoot`). `tests/support/contrast.ts` takes `#RRGGBB` only, so the
    // flattening happens here and only the flattened pair reaches the helper.
    expectDecl(".policyFoot", "background", "var(--shell)");

    const measured: Array<[string, number]> = [];
    for (const [mode, blockSelector] of [
      ["Terracotta", ":root"],
      ["Chamber", 'html[data-mode="chamber"]']
    ] as const) {
      const ground = tokenValue(blockSelector, "--shell");
      const face = tokenValue(blockSelector, "--ink");
      const label = tokenValue(blockSelector, "--bg");

      const ratio = contrastRatio(
        composite(label, ground, alpha),
        composite(face, ground, alpha)
      );
      measured.push([mode, ratio]);
    }

    expect(
      measured
        .filter(([, ratio]) => ratio < 4.5)
        .map(([mode, ratio]) => `${mode} ${ratio.toFixed(2)}`)
    ).toEqual([]);
  });

  it("S02-S65 · no auth-shell ancestor becomes the containing block for the fixed scrim", () => {
    // The modal is rendered INLINE inside the auth card and relies on `position: fixed` escaping
    // its ancestors, so none of these seven may declare a property that makes it the containing
    // block for a fixed descendant. True today; this is what keeps it true. Substring matching
    // over-includes (`.authCardInner` also matches `.authCard`) and never under-includes, which is
    // the safe direction for a guard.
    const shellClasses = [
      ".appShell",
      ".authScreen",
      ".authCard",
      ".authCardInner",
      ".authPanel",
      ".authPanelCore",
      ".authForm"
    ];
    // `backdrop-filter` is the sixth member of the same class and is banned with the five the plan
    // names: a non-`none` `backdrop-filter` establishes a containing block for fixed descendants
    // exactly as `transform` and `filter` do. Measured before adding it — no rule matching any of
    // the seven selectors declares it today, so the guard is GREEN at base with the wider set.
    const banned = [
      "transform",
      "filter",
      "perspective",
      "will-change",
      "contain",
      "backdrop-filter",
      "-webkit-backdrop-filter"
    ];

    // Satisfiability first: a guard whose scan matches nothing passes for the wrong reason.
    const matched = new Map<string, number>(
      shellClasses.map((name) => [
        name,
        allRules.filter((rule) => rule.selector.includes(name)).length
      ])
    );
    expect([...matched].filter(([, count]) => count === 0)).toEqual([]);

    const offenders = allRules
      .filter((rule) => shellClasses.some((name) => rule.selector.includes(name)))
      .flatMap((rule) =>
        declarations(rule.body)
          .filter((decl) => banned.includes(decl.prop))
          .map((decl) => `${rule.selector} { ${decl.prop}: ${decl.value} }`)
      );
    expect(offenders).toEqual([]);
  });

  it("S02-S65b · `.policyGateHint` is clipped, never `display: none` or `visibility: hidden`", () => {
    // The orchestrator's 2026-09-07 ruling on CODE-REV-S02-C5C6 r1 N3. The hint is the
    // `aria-describedby` target of the disabled `I have read it`, and both of those two
    // declarations would remove it from the accessibility tree and take R15's description with
    // it. The remedy is the repo's own `.srOnly` treatment, asserted here declaration for
    // declaration against `globals.css:684-694` rather than by name, so a future edit to either
    // copy is caught.
    const hint = declsOf(".policyGateHint");
    const srOnly = new Map<string, string>();
    for (const decl of declarations(
      allRules.find((rule) => rule.selector === ".srOnly" && rule.at === null)!.body
    )) {
      srOnly.set(decl.prop, decl.value);
    }
    // Compared as a SET, sorted by property: none of these nine declarations interacts with
    // another, so a different order is the same treatment and must not be called a defect.
    const sorted = (map: Map<string, string>): string[] =>
      [...map].map(([prop, value]) => `${prop}: ${value}`).sort();
    expect(srOnly.size).toBeGreaterThan(0);
    expect(sorted(hint)).toEqual(sorted(srOnly));

    expect(hint.get("display")).toBeUndefined();
    expect(hint.get("visibility")).toBeUndefined();
  });
});
