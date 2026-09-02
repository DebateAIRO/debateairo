# I11 — Locale formatting and right-to-left · SPEC

> **SPEC v2 — supersedes `SPEC-v1.md`, 2026-09-02, REQ-01 rework round 1.**
>
> Written in answer to the blind review `docs/missions/translation/reviews/REQ-REV-01.md`. This is a **defect correction with no scope change**, so it needs no V ratification; v1 is archived beside this file and remains the record of what was frozen first.
>
> **What changed:** B1 — this slice writes 19 files and its v1 owned table named 2. It is re-sequenced to run after I01–I10 and is parallel-safe with nothing; the 17 cross-slice files are named with their extraction owner and the wave rule that makes each write safe. N3 — `I11-R01` is re-worded against the 12 user-visible formatting sites, not the 16 rows of the census table, 4 of which are not sites. N6 — `I11-R05` now states R41's closing set explicitly.

**FROZEN at creation, 2026-09-02, by REQ-01. No seat edits this file — a scope change is a new SPEC version ratified by V and superseding this one on the record.**

Mission: `translation` · slice `I11` · catalog namespace `formats` · census **15** translatable strings · mission requirements: `docs/missions/translation/requirements/translation.md`

## Intent

Make dates, times, relative times, numbers, percentages and plurals follow the active language, and make the layout mirror for Arabic and Urdu. **This slice runs LAST of the eleven code slices** — after I01–I10 have all merged — because it replaces the plural and formatting mechanism inside 17 files that other slices own for extraction. It is parallel-safe with nothing.

## Requirements

Each traces to a mission requirement in `requirements/translation.md` §Q3. `UNVERIFIED` is a valid, respected answer to any of them.

| Id | Requirement | Traces to |
|---|---|---|
| `I11-R01` | Each of the **12 user-visible formatting sites** listed in `requirements/census.md` §(g) passes the active language to `Intl`. The other four rows of that section are not sites and are out of scope: `components/DebatesBuffer.tsx:5` is an import statement, `lib/format.ts:1` is a function signature, and `components/CanvasViewport.tsx:119` and `:573` write a `data-zoom` attribute no reader sees. | R38 |
| `I11-R02` | `lib/format.ts:relativeTime` is rewritten on `Intl.RelativeTimeFormat` with the active language and produces the identical English output for every input its current tests cover. | R38, R34 |
| `I11-R03` | Each of the 24 hand-made plural lines listed in `requirements/census.md` §(e) selects its form through `Intl.PluralRules` for the active language; the `=== 1 ? "" : "s"` idiom appears nowhere in `apps/ui` afterwards. Every one of those lines has already been EXTRACTED by its owning slice and merged before this slice starts — this slice replaces the mechanism, never the key. | R39, R41, R58 |
| `I11-R04` | A plural key in language X carries exactly the CLDR cardinal categories that `Intl.PluralRules(X).resolvedOptions().pluralCategories` returns at test time — six for `ar`, four for `ru`, three for `ro`, two for the eight `one, other` languages, one for `zh-CN`, `ja`, `ko`, `vi`, `id`. | R40 |
| `I11-R05` | R41's closing set is exactly these sites and no others: `lib/v3/adapter.ts:363-368` (percentage by concatenation), `components/landing/LandingSample.tsx:70` and `:72` (`BASE {n}%` / `FINAL {n}%`), plus the 24 plural lines of §(e) and the 12 formatting sites of §(g). Each is produced by `Intl` in the active language afterwards. | R41 |
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

**Extraction ownership** — this slice moves these files' strings into the catalog, and no other slice does. Files with zero translatable strings are owned so that an import change has a single owner.

| File | Census strings |
|---|---|
| `apps/ui/lib/format.ts` | 15 |
| `apps/ui/app/globals.css` | 0 |
| **Total** | **15** |

**Write concurrency** — a different property from extraction ownership, and this section is the one that satisfies the SINGLE WRITER law. This slice writes the files below without owning them for extraction; each row names the wave rule that makes the write safe.

| Also written | What this slice does to it | Why it is not a concurrent write |
|---|---|---|
| the 17 source files listed in its owned table under "written, owned elsewhere for extraction" | replace the plural and formatting MECHANISM only; the catalog keys are already in place | I11 now runs after I10, so every one of those files has already been extracted and merged. Nothing else is in flight. |
| `tests/unit/t9-mode-tokens.test.ts` | conditional — only if the RTL work adds a token | Same rule as I01; I01 has long merged. |

**The 17 source files this slice writes but does not own for extraction**, with their extraction owner. Every one is merged before this slice starts, because I11 now depends on I01–I10 and is parallel-safe with nothing:

| File | Extraction owner | Why I11 writes it |
|---|---|---|
| `apps/ui/components/AccountErasureControls.tsx` | I03 | one `toLocaleString` with no locale argument (§g) |
| `apps/ui/components/SessionControls.tsx` | I03 | two `toLocale*` sites with no locale argument (§g) |
| `apps/ui/components/DebatesBuffer.tsx` | I04 | one hand-made plural (§e) and two `relativeTime` call sites (§g) |
| `apps/ui/components/ArgumentFocusView.tsx` | I06 | three hand-made plurals (§e) |
| `apps/ui/components/DebateCanvas.tsx` | I06 | two hand-made plurals (§e) |
| `apps/ui/components/DebateTree.tsx` | I06 | two hand-made plurals (§e) |
| `apps/ui/components/NodeDetailDrawer.tsx` | I07 | one hand-made plural (§e) — the B3 coordinate, line 637 |
| `apps/ui/components/EvaluatorDevMenu.tsx` | I08 | one `toFixed` that renders a number (§g) |
| `apps/ui/components/LegacyRunClaimControls.tsx` | I08 | one hand-made plural (§e) |
| `apps/ui/components/RecommendedInvestigations.tsx` | I08 | one hand-made plural (§e) |
| `apps/ui/lib/scoringFormat.ts` | I09 | one hand-made plural (§e) |
| `apps/ui/lib/scoringResponse.ts` | I09 | the `pluralize` helper and its four call sites (§e) |
| `apps/ui/lib/v3/adapter.ts` | I09 | one hand-made plural, the concatenated percentage, one `toLocaleString` (§e, §g, R41) |
| `apps/ui/lib/v3/liveEvents.ts` | I09 | two hand-made plurals (§e) |
| `apps/ui/app/public/debate/[id]/PublicDebatePageClient.tsx` | I10 | one `toLocaleDateString` with no locale argument (§g) |
| `apps/ui/components/PublicAnswerDisclosure.tsx` | I10 | one `toLocaleString` with no locale argument (§g) |
| `apps/ui/components/PublicHonestyDrawer.tsx` | I10 | one `toLocaleString` with no locale argument (§g) |

**19 files in total** — the 2 owned above plus these 17.

