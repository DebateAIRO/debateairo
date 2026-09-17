# I10 — Public and admin routes, scanner at zero · SPEC

**FROZEN at creation, 2026-09-02, by REQ-01. No seat edits this file — a scope change is a new SPEC version ratified by V and superseding this one on the record.**

Mission: `translation` · slice `I10` · catalog namespace `public` · census **49** translatable strings · mission requirements: `docs/missions/translation/requirements/translation.md`

## Intent

Move the public debate page, the admin worker page and the proxy's reader-facing messages into the `public` catalog; add a translated not-found page and a translated global error page; and take the hardcoded-string scanner to zero across the whole of `apps/ui`.

## Requirements

Each traces to a mission requirement in `requirements/translation.md` §Q3. `UNVERIFIED` is a valid, respected answer to any of them.

| Id | Requirement | Traces to |
|---|---|---|
| `I10-R01` | Every one of the 49 strings this slice owns, listed per file in `requirements/census.md`, is read from `locales/<code>/public.json` and no longer appears as a literal in the owned files. | R23, R25 |
| `I10-R02` | `locales/en/public.json` is created by this slice, is valid JSON, has no empty value, and no key exists in it that no owned file reads. | R25, R28 |
| `I10-R03` | Every untranslatable token in the owned files stays a literal: brand marks, maker names, model identifiers, glyphs and keyboard shortcut names, as listed in R31. | R31, R32 |
| `I10-R04` | Rendering each owned file in English after extraction produces HTML byte-identical to the baseline captured from this slice's base commit with the same fixtures, and the baseline was committed before the first extraction edit. | R34, R35 |
| `I10-R05` | Whitespace is preserved: every `{" "}` separator and every leading or trailing space of a JSX text node in the owned files renders identically before and after. | R35 |
| `I10-R06` | The hardcoded-string scanner reports **0** user-visible literals in the owned files, counting only files this slice owns. | R23 |
| `I10-R07` | A sentence whose grammar runs through an inline element becomes one key with the element as a placeholder, not two fragment keys. | R23 |
| `I10-R08` | No plural, date or number handling changes in this slice; those sites keep their current behaviour until slice I11. | R38, R39 |
| `I10-R09` | Every standing test that reads one of this slice's owned files from disk and asserts an English phrase against its source text is re-pointed at the catalog or at rendered output inside this slice. | R52 |
| `I10-R10` | No test file listed as base-RED at `4f764037` is used as evidence for this slice. | R53 |
| `I10-R11` | `app/not-found.tsx` and `app/global-error.tsx` are added and render from the catalog in the active language, replacing Next's built-in English pages. | R54 |
| `I10-R12` | `app/layout.tsx`'s `metadata.description` is translated and `metadata.title` is not, because the title is the brand mark. | R55 |
| `I10-R13` | The hardcoded-string scanner reports **0** user-visible literals across the whole of `apps/ui/app`, `apps/ui/components` and `apps/ui/lib`, printing `N of M` with M the number of files scanned. | R23, R32 |
| `I10-R14` | A check enumerates every `page.tsx` under `apps/ui/app` from the file system and asserts a language control renders for each; the check names the routes it found rather than a count alone. | R56, R01 |
| `I10-R15` | The count of `<ModeToggle` render sites equals the count of language-control render sites in the source — four and four. | R02 |
| `I10-R16` | `tests/render/pda-s02-public-page.test.tsx`, `tests/render/pda-s02-public-tree.test.tsx`, `tests/render/pda-s02-honesty-export.test.tsx` and `tests/unit/pda-s03-keyboard-accessibility.test.ts`, all GREEN at `4f764037`, stay green or are re-pointed inside this slice. | R52 |

## States

- The public page, the admin page, the not-found page and the error page render in English identically to before, except the two new pages, which did not exist.
- With another language active, all four are in that language.
- The scanner reports zero.

## Copy and vocabulary

Every term this slice renders that appears in `requirements/glossary.md` uses that file's wording. New English copy is not written here: this slice moves existing words, it does not reword them — the English identity requirement makes any rewording a failure. The two new pages (`not-found.tsx`, `global-error.tsx`) are the one exception and their English copy is authored in this slice and added to the glossary if it introduces a term.

Untranslatable tokens that must survive this slice as literals: the brand marks `Dialectical Engine`, `DebateAI`, `dezbatere.ro`; the maker names `OpenAI`, `Anthropic`, `Google`; model identifiers matching `gpt-*`, `claude-*`, `gemini-*`; the glyphs `☀ ☾ → ← ↻ ◫ ◈ ⊗ ◆ ✓ ✗ · ⚙`; keyboard shortcut names.

## Acceptance — V runs these in a browser

The dev stack is `https://localhost:3000`. A green test suite is a worker milestone, never acceptance.

| # | Step | Expected observation |
|---|---|---|
| 1 | In a fresh private window open a published debate URL and choose **हिन्दी**. | The public page's headings, its published-at label and its disclosure block read in Hindi. |
| 2 | Open the public honesty drawer. | It reads in Hindi. |
| 3 | Change the debate id in the address bar to something that does not exist and press Enter. | A not-found page renders in Hindi, with a link back to the landing page — not Next's built-in English page. |
| 4 | Open `/admin/workers`. | Its labels read in Hindi. |
| 5 | Look at the browser tab. | The tab title still reads `Dialectical Engine`; the page description in View Page Source is in Hindi. |
| 6 | Switch back to **English** on all four. | Every word reads exactly as it did before this mission, except the two pages that are new. |

## Out of scope

- Number formatting on the public page (slice I11).
- Any change to publication or to what a signed-out reader may see.

## Owned files — exhaustive

Every file below is written by this slice and by no concurrent slice. Files with zero translatable strings are owned so that an import change has a single owner.

| File | Census strings |
|---|---|
| `apps/ui/app/public/debate/[id]/PublicDebatePageClient.tsx` | 9 |
| `apps/ui/app/public/debate/[id]/page.tsx` | 0 |
| `apps/ui/components/PublicHonestyDrawer.tsx` | 27 |
| `apps/ui/components/PublicAnswerDisclosure.tsx` | 6 |
| `apps/ui/app/admin/workers/page.tsx` | 4 |
| `apps/ui/app/api/[...path]/route.ts` | 1 |
| `apps/ui/lib/v3/census.ts` | 2 |
| `apps/ui/lib/v3/publicAnswerExport.ts` | 0 |
| **Total** | **49** |

