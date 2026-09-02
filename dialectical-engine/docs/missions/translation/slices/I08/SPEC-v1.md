# I08 — Banners, panels and controls · SPEC

**FROZEN at creation, 2026-09-02, by REQ-01. No seat edits this file — a scope change is a new SPEC version ratified by V and superseding this one on the record.**

Mission: `translation` · slice `I08` · catalog namespace `panels` · census **147** translatable strings · mission requirements: `docs/missions/translation/requirements/translation.md`

## Intent

Move the verdict banner, the synthesis panel, the recommendations list, the publication control, the legacy-claim control, the evaluator developer menu, the model presentation row and the scoring error boundary into the `panels` catalog.

## Requirements

Each traces to a mission requirement in `requirements/translation.md` §Q3. `UNVERIFIED` is a valid, respected answer to any of them.

| Id | Requirement | Traces to |
|---|---|---|
| `I08-R01` | Every one of the 147 strings this slice owns, listed per file in `requirements/census.md`, is read from `locales/<code>/panels.json` and no longer appears as a literal in the owned files. | R23, R25 |
| `I08-R02` | `locales/en/panels.json` is created by this slice, is valid JSON, has no empty value, and no key exists in it that no owned file reads. | R25, R28 |
| `I08-R03` | Every untranslatable token in the owned files stays a literal: brand marks, maker names, model identifiers, glyphs and keyboard shortcut names, as listed in R31. | R31, R32 |
| `I08-R04` | Rendering each owned file in English after extraction produces HTML byte-identical to the baseline captured from this slice's base commit with the same fixtures, and the baseline was committed before the first extraction edit. | R34, R35 |
| `I08-R05` | Whitespace is preserved: every `{" "}` separator and every leading or trailing space of a JSX text node in the owned files renders identically before and after. | R35 |
| `I08-R06` | The hardcoded-string scanner reports **0** user-visible literals in the owned files, counting only files this slice owns. | R23 |
| `I08-R07` | A sentence whose grammar runs through an inline element becomes one key with the element as a placeholder, not two fragment keys. | R23 |
| `I08-R08` | No plural, date or number handling changes in this slice; those sites keep their current behaviour until slice I11. | R38, R39 |
| `I08-R09` | Every standing test that reads one of this slice's owned files from disk and asserts an English phrase against its source text is re-pointed at the catalog or at rendered output inside this slice. | R52 |
| `I08-R10` | No test file listed as base-RED at `4f764037` is used as evidence for this slice. | R53 |
| `I08-R11` | The rendered uppercase state words `PRIVATE`, `PUBLISHED`, `PUBLISH`, `VERDICT`, `UNAVAILABLE` are catalog keys, because they are on screen; the identically-spelled contract values they are compared against stay literals. | R23 |
| `I08-R12` | `components/ModelPresentation.tsx` renders maker names and model identifiers, which stay literals under R31; only its four attribute strings are extracted. | R31 |
| `I08-R13` | The hand-made plural at `components/RecommendedInvestigations.tsx:87` and the one at `components/LegacyRunClaimControls.tsx:33` are extracted as plural-capable keys with the count as a placeholder. | R39 |
| `I08-R14` | `tests/render/evaluator-dev-menu-controls.test.tsx`, `tests/render/s9-legacy-claim-controls.test.tsx` and `tests/unit/s8-publication-ui.test.tsx`, all GREEN at `4f764037`, stay green or are re-pointed inside this slice. | R52 |

## States

- Each panel renders in English identically to before.
- With another language active, every panel, banner and control is in that language.

## Copy and vocabulary

Every term this slice renders that appears in `requirements/glossary.md` uses that file's wording. New English copy is not written here: this slice moves existing words, it does not reword them — the English identity requirement makes any rewording a failure.

Untranslatable tokens that must survive this slice as literals: the brand marks `Dialectical Engine`, `DebateAI`, `dezbatere.ro`; the maker names `OpenAI`, `Anthropic`, `Google`; model identifiers matching `gpt-*`, `claude-*`, `gemini-*`; the glyphs `☀ ☾ → ← ↻ ◫ ◈ ⊗ ◆ ✓ ✗ · ⚙`; keyboard shortcut names.

## Acceptance — V runs these in a browser

The dev stack is `https://localhost:3000`. A green test suite is a worker milestone, never acceptance.

| # | Step | Expected observation |
|---|---|---|
| 1 | Open a finished debate and choose **Türkçe**. | The verdict banner's label and its confidence wording read in Turkish. |
| 2 | Open the synthesis panel. | Its heading and its one-line description read in Turkish. |
| 3 | Look at the recommended investigations list. | Its heading, its items' labels and its count sentence read in Turkish. |
| 4 | Open the publication control on a private debate. | It reads PRIVATE and its action reads PUBLISH, both in Turkish, with Turkish uppercase applied — a dotted `İ` where Turkish requires one. |
| 5 | Publish it, then look again. | It reads PUBLISHED in Turkish, and publication itself behaves exactly as before. |
| 6 | Switch back to **English**. | Every word reads exactly as it did before this mission. |

## Out of scope

- Domain vocabulary from `lib/` (slice I09).
- Turkish-aware case transforms in shared helpers (slice I11).

## Owned files — exhaustive

Every file below is written by this slice and by no concurrent slice. Files with zero translatable strings are owned so that an import change has a single owner.

| File | Census strings |
|---|---|
| `apps/ui/components/VerdictBanner.tsx` | 28 |
| `apps/ui/components/SynthesisPanel.tsx` | 14 |
| `apps/ui/components/RecommendedInvestigations.tsx` | 12 |
| `apps/ui/components/PublicationControl.tsx` | 42 |
| `apps/ui/components/LegacyRunClaimControls.tsx` | 12 |
| `apps/ui/components/EvaluatorDevMenu.tsx` | 34 |
| `apps/ui/components/ModelPresentation.tsx` | 4 |
| `apps/ui/components/ScoringErrorBoundary.tsx` | 1 |
| **Total** | **147** |

