# ADR-006 — Token, mode and contrast claims are checked in jsdom against the real stylesheet

**Status:** ACCEPTED (ARCH-01, 2026-08-31) · mission-local
**Slices affected:** all eight

## The capability, measured rather than assumed

Probed 2026-08-31 against this repo's installed jsdom:

| Probe | Result |
|---|---|
| `getComputedStyle(body).background` where `background: var(--pg)` | `"var(--pg)"` — **jsdom does NOT resolve `var()`** |
| `getComputedStyle(body).backgroundColor` (same) | `"rgba(0, 0, 0, 0)"` — resolves to transparent, i.e. useless |
| `getComputedStyle(documentElement).getPropertyValue("--pg")` | `"#F9F6F1"` — **the declared custom property IS readable** |
| Set `documentElement.setAttribute("data-mode","chamber")`, re-read `--pg` | `"#14110E"` — **attribute-selector cascade IS honoured, live** |
| `getComputedStyle(el).fontFamily` where the value is literal | `"Fraunces, serif"` — resolves |

The consequence decides the whole verification design:

- **Do not** write acceptances of the form "assert the computed background
  colour of the landing hero is `#F9F6F1`". In jsdom that assertion can only
  pass by accident, and it will be written, it will go green on a `var()`
  string, and it will discriminate nothing.
- **Do** write acceptances of the form "assert
  `getPropertyValue('--bg')` on the document element equals the inventory value,
  in each mode". That is a real read of the real stylesheet.

## The proven in-repo pattern

`tests/unit/pda-s03-keyboard-accessibility.test.ts` already does exactly this:
it `readFileSync`s `apps/ui/app/globals.css` (line 36), injects the text into a
jsdom `<style>` (line 80), and reads `getComputedStyle`. The pattern is not
speculative — it ships and it passes today. New token tests lift it verbatim.
This is also the reason ADR-001 keeps the tokens inside `globals.css`: jsdom
does not follow `@import`, so a second file would be invisible to this pattern.

## The shared helper every slice reuses

**Create:** `tests/support/tokenContract.ts`

```ts
/** Loads apps/ui/app/globals.css into a fresh jsdom document. */
export function styledDocument(): { window: Window; document: Document };

/** Reads a declared custom property off <html> for the given mode. */
export function tokenValue(
  win: Window,
  name: `--${string}`,
  mode?: "terracotta" | "chamber"
): string;

/** Every token name declared in the :root block, in source order. */
export function declaredTokenNames(): readonly string[];

/** Token names declared in the html[data-mode="chamber"] block. */
export function chamberTokenNames(): readonly string[];
```

Three assertions this makes cheap, reused by every slice's mode step:

1. **Parity** — `declaredTokenNames()` and `chamberTokenNames()` agree on the
   mode-bearing subset. Catches a token added to one block only, which is the
   defect that produces a single wrong colour in dark mode.
2. **Switch** — `tokenValue(win,'--bg')` !== `tokenValue(win,'--bg','chamber')`.
3. **Value** — each equals its `token-inventory.md` entry.

## Class names and data attributes are a frozen contract

The single largest cost avoider in this mission: **existing CSS class names and
`data-*` attributes in `apps/ui` are not renamed.** New ones may be added.

Because 521 `var()` sites already drive the existing classes, redefining the
token values re-skins the product without touching most markup — and because the
standing tests assert on those class names, not renaming them is what keeps 30
of the 44 test files in the KEEP column (`test-migration.md`). Concretely
protected today: `progressStrip` / `progressTrack` / `progressFillIndeterminate`
(`tests/render/load01-debate-page.test.tsx`), `modelDot`
(`tests/render/ui02d-model-identity.test.tsx`), `tabEmptyHint` and
`.sectionHead[aria-label="Debate library"]`
(`tests/unit/pda-s03-keyboard-accessibility.test.ts`), `optionsToggle`
(`tests/render/ux01-new-debate-form.test.tsx`), `publicationDetails`,
`debateTopControlRow`, `segment`, `drawer`.

A cluster that believes it must rename one has found a genuine conflict and
files it as a finding; it does not rename and repair the tests in the same
breath, because that is how an assertion gets rewritten to match the bug.

## Markers this mission ADDS

New `data-*` markers, so acceptances can name something stable rather than
matching prose. Each is written once, by the cluster named:

| Marker | On | Written by | Proves |
|---|---|---|---|
| `data-mode` | `<html>` | T9-C3 | active mode |
| `data-mode-toggle` | the toggle `<button>` | T9-C3 | the control exists |
| `data-bezel="shell"` / `="core"` | the two card wrappers | T1-C2 | double bezel |
| `data-stance="pro"\|"con"\|"reasoning"\|"root"` | the card root and its top tab | T1-C2 | stance tab |
| `data-connector-stance="pro"\|"con"` | each `<path>` in `canvasLinks` | T1-C2 | connectors carry stance |
| `data-node-review` | drawer review row | already present (`NodeDetailDrawer.tsx:408`) | review verdict / typed absence |
| `data-public-locked="true"` | public banner + each locked control | T3-C3 | actions locked |
| `data-verdict-block` / `data-strongest-case` | public 3b regions | T3-C3 | verdict-first DOM order |
| `data-v2-only="true"` | each V2 control in the options panel | T4-C3 | which fields must not be sent |

`data-stance` on the card root is what makes `T1-C2-1`'s "≥1 PRO and ≥1 CON"
assertion a query rather than a text search, and `data-connector-stance` is what
makes `T1-C2-4` ("PRO vs CON connector tokens differ") checkable in
`renderToStaticMarkup` output without a browser.
