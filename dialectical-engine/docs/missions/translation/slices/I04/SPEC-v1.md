# I04 — Landing, library and new debate · SPEC

**FROZEN at creation, 2026-09-02, by REQ-01. No seat edits this file — a scope change is a new SPEC version ratified by V and superseding this one on the record.**

Mission: `translation` · slice `I04` · catalog namespace `landing` · census **143** translatable strings · mission requirements: `docs/missions/translation/requirements/translation.md`

## Intent

Move the anonymous landing page, the signed-in library and the new-debate form into the `landing` catalog — the three screens a visitor meets before any debate exists.

## Requirements

Each traces to a mission requirement in `requirements/translation.md` §Q3. `UNVERIFIED` is a valid, respected answer to any of them.

| Id | Requirement | Traces to |
|---|---|---|
| `I04-R01` | Every one of the 143 strings this slice owns, listed per file in `requirements/census.md`, is read from `locales/<code>/landing.json` and no longer appears as a literal in the owned files. | R23, R25 |
| `I04-R02` | `locales/en/landing.json` is created by this slice, is valid JSON, has no empty value, and no key exists in it that no owned file reads. | R25, R28 |
| `I04-R03` | Every untranslatable token in the owned files stays a literal: brand marks, maker names, model identifiers, glyphs and keyboard shortcut names, as listed in R31. | R31, R32 |
| `I04-R04` | Rendering each owned file in English after extraction produces HTML byte-identical to the baseline captured from this slice's base commit with the same fixtures, and the baseline was committed before the first extraction edit. | R34, R35 |
| `I04-R05` | Whitespace is preserved: every `{" "}` separator and every leading or trailing space of a JSX text node in the owned files renders identically before and after. | R35 |
| `I04-R06` | The hardcoded-string scanner reports **0** user-visible literals in the owned files, counting only files this slice owns. | R23 |
| `I04-R07` | A sentence whose grammar runs through an inline element becomes one key with the element as a placeholder, not two fragment keys. | R23 |
| `I04-R08` | No plural, date or number handling changes in this slice; those sites keep their current behaviour until slice I11. | R38, R39 |
| `I04-R09` | Every standing test that reads one of this slice's owned files from disk and asserts an English phrase against its source text is re-pointed at the catalog or at rendered output inside this slice. | R52 |
| `I04-R10` | No test file listed as base-RED at `4f764037` is used as evidence for this slice. | R53 |
| `I04-R11` | The sentence at `app/new/page.tsx:318` (`Role overrides are not user-editable — model role assignment lives in <button>…</button>`) becomes one key with the button as a placeholder. | R23 |
| `I04-R12` | `tests/render/t9-landing.test.tsx`, which reads `components/landing/*` from disk and asserts `Find the weakest joint in your own argument.`, passes or is re-pointed inside this slice; it is GREEN at `4f764037` and must stay green. | R52, R53 |
| `I04-R13` | `tests/render/t3-library.test.tsx` is base-RED at `4f764037`; if this slice changes the assertion messages it fires, the change is named and the file stays RED with the reason recorded, and it supplies no evidence. | R53 |
| `I04-R14` | `components/Toast.tsx` and `components/landing/LandingPage.tsx` carry no strings and change only if an import changes. | R23 |

## States

- The landing, library and new-debate screens render in English identically to before.
- With another language active, all three are in that language.

## Copy and vocabulary

Every term this slice renders that appears in `requirements/glossary.md` uses that file's wording. New English copy is not written here: this slice moves existing words, it does not reword them — the English identity requirement makes any rewording a failure.

Untranslatable tokens that must survive this slice as literals: the brand marks `Dialectical Engine`, `DebateAI`, `dezbatere.ro`; the maker names `OpenAI`, `Anthropic`, `Google`; model identifiers matching `gpt-*`, `claude-*`, `gemini-*`; the glyphs `☀ ☾ → ← ↻ ◫ ◈ ⊗ ◆ ✓ ✗ · ⚙`; keyboard shortcut names.

## Acceptance — V runs these in a browser

The dev stack is `https://localhost:3000`. A green test suite is a worker milestone, never acceptance.

| # | Step | Expected observation |
|---|---|---|
| 1 | Open `https://localhost:3000/` signed out and choose **Português (Brasil)**. | The eyebrow, the headline, the lede, the two calls to action, the four numbered method steps and the pricing line read in Portuguese. |
| 2 | Scroll to the sample transcript. | The stance labels Pro / Con / Reasoning read in Portuguese; the model identifiers and maker names still read `OpenAI · GPT · gpt-5.6-sol` and `Anthropic · Claude · claude-opus-5`. |
| 3 | Sign in and look at the library. | The tab labels, the empty-state hint and the card metadata labels are in Portuguese. |
| 4 | Open `/new`. | Every field label, every helper line, the depth-mode options, the risk-tier options and the budget options read in Portuguese; the guide modal does too. |
| 5 | Switch back to **English** on each of the three screens. | Every word reads exactly as it did before this mission. |

## Out of scope

- The debate workspace (slices I05–I08).
- Number and date formatting (slice I11).

## Owned files — exhaustive

Every file below is written by this slice and by no concurrent slice. Files with zero translatable strings are owned so that an import change has a single owner.

| File | Census strings |
|---|---|
| `apps/ui/app/page.tsx` | 16 |
| `apps/ui/app/new/page.tsx` | 48 |
| `apps/ui/app/new/defaults.tsx` | 7 |
| `apps/ui/components/landing/LandingHero.tsx` | 9 |
| `apps/ui/components/landing/LandingMethod.tsx` | 4 |
| `apps/ui/components/landing/LandingPricing.tsx` | 4 |
| `apps/ui/components/landing/LandingSample.tsx` | 15 |
| `apps/ui/components/landing/LandingPage.tsx` | 0 |
| `apps/ui/components/landing/cards.ts` | 16 |
| `apps/ui/components/DebatesBuffer.tsx` | 6 |
| `apps/ui/components/LibraryComposer.tsx` | 5 |
| `apps/ui/components/GuideModal.tsx` | 13 |
| `apps/ui/components/Toast.tsx` | 0 |
| **Total** | **143** |

