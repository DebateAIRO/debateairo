# L-de — Deutsch (German) · SPEC

> **SPEC v2 — supersedes `SPEC-v1.md`, 2026-09-02, REQ-01 rework round 1.**
>
> Written in answer to the blind review `docs/missions/translation/reviews/REQ-REV-01.md`. A defect correction with no scope change; v1 is archived beside this file.
>
> **What changed:** N7 — the key-identity policy is now stated (one key per census site, not per distinct English string) and the key figure is the measured **1349**, replacing the unexplained "≈1360". B4 and N2 — 22 rows left the census, so every derived figure moved.

**FROZEN at creation, 2026-09-02, by REQ-01. No seat edits this file.**

Mission: `translation` · slice `L-de` · language **Deutsch** (`de`, German) · script Latn · direction ltr

## The language, measured

These values were read from ICU on Node v22.23.1 with full ICU on 2026-09-02, not recalled.

| Fact | Value |
|---|---|
| BCP-47 code | `de` |
| Native name, as the menu shows it | Deutsch |
| English name | German |
| Maximized script | Latn |
| Direction | ltr |
| CLDR cardinal plural categories | one, other |
| CLDR ordinal plural categories | other |
| Default numbering system | `latn` |
| Register | Sie (formal) — German product UI convention outside consumer-social apps |

## Intent

Author the complete Deutsch catalog: all eleven namespaces, every key the English catalogs carry, in the register recorded above and the vocabulary recorded in this language's column of `requirements/glossary.md`. Nothing else — this slice writes no code.

**Key count: 1349.** One key per census site, not one key per distinct English string — the policy is stated with its reason in `requirements/translation.md` §Q1. The census carries 1349 sites and 1091 distinct texts; 153 English strings appear at more than one site and each site still gets its own key, because two sites rendering the same English word can need different words here (the English `Close` is a button in one place and a verb in a sentence in another). Consistency is enforced by the glossary rule, not by sharing keys.

## Requirements

| Id | Requirement | Traces to |
|---|---|---|
| `L-de-R01` | Every cell of the `de` column of `requirements/glossary.md` is filled — 61 terms, none empty — and committed BEFORE the first catalog key of this slice is translated. | R43 |
| `L-de-R02` | A term with no good equivalent in Deutsch is written as `<english term> (kept)` in its glossary cell, so a kept word is a recorded decision and not a gap. | R43 |
| `L-de-R03` | All eleven namespace files exist under `apps/ui/locales/de/`: `chrome.json`, `auth.json`, `account.json`, `landing.json`, `workspace.json`, `views.json`, `drawers.json`, `panels.json`, `domain.json`, `public.json`, `formats.json`, and together they carry **1349 keys** — one per census site, per the key-identity policy in `requirements/translation.md` §Q1. | R25 |
| `L-de-R04` | For every namespace, the key set of `de` equals the English key set exactly: no key missing, no key extra. | R26 |
| `L-de-R05` | For every key, the set of `{placeholder}` names in the Deutsch value equals the set in the English value. | R27 |
| `L-de-R06` | No value in any `de` namespace is the empty string or whitespace only. | R28 |
| `L-de-R07` | Every plural key carries exactly the CLDR cardinal categories `one, other` — read at test time from `Intl.PluralRules("de").resolvedOptions().pluralCategories`, not from a hand-written list — and carries no other category. | R40 |
| `L-de-R08` | Every glossary term renders with the wording in its `de` glossary cell, in every namespace: one English term is one Deutsch word across the whole application. | R43 |
| `L-de-R09` | No brand mark, maker name, model identifier, glyph or keyboard shortcut is translated: `Dialectical Engine`, `DebateAI`, `dezbatere.ro`, `OpenAI`, `Anthropic`, `Google`, `gpt-*`, `claude-*`, `gemini-*` and the glyph set of R31 appear in `de` exactly as they appear in English. | R31, R33 |
| `L-de-R10` | Every Deutsch value uses the register recorded for this language: Sie (formal) — German product UI convention outside consumer-social apps. A value in another register is a finding against this slice. | R43 |
| `L-de-R11` | With `de` active, no covered route renders an English catalog value as a complete text node or a complete attribute value, unless that key is listed in `apps/ui/locales/de/identical-values.json` with a one-line reason. | R36, R37 |
| `L-de-R12` | `apps/ui/locales/de/identical-values.json` exists and every entry carries a reason; an entry with no reason fails this slice. | R37 |
| `L-de-R13` | This slice writes only files under `apps/ui/locales/de/` and its own column of `requirements/glossary.md`; it writes no TypeScript, no CSS and no other language's files. | R25 |
| `L-de-R14` | The English catalogs are unchanged by this slice: a diff of `apps/ui/locales/en/**` against the pre-slice commit is empty. | R34 |
| `L-de-R15` | Every date, number and plural on screen with `de` active is produced by `Intl` with `de` as its locale, which slice I11 built; this slice adds no formatting code. | R38, R39 |

## States

- **Glossary filled** — the `de` column of `requirements/glossary.md` has no empty cell. This state is reached before any catalog key is written.
- **Catalogs written** — all eleven namespaces exist and parity passes.
- **Walked** — the acceptance walk below has been performed once by the seat and once by V, and the English-word list is empty both times.

## Copy and vocabulary

Register: Sie (formal) — German product UI convention outside consumer-social apps

Every glossary term uses its cell wording, in every namespace. Where the same English word appears in two namespaces it is one word here too. Where two English terms collapse into one word in this language, the seat records why in `DECISIONS.md` rather than letting it happen silently.

No brand mark, maker name, model identifier, glyph or keyboard shortcut is translated.

## Acceptance — V runs these in a browser

The dev stack is `https://localhost:3000`. This walk is identical for every language slice.

| # | Step | Expected observation |
|---|---|---|
| 1 | In a fresh private window open `https://localhost:3000/` and choose **Deutsch** from the language menu. | The landing page — eyebrow, headline, lede, both calls to action, the four method steps and the pricing line — reads entirely in Deutsch. The brand mark and the sample transcript's model identifiers are unchanged. |
| 2 | Right-click and choose View Page Source. | The first line contains `<html lang="de" dir="ltr"`. |
| 3 | Go to `/sign-up`, then `/verify-email`, then `/enroll-mfa`, then `/login`, and sign in. | Every label, hint, validation message and button on those four screens reads in Deutsch. Sign-in works. |
| 4 | Look at the library. | Tab labels, empty-state hints, card metadata and the relative age of each debate read in Deutsch, with Deutsch number formatting. |
| 5 | Open `/new` and read every field. | Every label, helper line and option reads in Deutsch, and the guide modal does too. |
| 6 | Open a debate and read the toolbar. | The toolbar, the four view buttons and the utility actions read in Deutsch. |
| 7 | Switch through Thread, Split, Tree and Map. | Every label, badge, counter and empty state in all four views reads in Deutsch. |
| 8 | Open the Honesty, node detail, Investigations and Workspace drawers in turn. | All four read in Deutsch, including the condition marks and abstention labels. |
| 9 | Look at the verdict banner, the synthesis panel and the publication control. | All three read in Deutsch. |
| 10 | Open `/settings` and read the session list and the deletion controls. | Both read in Deutsch, and the timestamps are formatted for Deutsch. |
| 11 | Open a published debate URL in a second private window with Deutsch chosen, then change the id to one that does not exist. | The public page and the not-found page both read in Deutsch. |
| 12 | Find any counter that can show one item and then several. | The noun takes the grammatically correct form for each count — one, other is the category set this language uses. |
| 13 | Walk the whole route list once more and write down every English word you see. | The list is empty, apart from the brand marks, maker names and model identifiers, which are the same in every language on purpose. |

## Out of scope

- Any TypeScript, CSS or configuration change — this slice writes JSON and one markdown column.
- Any other language's files.
- The English catalogs, which are frozen before this wave starts.
- Translating the debate content the models wrote (V-3).

## Owned files — exhaustive

| File | Contents |
|---|---|
| `apps/ui/locales/de/chrome.json` | the `chrome` namespace |
| `apps/ui/locales/de/auth.json` | the `auth` namespace |
| `apps/ui/locales/de/account.json` | the `account` namespace |
| `apps/ui/locales/de/landing.json` | the `landing` namespace |
| `apps/ui/locales/de/workspace.json` | the `workspace` namespace |
| `apps/ui/locales/de/views.json` | the `views` namespace |
| `apps/ui/locales/de/drawers.json` | the `drawers` namespace |
| `apps/ui/locales/de/panels.json` | the `panels` namespace |
| `apps/ui/locales/de/domain.json` | the `domain` namespace |
| `apps/ui/locales/de/public.json` | the `public` namespace |
| `apps/ui/locales/de/formats.json` | the `formats` namespace |
| `apps/ui/locales/de/identical-values.json` | keys whose Deutsch value is deliberately the English one, each with a reason |
| `docs/missions/translation/requirements/glossary.md` | **the `de` column only** — 61 cells |

The glossary is the one file every language slice writes. Sixteen seats editing sixteen disjoint columns of one markdown table is the mission's single shared-file risk: the orchestrator serialises the glossary commits, or each seat writes `requirements/glossary-de.md` and the orchestrator merges the columns. **That choice is ARCH-01's and it must be recorded before wave 5 dispatches** — it is the only place where the single-writer law is not satisfied by construction.

