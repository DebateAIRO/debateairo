# I11 — Locale formatting and right-to-left · SPEC

**FROZEN at creation, 2026-09-02, by REQ-01. No seat edits this file — a scope change is a new SPEC version ratified by V and superseding this one on the record.**

Mission: `translation` · slice `I11` · catalog namespace `formats` · census **15** translatable strings · mission requirements: `docs/missions/translation/requirements/translation.md`

## Intent

Make dates, times, relative times, numbers, percentages and plurals follow the active language, and make the layout mirror for Arabic and Urdu.

## Requirements

Each traces to a mission requirement in `requirements/translation.md` §Q3. `UNVERIFIED` is a valid, respected answer to any of them.

| Id | Requirement | Traces to |
|---|---|---|
| `I11-R01` | Each of the 16 formatting sites listed in `requirements/census.md` passes the active language to `Intl`; the eight `toLocale*` calls with no locale argument are the closing set, and the two `toFixed` calls writing `data-zoom` are excluded because no reader sees them. | R38 |
| `I11-R02` | `lib/format.ts:relativeTime` is rewritten on `Intl.RelativeTimeFormat` with the active language and produces the identical English output for every input its current tests cover. | R38, R34 |
| `I11-R03` | Each of the 24 hand-made plural lines listed in `requirements/census.md` selects its form through `Intl.PluralRules` for the active language; the `=== 1 ? "" : "s"` idiom appears nowhere in `apps/ui` afterwards. | R39, R41 |
| `I11-R04` | A plural key in language X carries exactly the CLDR cardinal categories that `Intl.PluralRules(X).resolvedOptions().pluralCategories` returns at test time — six for `ar`, four for `ru`, three for `ro`, two for the eight `one, other` languages, one for `zh-CN`, `ja`, `ko`, `vi`, `id`. | R40 |
| `I11-R05` | `lib/v3/adapter.ts:363-368`'s percentage is produced by `Intl.NumberFormat` with `style: "percent"` and the active language, not by string concatenation. | R41 |
| `I11-R06` | Every case transform applied to user-visible text passes the active language, so Turkish `i` uppercases to `İ`. | R42 |
| `I11-R07` | All 79 physical direction declarations in `apps/ui/app/globals.css` listed in `requirements/census.md` are logical properties, and a check counts the remaining physical declarations and asserts zero outside a named allowlist. | R47 |
| `I11-R08` | With `ar` or `ur` active, `→` renders as `←` and the back arrow flips, by a mechanism that reads the active direction rather than by duplicating the glyph in each catalog. | R48 |
| `I11-R09` | Numbers, model identifiers and brand marks stay left-to-right inside right-to-left text and are not visually reordered. | R33 |
| `I11-R10` | Each non-Latin script has a declared system fallback stack in `globals.css` and no font file is added to the repository. | R49 |
| `I11-R11` | No colour literal is introduced outside the first `:root {` and `html[data-mode="chamber"] {` blocks, and any new token is registered in `tests/unit/t9-mode-tokens.test.ts` with comma-tight values. | R44 |
| `I11-R12` | Rendering every covered route in English after this slice produces HTML byte-identical to the baseline, including every formatted date and number. | R34 |
| `I11-R13` | `tests/unit/t9-mode-tokens.test.ts` is base-RED at `4f764037` and supplies no evidence for this slice; whether its assertion message changes is recorded. | R53 |

## States

- English renders identically to before, including every date and number.
- With another language active, dates, times, numbers, percentages and plurals are in that language.
- With `ar` or `ur` active, the layout is mirrored.

## Copy and vocabulary

Every term this slice renders that appears in `requirements/glossary.md` uses that file's wording. New English copy is not written here: this slice moves existing words, it does not reword them — the English identity requirement makes any rewording a failure.

Untranslatable tokens that must survive this slice as literals: the brand marks `Dialectical Engine`, `DebateAI`, `dezbatere.ro`; the maker names `OpenAI`, `Anthropic`, `Google`; model identifiers matching `gpt-*`, `claude-*`, `gemini-*`; the glyphs `☀ ☾ → ← ↻ ◫ ◈ ⊗ ◆ ✓ ✗ · ⚙`; keyboard shortcut names.

## Acceptance — V runs these in a browser

The dev stack is `https://localhost:3000`. A green test suite is a worker milestone, never acceptance.

| # | Step | Expected observation |
|---|---|---|
| 1 | Sign in, open `/settings` and choose **Deutsch**. | A session's "last seen" timestamp reads as a German date — `2. September 2026` — not an English one. |
| 2 | Open the library and look at a debate card's age. | It reads `vor 3 Tagen`, not `3 days ago`. |
| 3 | Switch to **हिन्दी** and look at any large number on screen. | It is grouped in the Indian style — `12,34,567` — not `1,234,567`. |
| 4 | Switch to **Русский** and find a counter with one item, then two, then five. | The noun takes a different form for 1, for 2 and for 5. |
| 5 | Switch to **العربية** and open the library. | The whole layout mirrors: the + New debate button is at the top left, the back arrow points right, margins and borders are on the opposite side, and the dates read in Arabic. |
| 6 | Open a debate in Arabic and look at a card byline. | The model identifier reads `claude-opus-5` left to right inside the right-to-left line, with its punctuation in the right place. |
| 7 | Switch to **Türkçe** and look at any uppercase label containing an `i`. | It shows `İ`, not `I`. |
| 8 | Switch back to **English** and walk the library, a debate and settings. | Every date, number and count reads exactly as it did before this mission. |

## Out of scope

- Any string extraction — every catalog key already exists by this point.
- Adding a font file (V-5 default).
- Arabic-Indic digits (contested row T-6; default is Western digits).

## Owned files — exhaustive

Every file below is written by this slice and by no concurrent slice. Files with zero translatable strings are owned so that an import change has a single owner.

| File | Census strings |
|---|---|
| `apps/ui/lib/format.ts` | 15 |
| `apps/ui/app/globals.css` | 0 |
| **Total** | **15** |

