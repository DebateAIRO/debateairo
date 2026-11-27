### Task T10: Tokens and vote styles

The two colour tokens of the vote box, in both modes, and the box's styles (design §4, §7.4, owner's decision 3).
This task writes CSS and two tests. It renders nothing: T11 builds the button and T12 wraps the rows. It is the
only task of the slice that edits `apps/ui/app/globals.css`.

Every command below is run from the code root with this prefix (written out in each run step):
`cd /Users/vladmihaimiron/Documents/DebateAIRO/.claude/worktrees/public-debate-upvotes/dialectical-engine && PATH=/opt/homebrew/bin:$PATH DEVELOPER_DIR=/Library/Developer/CommandLineTools`

Depends on: nothing of this slice. May run alongside T01, T03, T04, T09 (no shared file). If another task shares
your working tree, run your typecheck and commit steps while no other task is in the middle of an edit, and read
every `git status`, `git diff --stat` and typecheck expectation below as "nothing else of yours".

**Files:**
- Create: `tests/render/library-vote-css.test.ts`
- Modify: `apps/ui/app/globals.css` — after `:60` (light tokens, inside `:root` `7-130`), after `:178` (chamber
  tokens, inside the block `132-205`), between `:8078` and `:8080` (the rules), after `:8141` (two lines inside the
  library's 720px block `8137-8142`). Line numbers are the untouched tree's; each insertion moves the later ones, so
  find every place by its anchor text, given in the step.
- Modify: `tests/unit/t9-mode-tokens.test.ts` — after `:175` (`TERRACOTTA`, `50-185`) and after `:312` (`CHAMBER`,
  `187-322`)
- Test: `tests/render/library-vote-css.test.ts`, `tests/unit/t9-mode-tokens.test.ts`

**Interfaces:**
- Consumes: nothing from another task of this slice. Existing tokens only: `--ink`, `--core`, `--agree`,
  `--agree-bg`, `--focus`, `--muted`, `--link`, `--bg`.
- Produces, for T11 (the button) and T12 (the row wiring):
  - Tokens, hex in upper case: `--vote` is `#4FA26B` in both modes; `--on-vote` is `#121826` in light and `#0E131D`
    in chamber.
  - Class names, and the markup they are written for:

    ```
    div.libVoteRow
    ├─ button.libVote[aria-pressed="true|false"]  >  svg.libVoteArrow  +  span.libVoteCount
    ├─ a.libRow > div.libRowCore …               (the unchanged row link, the wrapper's direct child)
    └─ p.libVoteNote  [> a]                      (only when there is a line to show)
    ```

  - The arrow takes `fill` and `stroke` from `.libVoteArrow`. The `<path>` inside the `<svg>` must carry no `fill`
    and no `stroke` attribute (an attribute on the path would beat the value it inherits). `viewBox="0 0 24 24"`.
  - The number takes the button's `color`. `.libVoteCount` sets no colour, so `aria-pressed="true"` alone turns the
    arrow and the number to `--on-vote`.
  - This exact line of `globals.css`, which T12's source test asserts:
    `.libVoteRow > .libRow:hover { transform: none; }`
  - No class is added to, and no rule is changed for, `.libRow`, `.libRowCore` or `.libRowBody`. A row outside a
    `.libVoteRow` looks exactly as today.

**Before you start:**

Read these as templates.
- `apps/ui/app/globals.css:7964-7975` — the current tab's rule: a state that differs by more than colour, and why
  `background-color` is a longhand (the test DOM drops a shorthand that holds `var()`).
- `apps/ui/app/globals.css:1834` — a button that draws its own ring: `outline: 2px solid var(--focus);
  outline-offset: 2px;`. The global ring (`:1946-1956`) does not cover a bare `<button>`.
- `apps/ui/app/globals.css:7510-7513` — a scoped reduced-motion block. There is no global reset.
- `tests/render/kbd-r4-e-css.ts:8-45` (`cssRules`, `rulesFor`, `stylesheet`, `rawStylesheet`) and
  `tests/render/kbd-r4-e-help-topics-ring.test.ts:9-20` — how a test reads one rule, also inside an at-rule.
- `tests/support/tokenContract.ts:34-56` (`styledDocument`, `tokenValue`) and `tests/support/contrast.ts:14-18`
  (`contrastRatio`, which throws on anything but `#RRGGBB`).

Traps.
- Colour literals. Outside the two token blocks no line of `globals.css` may hold `#hex`, `rgb(`, `rgba(` or
  `oklch(`, comments included (`tests/unit/t9-mode-tokens.test.ts:698-718`). `#4FA26B` appears on the two token
  lines and nowhere else. Write no hex value in a comment beside the rules; the comments given in Step 7 hold none.
- Token inventory. The names in `:root` must equal `TERRACOTTA` plus `MODE_INDEPENDENT`, the chamber block must
  equal `CHAMBER`, each value exactly as written (`t9-mode-tokens.test.ts:462-489`). The name reader
  (`tests/support/tokenContract.ts:29-31`) scans the whole block, comments too, for `--name:`. A comment inside a
  token block that spells a token name followed by a colon counts as a second declaration and fails
  "no duplicate :root declarations". Use the two comments given in Step 5 as they are.
- Do not add the new tokens to `TEXT_TOKENS`, `LINE_TOKENS` or `SURFACE_TOKENS` (`t9-mode-tokens.test.ts:373-389`);
  that test counts exactly 34 rows (`:531`).
- The row's source pin (`apps/ui/components/debateReferenceDesign.source-test.mjs:25-28`) reads the FIRST text
  `.libRow {` in the file and refuses `background`, `border:` or `padding` in it, and needs
  `.libRow:hover { transform: translateX(4px);`. Do not edit `globals.css:7986-8004`. Write no selector that ends
  in `.libRow {`.
- Forced colours. `globals.css` holds exactly one rule under `@media (forced-colors: active)` (`:1575`;
  `tests/render/kbd-r4-e-forced-colors.test.ts:33-39`). Add none and add no selector to it. The same file refuses
  `outline: none` / `outline: 0` on an unknown selector (`:45-66`).
- Place. The file must end with `/* === end consent-ui S02 === */` (`:11750`;
  `tests/unit/consent-s02-style-contract.test.ts:249`). Never append at the end, and stay out of the delimited
  blocks (`7439-7508`, `10928-11271`, `11273-11750`). `tests/render/synthesis-flag-card.test.tsx:95-97` reads the
  text from `.libRow[data-flagged="true"] .libRowCore` (`:8087`) on: the new rules go above it, before `.libEmpty`.
- The 720px block that matters is the library's (`:8137-8142`, the one that starts with `.libScreen`). There are
  other blocks with the same head (`:7515`, `:10860`).
- Keep each of the eighteen rules whole and single: the test asks for exactly one rule per selector.
- The new test file is `.ts`, flat in `tests/render/`: the root `tsc` covers it (`tsconfig.json:26-33`), relative
  imports end in `.js`.
- The two phone values (`84px`, `14px`) and `top: 15px` are the ones measured in a browser prototype at 375px and
  1000px, left-to-right and right-to-left. Do not "correct" 84 to 82.
- The pull request's `limits-check` job reads every added line (`tools/limits-check.mjs:2-20`). The list it uses
  is not on this machine. If the job refuses a line, stop and report; never add the mark `limits-check-ok`.

- [ ] **Step 1: Write the failing stylesheet test**

Create `tests/render/library-vote-css.test.ts` with exactly this content.

```ts
import { describe, expect, it } from "vitest";
import { contrastRatio } from "../support/contrast.js";
import { styledDocument, tokenValue } from "../support/tokenContract.js";
import { cssRules, rawStylesheet, rulesFor, stylesheet, type CssRule } from "./kbd-r4-e-css.js";

/*
 * Public debate upvotes (design 2026-11-26, section 4 and decision 3): the vote box's rules and its two colour tokens.
 * jsdom does no layout and no cascade, so this reads the rules themselves and measures the token pairs; how the box
 * looks is the owner's (the approved mock-up).
 */
const raw = rawStylesheet("globals.css");
const globals = stylesheet("globals.css");
const rules = cssRules(globals);

/** The one rule that names exactly this selector: top-level, or inside an at-rule whose head contains `at`. */
function one(selector: string, at?: string): CssRule {
  const found = rulesFor(globals, selector, at);
  expect(found, `${selector}${at === undefined ? "" : ` inside ${at}`}: exactly one rule`).toHaveLength(1);
  return found[0]!;
}

/** That rule's declarations, as a property-to-value map. */
function declared(selector: string, at?: string): Readonly<Record<string, string>> {
  return Object.fromEntries(one(selector, at).body.split(";")
    .map((line) => line.trim()).filter((line) => line.length > 0)
    .map((line) => [line.slice(0, line.indexOf(":")).trim(), line.slice(line.indexOf(":") + 1).trim()]));
}

const voteRules = rules.filter((rule) => rule.selectors.some((selector) => selector.includes("libVote")));
const MODES = ["terracotta", "chamber"] as const;

describe("the vote box's tokens", () => {
  it("one green in both modes, and the ink that is drawn on it", () => {
    const { window } = styledDocument();
    expect(tokenValue(window, "--vote", "terracotta")).toBe("#4FA26B");
    expect(tokenValue(window, "--on-vote", "terracotta")).toBe("#121826");
    expect(tokenValue(window, "--vote", "chamber")).toBe("#4FA26B");
    expect(tokenValue(window, "--on-vote", "chamber")).toBe("#0E131D");
  });

  // [what, foreground token, background token, floor]: 3 for a graphic or an edge, 4.5 for the number and the lines.
  const PAIRS = [
    ["the box's edge on the card", "--ink", "--core", 3],
    ["the arrow's fill on the box", "--vote", "--core", 3],
    ["the arrow's outline on the box", "--agree", "--core", 3],
    ["the arrow's outline on the hover tint", "--agree", "--agree-bg", 3],
    ["the number on the box", "--ink", "--core", 4.5],
    ["the number on the hover tint", "--ink", "--agree-bg", 4.5],
    ["upvoted: the fill against the card", "--vote", "--core", 3],
    ["upvoted: the edge against the card", "--agree", "--core", 3],
    ["upvoted: the arrow on the fill", "--on-vote", "--vote", 3],
    ["upvoted: the number on the fill", "--on-vote", "--vote", 4.5],
    ["the focus ring on the card", "--focus", "--core", 3],
    ["the status line on the page", "--muted", "--bg", 4.5],
    ["the status line's link on the page", "--link", "--bg", 4.5]
  ] as const;

  it.each(MODES)("every pair clears its floor in %s", (mode) => {
    const { window } = styledDocument();
    for (const [what, foreground, background, floor] of PAIRS) {
      const ratio = contrastRatio(tokenValue(window, foreground, mode), tokenValue(window, background, mode));
      const label = `${mode}: ${what} (${foreground} on ${background}) = ${ratio.toFixed(2)}`;
      expect(ratio, label).toBeGreaterThanOrEqual(floor);
    }
  });

  it("the mode's own ink would not do on the green in chamber, which is why --on-vote exists", () => {
    const { window } = styledDocument();
    const pair = (mode: (typeof MODES)[number], a: `--${string}`, b: `--${string}`): number =>
      contrastRatio(tokenValue(window, a, mode), tokenValue(window, b, mode));
    expect(pair("chamber", "--ink", "--vote")).toBeLessThan(4.5);
    // and on the light hover tint the green fill alone is under 3:1, which is why the arrow keeps its outline
    expect(pair("terracotta", "--vote", "--agree-bg")).toBeLessThan(3);
  });
});

describe("the vote box's rules", () => {
  it("the box: 54 x 58 at the card's start edge, ink edge, the card's fill", () => {
    expect(declared(".libVote")).toMatchObject({
      position: "absolute",
      "z-index": "1",
      "inset-inline-start": "18px",
      top: "15px",
      width: "54px",
      height: "58px",
      margin: "0",
      padding: "0",
      "border-width": "1.5px",
      "border-style": "solid",
      "border-color": "var(--ink)",
      "border-radius": "11px",
      "background-color": "var(--core)",
      color: "var(--ink)"
    });
    // longhands only (the test DOM drops a shorthand that holds var()), and logical sides only (Arabic, Hebrew)
    for (const property of ["border", "background", "left", "right", "inset-inline-end"]) {
      expect(declared(".libVote"), property).not.toHaveProperty(property);
    }
  });

  it("the arrow and the number", () => {
    expect(declared(".libVoteArrow")).toMatchObject({
      width: "24px", height: "24px", fill: "var(--vote)", stroke: "var(--agree)", "stroke-width": "1.5"
    });
    expect(declared(".libVoteCount")).toEqual({ "font-size": "14.5px", "font-weight": "700" });
  });

  it("hover: the pale green tint, and the arrow lifts 2px", () => {
    expect(declared(".libVote:hover")).toEqual({ "background-color": "var(--agree-bg)" });
    expect(declared(".libVote:hover .libVoteArrow")).toEqual({ transform: "translateY(-2px)" });
  });

  it("upvoted: green fill, a 3px edge in the site's green, arrow and number in --on-vote", () => {
    expect(declared('.libVote[aria-pressed="true"]')).toEqual({
      "border-width": "3px",
      "border-color": "var(--agree)",
      "background-color": "var(--vote)",
      color: "var(--on-vote)"
    });
    expect(declared('.libVote[aria-pressed="true"] .libVoteArrow')).toEqual({
      fill: "var(--on-vote)", stroke: "var(--on-vote)"
    });
    // the number takes the button's colour, so it must set none of its own
    expect(declared(".libVoteCount")).not.toHaveProperty("color");
    // same weight of selector as the hover rule: it must come later, or an upvoted box loses its fill under the pointer
    expect(one('.libVote[aria-pressed="true"]').index).toBeGreaterThan(one(".libVote:hover").index);
  });

  it("keyboard focus: the site's 2px ring, never taken away", () => {
    expect(declared(".libVote:focus-visible")).toEqual({ outline: "2px solid var(--focus)", "outline-offset": "2px" });
    for (const rule of voteRules) {
      expect(rule.body, rule.selectors.join(", ")).not.toMatch(/(?:^|;)\s*outline\s*:\s*(?:none|0)\b/);
    }
  });

  it("the row: the wrapper slides, the link inside it stands still, the card keeps room for the box", () => {
    expect(declared(".libVoteRow")).toEqual({
      position: "relative", transition: "transform 0.4s cubic-bezier(0.34, 1.56, 0.64, 1)"
    });
    expect(declared(".libVoteRow:hover")).toEqual({ transform: "translateX(4px)" });
    expect(declared(".libVoteRow .libRowCore")).toEqual({ "min-height": "88px", "padding-inline-start": "88px" });
    // this exact text is what the row's source test reads once the rows are wired
    expect(raw).toContain(".libVoteRow > .libRow:hover { transform: none; }");
    // private rows keep their own slide
    expect(declared(".libRow:hover")).toEqual({ transform: "translateX(4px)" });
  });

  it("the status line under the card", () => {
    expect(declared(".libVoteNote")).toEqual({
      margin: "6px 0 0", "padding-inline-start": "18px", "font-size": "11px", color: "var(--muted)"
    });
    expect(declared(".libVoteNote a")).toEqual({ color: "var(--link)", "text-decoration": "underline" });
  });

  it("less motion: no slide and no lift on these rows", () => {
    const at = "prefers-reduced-motion: reduce";
    expect(declared(".libVoteRow", at)).toEqual({ transition: "none" });
    expect(declared(".libVoteArrow", at)).toEqual({ transition: "none" });
    expect(declared(".libVoteRow:hover", at)).toEqual({ transform: "none" });
    expect(declared(".libVote:hover .libVoteArrow", at)).toEqual({ transform: "none" });
  });

  it("narrow screens: the library's own 720px block keeps its rules and gains two", () => {
    const start = raw.indexOf("@media (max-width: 720px) {\n  .libScreen");
    expect(start).toBeGreaterThan(-1);
    expect(raw.slice(start, raw.indexOf("\n}", start)).split("\n").slice(1).map((line) => line.trim())).toEqual([
      ".libScreen { padding: 28px 20px 36px; }",
      ".libTitle { font-size: 28px; }",
      ".libRowCore { flex-wrap: wrap; gap: 10px; }",
      ".libRowBody { flex: 1 1 100%; }",
      ".libVoteRow .libRowCore { padding-inline-start: 84px; }",
      ".libVote { top: 14px; }"
    ]);
    expect(declared(".libVoteRow .libRowCore", "max-width: 720px")).toEqual({ "padding-inline-start": "84px" });
    expect(declared(".libVote", "max-width: 720px")).toEqual({ top: "14px" });
  });

  it("eighteen rules, all in the library section, with no colour literal and no forced-colours rule", () => {
    expect(voteRules).toHaveLength(18);
    const arrowAt = one(".libArrow").index;
    const emptyAt = one(".libEmpty").index;
    for (const rule of voteRules) {
      const where = rule.selectors.join(", ");
      expect(rule.body, where).not.toMatch(/oklch\(|#[0-9a-f]{3,8}\b|\brgba?\(/i);
      expect(rule.at.join(" "), where).not.toContain("forced-colors");
      if (rule.at.some((head) => head.includes("max-width: 720px"))) continue;
      expect(rule.index, where).toBeGreaterThan(arrowAt);
      expect(rule.index, where).toBeLessThan(emptyAt);
    }
  });
});
```

The measured ratios, for the reviewer (WCAG formula of `tests/support/contrast.ts`):

| pair | light | chamber |
|---|---|---|
| box edge `--ink` on `--core` | 17.73 | 14.87 |
| arrow fill `--vote` on `--core` (also: the upvoted fill against the card) | 3.13 | 5.34 |
| arrow outline `--agree` on `--core` (also: the upvoted edge against the card) | 5.26 | 7.17 |
| arrow outline `--agree` on the hover tint `--agree-bg` | 4.61 | 6.39 |
| number `--ink` on `--core` / on `--agree-bg` | 17.73 / 15.54 | 14.87 / 13.26 |
| upvoted arrow and number `--on-vote` on `--vote` | 5.67 | 5.94 |
| ring `--focus` on `--core` | 3.44 | 7.92 |
| status line `--muted` on `--bg` / its link `--link` on `--bg` | 5.21 / 5.99 | 6.16 / 7.19 |
| not a pair, pinned as the reason: arrow fill on the light hover tint | 2.74 | 4.76 |
| not a pair, pinned as the reason: the mode's ink on the green | 5.67 | 2.78 |

- [ ] **Step 2: Run it and see it fail**

Run: `cd /Users/vladmihaimiron/Documents/DebateAIRO/.claude/worktrees/public-debate-upvotes/dialectical-engine && PATH=/opt/homebrew/bin:$PATH DEVELOPER_DIR=/Library/Developer/CommandLineTools pnpm exec vitest run tests/render/library-vote-css.test.ts`

Expected: `Tests  14 failed (14)`. The token cases read `expected '' to be '#4FA26B'` and
`TypeError: Expected an #RRGGBB colour, received`; the rule cases read `.libVote: exactly one rule: expected [] to
have a length of 1`.

- [ ] **Step 3: Add the two tokens to the token test's maps**

In `tests/unit/t9-mode-tokens.test.ts`:

1. In `TERRACOTTA`, directly after the line `  "--cta-shadow": "#121826",` (`:175`):

```ts
  "--vote": "#4FA26B",
  "--on-vote": "#121826",
```

2. In `CHAMBER`, directly after the line `  "--cta-shadow": "#8C4510",` (`:312` before the first edit):

```ts
  "--vote": "#4FA26B",
  "--on-vote": "#0E131D",
```

Nothing else in that file changes.

- [ ] **Step 4: Run it and see it fail**

Run: `cd /Users/vladmihaimiron/Documents/DebateAIRO/.claude/worktrees/public-debate-upvotes/dialectical-engine && PATH=/opt/homebrew/bin:$PATH DEVELOPER_DIR=/Library/Developer/CommandLineTools pnpm exec vitest run tests/unit/t9-mode-tokens.test.ts`

Expected: `Tests  1 failed | 8 passed (9)`. The failing case is "declares the complete inventory and the same
mode-bearing key set in both modes": `:root inventory names: expected [ '--accent', '--accent-bg', …(178) ] to
deeply equal [ '--accent', '--accent-bg', …(180) ]`.

- [ ] **Step 5: Declare the tokens in both modes** (`apps/ui/app/globals.css`)

1. In `:root`, directly after the line that starts `  --cta: #FF8A2A; --on-cta: #121826;` (`:60`) and before
   `  --hard: #121826; --hard-shadow: #121826;`:

```css
  /* public debate upvotes (design 2026-11-26): the arrow's green, which is also the upvoted box's fill, and the ink
     drawn on that fill */
  --vote: #4FA26B; --on-vote: #121826;
```

2. In `html[data-mode="chamber"]`, directly after the line that starts `  --cta: #FF9A45; --on-cta: #0E131D;`
   (`:178` before the first edit) and before `  --hard: #C9D3E3; --hard-shadow: #2E3A50;`:

```css
  /* public debate upvotes: the same green; what is drawn on it is the dark page colour, because this mode's ink on
     that green is only 2.78:1 */
  --vote: #4FA26B; --on-vote: #0E131D;
```

- [ ] **Step 6: Run both tests**

Run: `cd /Users/vladmihaimiron/Documents/DebateAIRO/.claude/worktrees/public-debate-upvotes/dialectical-engine && PATH=/opt/homebrew/bin:$PATH DEVELOPER_DIR=/Library/Developer/CommandLineTools pnpm exec vitest run tests/unit/t9-mode-tokens.test.ts`
Expected: `Tests  9 passed (9)`.

Run: `cd /Users/vladmihaimiron/Documents/DebateAIRO/.claude/worktrees/public-debate-upvotes/dialectical-engine && PATH=/opt/homebrew/bin:$PATH DEVELOPER_DIR=/Library/Developer/CommandLineTools pnpm exec vitest run tests/render/library-vote-css.test.ts`
Expected: `Tests  10 failed | 4 passed (14)`. The four of "the vote box's tokens" pass; the ten of "the vote box's
rules" still fail.

- [ ] **Step 7: Add the vote rules** (`apps/ui/app/globals.css`)

Directly after the line `.libArrow { flex: 0 0 auto; color: var(--muted); }` (`:8078` in the untouched tree), and
before the blank line that precedes `.libEmpty {`, insert exactly this (it starts with one blank line). This is
the approved look as CSS; change no value.

```css

/* Public debate upvotes (design 2026-11-26, section 4). A public row that carries a count is wrapped in .libVoteRow.
   The vote button is the link's sibling, never its child (a button may not sit inside an anchor), and is laid over
   the room the card keeps free at its start edge. The wrapper carries the row's slide, so box and card move as one,
   and the link inside it stands still. Every colour is a token, so both modes follow with nothing more. */
.libVoteRow {
  position: relative;
  transition: transform 0.4s cubic-bezier(0.34, 1.56, 0.64, 1);
}
.libVoteRow:hover { transform: translateX(4px); }
.libVoteRow > .libRow:hover { transform: none; }
/* 88px of room: the card's 18px padding, the 54px box, the row's 16px gap. 88px of height: 15, the box's 58, 15. */
.libVoteRow .libRowCore { min-height: 88px; padding-inline-start: 88px; }
/* top is a fixed 15px, not a centring sum, so the box does not move when the status line appears under the card.
   z-index keeps the box above the card whatever the link is given later (a transformed sibling paints over it).
   Border and fill are longhands: the test DOM (jsdom) drops a shorthand that holds var(). */
.libVote {
  position: absolute;
  z-index: 1;
  inset-inline-start: 18px;
  top: 15px;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 2px;
  width: 54px;
  height: 58px;
  margin: 0;
  padding: 0;
  border-width: 1.5px;
  border-style: solid;
  border-color: var(--ink);
  border-radius: 11px;
  background-color: var(--core);
  color: var(--ink);
  line-height: 1;
  cursor: pointer;
}
/* The outline is not decoration: on the light hover tint the green fill alone is under 3:1. */
.libVoteArrow {
  width: 24px;
  height: 24px;
  fill: var(--vote);
  stroke: var(--agree);
  stroke-width: 1.5;
  stroke-linejoin: round;
  transition: transform 0.2s ease;
}
/* The number takes the button's colour (ink, or the ink for the green fill once upvoted), so it sets none here. */
.libVoteCount { font-size: 14.5px; font-weight: 700; }
.libVote:hover { background-color: var(--agree-bg); }
.libVote:hover .libVoteArrow { transform: translateY(-2px); }
/* Upvoted. After the hover rule, so an upvoted box keeps its fill under the pointer. The 3px border is the mark
   other than colour (the PDA-S03 rule above, and the one mark left in forced colours); the box stays 54 by 58. */
.libVote[aria-pressed="true"] {
  border-width: 3px;
  border-color: var(--agree);
  background-color: var(--vote);
  color: var(--on-vote);
}
.libVote[aria-pressed="true"] .libVoteArrow { fill: var(--on-vote); stroke: var(--on-vote); }
.libVote:focus-visible { outline: 2px solid var(--focus); outline-offset: 2px; }
/* The one line under the card: "Sign in to upvote" with its link, or the failure line. */
.libVoteNote { margin: 6px 0 0; padding-inline-start: 18px; font-size: 11px; color: var(--muted); }
.libVoteNote a { color: var(--link); text-decoration: underline; }
@media (prefers-reduced-motion: reduce) {
  .libVoteRow, .libVoteArrow { transition: none; }
  .libVoteRow:hover, .libVote:hover .libVoteArrow { transform: none; }
}
```

What each value is, so a reviewer can check it against the design: box 54 by 58, 1.5px ink border, 11px radius,
the card's fill; arrow 24px, fill `--vote`, outline `--agree`; number 14.5px, weight 700, ink; hover `--agree-bg`
and a 2px lift; upvoted fill `--vote`, border `--agree` at 3px, arrow and number `--on-vote`; ring 2px `--focus`.
Dark mode needs no rule of its own: every colour above is a token with a chamber value (border and number
`#EEF2F8`, fill `#171E2B`, arrow `#4FA26B` with outline `#86B58D`, hover `#1E2A22`; upvoted: fill `#4FA26B`,
border `#86B58D`, arrow and number `#0E131D`).

- [ ] **Step 8: Run it**

Run: `cd /Users/vladmihaimiron/Documents/DebateAIRO/.claude/worktrees/public-debate-upvotes/dialectical-engine && PATH=/opt/homebrew/bin:$PATH DEVELOPER_DIR=/Library/Developer/CommandLineTools pnpm exec vitest run tests/render/library-vote-css.test.ts`

Expected: `Tests  2 failed | 12 passed (14)`. The two left are "narrow screens: …"
(`expected [ …(4) ] to deeply equal [ …(6) ]`) and "eighteen rules, …" (`to have a length of 18 but got 16`).

- [ ] **Step 9: Add the two phone rules to the library's 720px block** (`apps/ui/app/globals.css`)

Inside the `@media (max-width: 720px)` block that starts with `.libScreen { padding: 28px 20px 36px; }`
(`:8137-8142` in the untouched tree), directly after `  .libRowBody { flex: 1 1 100%; }` and before the closing
brace:

```css
  .libVoteRow .libRowCore { padding-inline-start: 84px; }
  .libVote { top: 14px; }
```

The four lines already in the block stay as they are.

- [ ] **Step 10: Run it and see it pass**

Run: `cd /Users/vladmihaimiron/Documents/DebateAIRO/.claude/worktrees/public-debate-upvotes/dialectical-engine && PATH=/opt/homebrew/bin:$PATH DEVELOPER_DIR=/Library/Developer/CommandLineTools pnpm exec vitest run tests/render/library-vote-css.test.ts`

Expected: `Tests  14 passed (14)`.

- [ ] **Step 11: Verify**

Each command with the prefix
`cd /Users/vladmihaimiron/Documents/DebateAIRO/.claude/worktrees/public-debate-upvotes/dialectical-engine && PATH=/opt/homebrew/bin:$PATH DEVELOPER_DIR=/Library/Developer/CommandLineTools`.
If a render test fails with `Failed to resolve import "@debateai/contract"`, run `pnpm run generate:contract` once
(it writes only the ignored folder `packages/contract/generated/`) and run the test again.

| Command | Expected |
|---|---|
| `pnpm exec vitest run tests/render/library-vote-css.test.ts` | `Tests  14 passed (14)` |
| `pnpm exec vitest run tests/unit/t9-mode-tokens.test.ts` | `Tests  9 passed (9)` (red here: a token name or value, or a colour literal in a rule or a comment) |
| `pnpm exec vitest run tests/unit/consent-s02-style-contract.test.ts` | `Tests  10 passed (10)`, file unedited (red: something was appended at the end of the file) |
| `pnpm exec vitest run tests/render/kbd-r4-e-forced-colors.test.ts` | `Tests  16 passed (16)`, file unedited |
| `pnpm exec vitest run tests/render/kbd-focus-rings.test.ts` | `Tests  3 passed (3)`, file unedited |
| `pnpm exec vitest run tests/render/synthesis-flag-card.test.tsx` | `Tests  7 passed (7)`, file unedited |
| `pnpm exec vitest run tests/render/kbd-r3-k1b-title-facts.test.tsx` | `Tests  13 passed (13)`, file unedited |
| `pnpm exec vitest run tests/render/t3-library.test.tsx` | `Tests  15 passed (15)`, file unedited (it loads the whole stylesheet into its test page) |
| `pnpm exec vitest run tests/unit/pda-s03-keyboard-accessibility.test.ts` | `Tests  5 passed (5)`, file unedited |
| `pnpm exec vitest run tests/unit/tier01-style-contract.test.ts` | `Tests  8 passed (8)`, file unedited |
| `pnpm run typecheck` | exit 0 (no `error TS` line; it covers the new `.ts` test) |
| `git diff --stat` | two files: `apps/ui/app/globals.css` with 78 insertions and no deletion, `tests/unit/t9-mode-tokens.test.ts` with 4 insertions and no deletion |
| `git status --short` | those two as ` M`, `?? tests/render/library-vote-css.test.ts`, and nothing else of yours (the `??` lines under `docs/superpowers/` were there before and are not staged) |

The row's source pin runs with `apps/ui` as its working directory, so it takes the form T09 and T12 use:

`cd /Users/vladmihaimiron/Documents/DebateAIRO/.claude/worktrees/public-debate-upvotes/dialectical-engine && PATH=/opt/homebrew/bin:$PATH DEVELOPER_DIR=/Library/Developer/CommandLineTools pnpm --filter dialectical-engine-v2ui exec node --import tsx --test --test-concurrency=1 components/debateReferenceDesign.source-test.mjs`

Expected: `pass 1`, `fail 0`, file unedited (T12 edits that file, not this task).

No browser check belongs to this task: nothing renders these classes until T11 and T12. This task's tests read
CSS text (jsdom does no layout), so they prove the values, not the look. The look in a browser, in both modes,
right-to-left, at 1000px and 375px, with keyboard focus and with reduced motion, is task T17 (build and
look), against design section 4, with screenshots for the owner.

- [ ] **Step 12: Stage the three paths and run the limits check on them**

```bash
cd /Users/vladmihaimiron/Documents/DebateAIRO/.claude/worktrees/public-debate-upvotes/dialectical-engine && PATH=/opt/homebrew/bin:$PATH DEVELOPER_DIR=/Library/Developer/CommandLineTools git add apps/ui/app/globals.css tests/unit/t9-mode-tokens.test.ts tests/render/library-vote-css.test.ts
cd /Users/vladmihaimiron/Documents/DebateAIRO/.claude/worktrees/public-debate-upvotes/dialectical-engine && PATH=/opt/homebrew/bin:$PATH DEVELOPER_DIR=/Library/Developer/CommandLineTools node tools/limits-check.mjs --staged
```

Never `git add -A` or `git add .`: the tree holds untracked plan and design files that are not this task's.
Expected from the check: a `LIMITS_CHECK_NO_LIST: …` note, then `LIMITS_CHECK_OK <n> added line(s) read.`, exit 0.

- [ ] **Step 13: Commit**

```bash
cd /Users/vladmihaimiron/Documents/DebateAIRO/.claude/worktrees/public-debate-upvotes/dialectical-engine && PATH=/opt/homebrew/bin:$PATH DEVELOPER_DIR=/Library/Developer/CommandLineTools git commit -m "The vote box of a public debate's row has its colours and its styles in both modes, and an upvoted box is marked by a thicker border as well as by its colour." -m "Two colour tokens, --vote and --on-vote, in the light and the chamber block and in the token test's two maps. The rules sit in the library section of globals.css: the wrapper that carries the row's slide, the box, the arrow, the number, hover, the upvoted state, the focus ring, the line under the card, a reduced-motion block, and two lines in the library's phone block. Nothing renders these classes yet: the button and the row wiring are their own tasks, so no page changes with this commit. Tests: tests/render/library-vote-css.test.ts (the rules, and the contrast of every colour pair in both modes); tests/unit/t9-mode-tokens.test.ts lists the two tokens." -m "Co-Authored-By: Claude Fable 5.2 <noreply@anthropic.com>"
```

The commit goes to the branch `feat/2026-11-26-public-debate-upvotes` in this worktree; nothing is pushed. The
last `-m` is the attribution line; if your session's instructions give another one, use theirs.
