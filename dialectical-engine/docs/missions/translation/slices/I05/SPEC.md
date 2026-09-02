# I05 — Debate workspace shell · SPEC

> **SPEC v2 — supersedes `SPEC-v1.md`, 2026-09-02, REQ-01 rework round 1.**
>
> Written in answer to the blind review `docs/missions/translation/reviews/REQ-REV-01.md`. This is a **defect correction with no scope change**, so it needs no V ratification; v1 is archived beside this file and remains the record of what was frozen first.
>
> **What changed:** B4/N2 — census figure 190 → 187. N1 — `lib/canvasViewport.ts`, `lib/debateHeaderOverflow.ts` and `lib/types.ts` assigned here. B1 — added the write-concurrency section.

**FROZEN at creation, 2026-09-02, by REQ-01. No seat edits this file — a scope change is a new SPEC version ratified by V and superseding this one on the record.**

Mission: `translation` · slice `I05` · catalog namespace `workspace` · census **187** translatable strings · mission requirements: `docs/missions/translation/requirements/translation.md`

## Intent

Move the debate workspace shell into the `workspace` catalog — the toolbar, the view switcher, the utility actions, the status strip, the loading and error states and the challenge popover.

## Requirements

Each traces to a mission requirement in `requirements/translation.md` §Q3. `UNVERIFIED` is a valid, respected answer to any of them.

| Id | Requirement | Traces to |
|---|---|---|
| `I05-R01` | Every one of the 190 strings this slice owns, listed per file in `requirements/census.md`, is read from `locales/<code>/workspace.json` and no longer appears as a literal in the owned files. | R23, R25 |
| `I05-R02` | `locales/en/workspace.json` is created by this slice, is valid JSON, has no empty value, and no key exists in it that no owned file reads. | R25, R28 |
| `I05-R03` | Every untranslatable token in the owned files stays a literal: brand marks, maker names, model identifiers, glyphs and keyboard shortcut names, as listed in R31. | R31, R32 |
| `I05-R04` | Rendering each owned file in English after extraction produces HTML byte-identical to the baseline captured from this slice's base commit with the same fixtures, and the baseline was committed before the first extraction edit. | R34, R35 |
| `I05-R05` | Whitespace is preserved: every `{" "}` separator and every leading or trailing space of a JSX text node in the owned files renders identically before and after. | R35 |
| `I05-R06` | The hardcoded-string scanner reports **0** user-visible literals in the owned files, counting only files this slice owns. | R23 |
| `I05-R07` | A sentence whose grammar runs through an inline element becomes one key with the element as a placeholder, not two fragment keys. | R23 |
| `I05-R08` | No plural, date or number handling changes in this slice; those sites keep their current behaviour until slice I11. | R38, R39 |
| `I05-R09` | Every standing test that reads one of this slice's owned files from disk and asserts an English phrase against its source text is re-pointed at the catalog or at rendered output inside this slice. | R52 |
| `I05-R10` | No test file listed as base-RED at `4f764037` is used as evidence for this slice. | R53 |
| `I05-R11` | The four view buttons — Thread, Split, Tree, Map at `app/debate/[id]/DebatePageClient.tsx:1125-1136` — read from the catalog while their `aria-pressed` state and their `view` values stay unchanged. | R23 |
| `I05-R12` | The language menu mounted by slice I01 at `DebatePageClient.tsx:1139` is untouched by this slice. | R02 |
| `I05-R13` | `tests/render/load01-debate-page.test.tsx` is base-RED at `4f764037` and supplies no evidence for this slice. | R53 |
| `I05-R14` | `tests/unit/v2ui-pages.test.ts`, which reads `DebatePageClient.tsx` from disk, is base-RED at `4f764037`; this slice records whether its assertion messages change and does not treat it as a gate. | R53 |

## States

- The workspace renders in English identically to before.
- With another language active, the whole shell around the debate is in that language while the debate content stays as argued.

## Copy and vocabulary

Every term this slice renders that appears in `requirements/glossary.md` uses that file's wording. New English copy is not written here: this slice moves existing words, it does not reword them — the English identity requirement makes any rewording a failure.

Untranslatable tokens that must survive this slice as literals: the brand marks `Dialectical Engine`, `DebateAI`, `dezbatere.ro`; the maker names `OpenAI`, `Anthropic`, `Google`; model identifiers matching `gpt-*`, `claude-*`, `gemini-*`; the glyphs `☀ ☾ → ← ↻ ◫ ◈ ⊗ ◆ ✓ ✗ · ⚙`; keyboard shortcut names.

## Acceptance — V runs these in a browser

The dev stack is `https://localhost:3000`. A green test suite is a worker milestone, never acceptance.

| # | Step | Expected observation |
|---|---|---|
| 1 | Open a debate and choose **Русский**. | The toolbar, the four view buttons, the Library / Replay / Workspace / Honesty actions and the export action read in Russian. |
| 2 | Look at the arguments themselves. | The claims and arguments the models wrote are unchanged, in the language they were argued in. That is intended (V-3). |
| 3 | Click a sentence to open the challenge popover. | Its heading, its input placeholder and its buttons read in Russian. |
| 4 | Reload the page and watch the loading state. | The loading text is in Russian. |
| 5 | Open a debate id that does not exist. | The error state reads in Russian. |
| 6 | Switch back to **English**. | Every word of the shell reads exactly as it did before this mission. |

## Out of scope

- The five views' own internals (slice I06).
- The drawers (slice I07).
- Banners and panels (slice I08).

## Owned files — exhaustive

**Extraction ownership** — this slice moves these files' strings into the catalog, and no other slice does. Files with zero translatable strings are owned so that an import change has a single owner.

| File | Census strings |
|---|---|
| `apps/ui/app/debate/[id]/DebatePageClient.tsx` | 176 |
| `apps/ui/app/debate/[id]/DebatePageGate.tsx` | 0 |
| `apps/ui/app/debate/[id]/loading.tsx` | 3 |
| `apps/ui/app/debate/[id]/page.tsx` | 1 |
| `apps/ui/components/CanvasViewport.tsx` | 6 |
| `apps/ui/components/ChallengePopover.tsx` | 1 |
| `apps/ui/lib/canvasViewport.ts` | 0 |
| `apps/ui/lib/debateHeaderOverflow.ts` | 0 |
| `apps/ui/lib/types.ts` | 0 |
| **Total** | **187** |

**Write concurrency** — a different property from extraction ownership, and this section is the one that satisfies the SINGLE WRITER law. This slice writes the files below without owning them for extraction; each row names the wave rule that makes the write safe.

| Also written | What this slice does to it | Why it is not a concurrent write |
|---|---|---|
| `tests/unit/v2ui-pages.test.ts` | re-point source assertions over `DebatePageClient.tsx` | R52 + R57. Base-RED at `4f764037`; shared with I06–I10, so R57 serialises it. |

