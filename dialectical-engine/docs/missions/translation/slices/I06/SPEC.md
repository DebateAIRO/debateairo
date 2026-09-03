# I06 — Debate views · SPEC

> **SPEC v2 — supersedes `SPEC-v1.md`, 2026-09-02, REQ-01 rework round 1.**
>
> Written in answer to the blind review `docs/missions/translation/reviews/REQ-REV-01.md`. This is a **defect correction with no scope change**, so it needs no V ratification; v1 is archived beside this file and remains the record of what was frozen first.
>
> **What changed:** B4/N2 — census figure 163 → 162. N1 — `lib/debateTreeUtils.ts` assigned here.

**FROZEN at creation, 2026-09-02, by REQ-01. No seat edits this file — a scope change is a new SPEC version ratified by V and superseding this one on the record.**

Mission: `translation` · slice `I06` · catalog namespace `views` · census **162** translatable strings · mission requirements: `docs/missions/translation/requirements/translation.md`

## Intent

Move the five views of a debate — canvas, tree, thread, split, map, outline — and the focus view into the `views` catalog.

## Requirements

Each traces to a mission requirement in `requirements/translation.md` §Q3. `UNVERIFIED` is a valid, respected answer to any of them.

| Id | Requirement | Traces to |
|---|---|---|
| `I06-R01` | Every one of the 163 strings this slice owns, listed per file in `requirements/census.md`, is read from `locales/<code>/views.json` and no longer appears as a literal in the owned files. | R23, R25 |
| `I06-R02` | `locales/en/views.json` is created by this slice, is valid JSON, has no empty value, and no key exists in it that no owned file reads. | R25, R28 |
| `I06-R03` | Every untranslatable token in the owned files stays a literal: brand marks, maker names, model identifiers, glyphs and keyboard shortcut names, as listed in R31. | R31, R32 |
| `I06-R04` | Rendering each owned file in English after extraction produces HTML byte-identical to the baseline captured from this slice's base commit with the same fixtures, and the baseline was committed before the first extraction edit. | R34, R35 |
| `I06-R05` | Whitespace is preserved: every `{" "}` separator and every leading or trailing space of a JSX text node in the owned files renders identically before and after. | R35 |
| `I06-R06` | The hardcoded-string scanner reports **0** user-visible literals in the owned files, counting only files this slice owns. | R23 |
| `I06-R07` | A sentence whose grammar runs through an inline element becomes one key with the element as a placeholder, not two fragment keys. | R23 |
| `I06-R08` | No plural, date or number handling changes in this slice; those sites keep their current behaviour until slice I11. | R38, R39 |
| `I06-R09` | Every standing test that reads one of this slice's owned files from disk and asserts an English phrase against its source text is re-pointed at the catalog or at rendered output inside this slice. | R52 |
| `I06-R10` | No test file listed as base-RED at `4f764037` is used as evidence for this slice. | R53 |
| `I06-R11` | The three hand-made plurals in `components/ArgumentFocusView.tsx:116,142,151` and the two in `components/DebateTree.tsx:287,289` are extracted as plural-capable keys with the count as a placeholder, and their English rendering is unchanged; the plural *selection* still uses the existing `=== 1` branch until slice I11 replaces it. | R23, R39 |
| `I06-R12` | Single-word rendered states — `pending`, `streaming`, `conceded`, `abandoned`, `failed`, `root`, `empty`, `depth`, `claims` — are catalog keys, because they are on screen, while the identically-spelled `status` values they are compared against stay literals. | R23 |
| `I06-R13` | The map legend at `components/DebateMap.tsx:102,106` extracts as two keys, not four fragments, with the colour swatch left as decoration. | R23 |

## States

- Each of the five views renders in English identically to before.
- With another language active, every label, badge, counter and empty state in every view is in that language.

## Copy and vocabulary

Every term this slice renders that appears in `requirements/glossary.md` uses that file's wording. New English copy is not written here: this slice moves existing words, it does not reword them — the English identity requirement makes any rewording a failure.

Untranslatable tokens that must survive this slice as literals: the brand marks `Dialectical Engine`, `DebateAI`, `dezbatere.ro`; the maker names `OpenAI`, `Anthropic`, `Google`; model identifiers matching `gpt-*`, `claude-*`, `gemini-*`; the glyphs `☀ ☾ → ← ↻ ◫ ◈ ⊗ ◆ ✓ ✗ · ⚙`; keyboard shortcut names.

## Acceptance — V runs these in a browser

The dev stack is `https://localhost:3000`. A green test suite is a worker milestone, never acceptance.

| # | Step | Expected observation |
|---|---|---|
| 1 | Open a debate and choose **日本語**. | The toolbar is Japanese from slice I05. |
| 2 | Switch to the Thread view. | The turn labels, stance badges and state badges read in Japanese. |
| 3 | Switch to Split. | The two column headings, the argument counters and the leaf message read in Japanese. |
| 4 | Switch to Tree. | The node badges, the "stopped path" summary and the root-claim label read in Japanese. |
| 5 | Switch to Map. | The legend reads Japanese for "supports" and "opposes"; the coloured swatches are unchanged. |
| 6 | Open the outline. | The hole and fatal-flag counters read in Japanese. |
| 7 | Switch back to **English** and walk the same five views. | Every word reads exactly as it did before this mission. |

## Out of scope

- The workspace shell (slice I05).
- Plural selection by CLDR category (slice I11).

## Owned files — exhaustive

**Extraction ownership** — this slice moves these files' strings into the catalog, and no other slice does. Files with zero translatable strings are owned so that an import change has a single owner.

| File | Census strings |
|---|---|
| `apps/ui/components/DebateCanvas.tsx` | 44 |
| `apps/ui/components/DebateTree.tsx` | 27 |
| `apps/ui/components/DebateMap.tsx` | 7 |
| `apps/ui/components/DebateOutline.tsx` | 11 |
| `apps/ui/components/DebateSplit.tsx` | 32 |
| `apps/ui/components/DebateThread.tsx` | 10 |
| `apps/ui/components/ArgumentFocusView.tsx` | 31 |
| `apps/ui/lib/debateTreeUtils.ts` | 0 |
| **Total** | **162** |

**Write concurrency** — a different property from extraction ownership, and this section is the one that satisfies the SINGLE WRITER law. This slice writes nothing outside the table above.

