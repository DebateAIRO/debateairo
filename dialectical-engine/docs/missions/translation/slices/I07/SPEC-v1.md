# I07 — Honesty and detail drawers · SPEC

**FROZEN at creation, 2026-09-02, by REQ-01. No seat edits this file — a scope change is a new SPEC version ratified by V and superseding this one on the record.**

Mission: `translation` · slice `I07` · catalog namespace `drawers` · census **206** translatable strings · mission requirements: `docs/missions/translation/requirements/translation.md`

## Intent

Move the four drawers that open over a debate — honesty and provenance, node detail, investigations and workspace artifacts — into the `drawers` catalog. This is the largest single extraction in the mission.

## Requirements

Each traces to a mission requirement in `requirements/translation.md` §Q3. `UNVERIFIED` is a valid, respected answer to any of them.

| Id | Requirement | Traces to |
|---|---|---|
| `I07-R01` | Every one of the 206 strings this slice owns, listed per file in `requirements/census.md`, is read from `locales/<code>/drawers.json` and no longer appears as a literal in the owned files. | R23, R25 |
| `I07-R02` | `locales/en/drawers.json` is created by this slice, is valid JSON, has no empty value, and no key exists in it that no owned file reads. | R25, R28 |
| `I07-R03` | Every untranslatable token in the owned files stays a literal: brand marks, maker names, model identifiers, glyphs and keyboard shortcut names, as listed in R31. | R31, R32 |
| `I07-R04` | Rendering each owned file in English after extraction produces HTML byte-identical to the baseline captured from this slice's base commit with the same fixtures, and the baseline was committed before the first extraction edit. | R34, R35 |
| `I07-R05` | Whitespace is preserved: every `{" "}` separator and every leading or trailing space of a JSX text node in the owned files renders identically before and after. | R35 |
| `I07-R06` | The hardcoded-string scanner reports **0** user-visible literals in the owned files, counting only files this slice owns. | R23 |
| `I07-R07` | A sentence whose grammar runs through an inline element becomes one key with the element as a placeholder, not two fragment keys. | R23 |
| `I07-R08` | No plural, date or number handling changes in this slice; those sites keep their current behaviour until slice I11. | R38, R39 |
| `I07-R09` | Every standing test that reads one of this slice's owned files from disk and asserts an English phrase against its source text is re-pointed at the catalog or at rendered output inside this slice. | R52 |
| `I07-R10` | No test file listed as base-RED at `4f764037` is used as evidence for this slice. | R53 |
| `I07-R11` | Every condition-mark and abstention label the drawers render comes from `lib/v3/labels.ts`, which slice I09 owns; this slice extracts only the drawers' own copy and does not touch `lib/v3/**`. | R23, R25 |
| `I07-R12` | The two hand-made plurals at `components/NodeDetailDrawer.tsx:637` and `components/RecommendedInvestigations.tsx:87` — the latter owned by slice I08 — are not both claimed here: only line 637 belongs to this slice. | R39 |
| `I07-R13` | `components/AnswerHonestyDrawer.tsx:68` (`Honesty &amp; provenance`) and `components/InvestigationDrawer.tsx:91` (`Resolve &amp; clear scrutiny`) keep their HTML entity in the English catalog value so the rendered output is byte-identical. | R34 |
| `I07-R14` | `tests/render/prov01-honesty-drawer.test.tsx` and `tests/render/t5-drawer.test.tsx`, both GREEN at `4f764037`, stay green or are re-pointed inside this slice. | R52 |

## States

- Each drawer renders in English identically to before.
- With another language active, every heading, row label, badge and empty state in each drawer is in that language.

## Copy and vocabulary

Every term this slice renders that appears in `requirements/glossary.md` uses that file's wording. New English copy is not written here: this slice moves existing words, it does not reword them — the English identity requirement makes any rewording a failure.

Untranslatable tokens that must survive this slice as literals: the brand marks `Dialectical Engine`, `DebateAI`, `dezbatere.ro`; the maker names `OpenAI`, `Anthropic`, `Google`; model identifiers matching `gpt-*`, `claude-*`, `gemini-*`; the glyphs `☀ ☾ → ← ↻ ◫ ◈ ⊗ ◆ ✓ ✗ · ⚙`; keyboard shortcut names.

## Acceptance — V runs these in a browser

The dev stack is `https://localhost:3000`. A green test suite is a worker milestone, never acceptance.

| # | Step | Expected observation |
|---|---|---|
| 1 | Open a finished debate and choose **العربية**. | The workspace chrome is Arabic and the layout is mirrored. |
| 2 | Open the Honesty drawer. | Its heading, its section titles, its row labels and its cost-envelope block read in Arabic; the drawer opens from the correct side for a right-to-left layout. |
| 3 | Open a node's detail drawer. | Its headings, its review labels and its provenance rows read in Arabic; the model identifier still reads `claude-opus-5` in Latin script, left to right. |
| 4 | Open the Investigations drawer. | Its working state, its empty state and its action buttons read in Arabic. |
| 5 | Open the Workspace drawer. | Its artifact labels read in Arabic. |
| 6 | Switch back to **English** and re-open all four drawers. | Every word reads exactly as it did before this mission. |

## Out of scope

- The honesty vocabulary itself — condition marks, abstention kinds (slice I09).
- Right-to-left CSS mirroring (slice I11).

## Owned files — exhaustive

Every file below is written by this slice and by no concurrent slice. Files with zero translatable strings are owned so that an import change has a single owner.

| File | Census strings |
|---|---|
| `apps/ui/components/AnswerHonestyDrawer.tsx` | 109 |
| `apps/ui/components/NodeDetailDrawer.tsx` | 69 |
| `apps/ui/components/InvestigationDrawer.tsx` | 14 |
| `apps/ui/components/DebateWorkspaceDrawer.tsx` | 14 |
| **Total** | **206** |

