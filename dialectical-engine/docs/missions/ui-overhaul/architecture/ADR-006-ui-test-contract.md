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

---

## Compile-gate law (added 2026-08-31, AM2/C — trigger: `t_4ccac5c4`, finding B1/N5)

### The hole

The mission's packets mandated `pnpm run typecheck` and described it as
"repo-wide". It is not. Root `tsconfig.json`:

```json
"exclude": ["node_modules", "web", "apps/ui", "packages/contract/generated"]
```

**`apps/ui` and `web` are excluded.** `pnpm run typecheck` exits 0 while every
TSX file this mission writes goes uncompiled. That is how `ADR-002`'s
`JSX.Element` contract reached a worker, was implemented faithfully, and shipped
a file that does not compile — with every named gate green.

A gate that cannot open the file it is supposed to guard is not a weak gate; it
is a **reassurance**, and it is worse than no gate because it stops anyone
looking.

### The law

1. **Every acceptance compile gate NAMES the tsconfig it compiles under.** The
   words "repo-wide", "the typecheck", or "tsc passes" are forbidden in an
   acceptance cell. `pnpm run typecheck` is a real gate for `packages/**`,
   `apps/api`, `apps/runner`, `tools/**` and `tests/**` — and for nothing under
   `apps/ui` or `web`.
2. **Every cluster that writes any file under `apps/ui/` additionally runs the
   workspace compile gate**, enforced at **0-new** against the named baseline
   below. This applies to all 32 clusters except the four pure test-migration
   clusters that write only under `tests/`.
3. **The baseline is a named, dated list of exact error lines** — never a count.
   A count silently absorbs a new error the moment an old one is fixed.

### The 0-new command (quote verbatim in packets)

```sh
pnpm exec tsc --noEmit -p apps/ui/tsconfig.json 2>&1 \
  | grep -E 'error TS' \
  | grep -v -e 'app/debate/\[id\]/DebatePageClient\.tsx(1488,11): error TS2322' \
          -e 'app/layout\.tsx(3,8): error TS2882' \
  | tee /dev/stderr \
  | wc -l          # required: 0
```

`tee /dev/stderr` is deliberate: when the gate fails, the failing lines must be
in the log, not just a number. A gate that prints only `1` sends the next seat
back to re-run it.

### The baseline — TWO pre-existing errors, not one

Measured 2026-08-31 by ARCH-01 on the tree at `55b18ee`:

| # | Error | Pre-existing? | Owner |
|---|---|---|---|
| 1 | `app/debate/[id]/DebatePageClient.tsx(1488,11): error TS2322` — `AnswerExport` union mismatch | yes — file last touched at `3705955`, long before this mission | PDA lane, ticket `t_d9066400` |
| 2 | `app/layout.tsx(3,8): error TS2882` — *Cannot find module or type declarations for side-effect import of `./globals.css`* | **yes** — `import "./globals.css"` is byte-identical at `55b18ee^`, and `web/app/layout.tsx:3` carries the same line | unowned; see below |

> **DISCREPANCY WITH THE AM2 PACKET, reported rather than papered over.**
> The packet states *"The only baselined error is
> `app/debate/[id]/DebatePageClient.tsx(1488,11) TS2322`"*, and the Wave-0
> reviewer recorded *"layout.tsx CLEAN"*. **Both are wrong on this tree.** The
> workspace typecheck emits **three** `error TS` lines, and only one of the three
> is B1. Baselining just the packet's single error would leave the gate returning
> 1 forever — an unsatisfiable acceptance, i.e. the AF-1 defect a third time, and
> the very thing this amendment exists to stop. Evidence:
>
> ```
> $ pnpm exec tsc --noEmit -p apps/ui/tsconfig.json 2>&1 | grep -c 'error TS'
> 3
> ```

**Why error 2 is structural, not environmental.** `next/types/global.d.ts` in
next 15.5.23 declares `*.module.css`, `*.module.sass` and `*.module.scss` — but
**not plain `*.css`**. A side-effect `import "./globals.css"` therefore has no
type declaration to find, in any environment, built or unbuilt.

**Its permanent fix is one file and it is NOT taken here.** A three-line
`apps/ui/types/css.d.ts` (`declare module "*.css";`) removes it for good. That is
new product code and new scope; this amendment is bounded to ARCH documents. It
is therefore **baselined and routed** — the orchestrator should ticket it, and
when it lands, the baseline drops to one line. Filing it as a baseline entry
rather than silently is the whole point: a baselined error is visible and dated;
an unbaselined one that everybody has learned to ignore is not.

### What this gate does and does not catch

**Catches:** any type error newly introduced into `apps/ui` by any cluster —
including exactly B1, which every other gate in this mission was blind to.

**Does not catch:** a runtime failure that type-checks; the `next build` step
itself (which also runs bundling and route collection); or a type error in
`web/`, which no gate in this mission opens at all. `web/` is out of contract
(`open-questions.md` Q-02) and its compile status is deliberately not this
mission's claim.
