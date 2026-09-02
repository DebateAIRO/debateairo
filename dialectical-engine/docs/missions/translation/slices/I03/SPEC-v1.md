# I03 — Settings and account · SPEC

**FROZEN at creation, 2026-09-02, by REQ-01. No seat edits this file — a scope change is a new SPEC version ratified by V and superseding this one on the record.**

Mission: `translation` · slice `I03` · catalog namespace `account` · census **90** translatable strings · mission requirements: `docs/missions/translation/requirements/translation.md`

## Intent

Move the settings, session-list and account-erasure copy into the `account` catalog. Security zone: text only.

## Requirements

Each traces to a mission requirement in `requirements/translation.md` §Q3. `UNVERIFIED` is a valid, respected answer to any of them.

| Id | Requirement | Traces to |
|---|---|---|
| `I03-R01` | Every one of the 90 strings this slice owns, listed per file in `requirements/census.md`, is read from `locales/<code>/account.json` and no longer appears as a literal in the owned files. | R23, R25 |
| `I03-R02` | `locales/en/account.json` is created by this slice, is valid JSON, has no empty value, and no key exists in it that no owned file reads. | R25, R28 |
| `I03-R03` | Every untranslatable token in the owned files stays a literal: brand marks, maker names, model identifiers, glyphs and keyboard shortcut names, as listed in R31. | R31, R32 |
| `I03-R04` | Rendering each owned file in English after extraction produces HTML byte-identical to the baseline captured from this slice's base commit with the same fixtures, and the baseline was committed before the first extraction edit. | R34, R35 |
| `I03-R05` | Whitespace is preserved: every `{" "}` separator and every leading or trailing space of a JSX text node in the owned files renders identically before and after. | R35 |
| `I03-R06` | The hardcoded-string scanner reports **0** user-visible literals in the owned files, counting only files this slice owns. | R23 |
| `I03-R07` | A sentence whose grammar runs through an inline element becomes one key with the element as a placeholder, not two fragment keys. | R23 |
| `I03-R08` | No plural, date or number handling changes in this slice; those sites keep their current behaviour until slice I11. | R38, R39 |
| `I03-R09` | Every standing test that reads one of this slice's owned files from disk and asserts an English phrase against its source text is re-pointed at the catalog or at rendered output inside this slice. | R52 |
| `I03-R10` | No test file listed as base-RED at `4f764037` is used as evidence for this slice. | R53 |
| `I03-R11` | Only text changes in the owned files: no control flow, validation, request, cookie, storage, redirect or security attribute is altered, and the diff touches only string positions and their imports. | R51 |
| `I03-R12` | The sentence at `components/AccountErasureControls.tsx:107` (`Status: <strong>{status}</strong>. Scheduled deletion time: {date}`) becomes one key with two placeholders. | R23 |
| `I03-R13` | `tests/unit/s10-erasure-ui.test.ts`, which reads `components/AccountErasureControls.tsx` from disk, passes or is re-pointed inside this slice. | R52 |

## States

- Settings renders in English identically to before.
- With another language active, the session rows, the erasure controls and their confirmation copy are in that language.

## Copy and vocabulary

Every term this slice renders that appears in `requirements/glossary.md` uses that file's wording. New English copy is not written here: this slice moves existing words, it does not reword them — the English identity requirement makes any rewording a failure.

Untranslatable tokens that must survive this slice as literals: the brand marks `Dialectical Engine`, `DebateAI`, `dezbatere.ro`; the maker names `OpenAI`, `Anthropic`, `Google`; model identifiers matching `gpt-*`, `claude-*`, `gemini-*`; the glyphs `☀ ☾ → ← ↻ ◫ ◈ ⊗ ◆ ✓ ✗ · ⚙`; keyboard shortcut names.

## Acceptance — V runs these in a browser

The dev stack is `https://localhost:3000`. A green test suite is a worker milestone, never acceptance.

| # | Step | Expected observation |
|---|---|---|
| 1 | Sign in, open `https://localhost:3000/settings` and choose **Français**. | The section headings, the read-only pill, the session table headers and the erasure controls read in French. |
| 2 | Look at the "Last seen" row of a session. | The label is French. The timestamp is still formatted by the browser's locale — slice I11 changes that, and this slice does not. |
| 3 | Open the account-deletion control. | Its status line and its scheduled-time sentence read in French as one sentence, with the status word in bold in the right grammatical place. |
| 4 | Switch back to **English**. | Every word reads exactly as it did before this mission. |

## Out of scope

- Any change to session revocation, erasure scheduling or account data.
- Date formatting (slice I11).

## Owned files — exhaustive

Every file below is written by this slice and by no concurrent slice. Files with zero translatable strings are owned so that an import change has a single owner.

| File | Census strings |
|---|---|
| `apps/ui/app/settings/page.tsx` | 32 |
| `apps/ui/components/SessionControls.tsx` | 31 |
| `apps/ui/components/AccountErasureControls.tsx` | 25 |
| `apps/ui/lib/serverApi.ts` | 2 |
| **Total** | **90** |

