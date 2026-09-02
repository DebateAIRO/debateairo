# L-pt-BR — Português (Brasil) (Portuguese (Brazil)) · SPEC

> **SPEC v2 — supersedes `SPEC-v1.md`, 2026-09-02, REQ-01 rework round 1.**
>
> Written in answer to the blind review `docs/missions/translation/reviews/REQ-REV-01.md`. A defect correction with no scope change; v1 is archived beside this file.
>
> **What changed:** N7 — the key-identity policy is now stated (one key per census site, not per distinct English string) and the key figure is the measured **1349**, replacing the unexplained "≈1360". B4 and N2 — 22 rows left the census, so every derived figure moved.

**FROZEN at creation, 2026-09-02, by REQ-01. No seat edits this file.**

Mission: `translation` · slice `L-pt-BR` · language **Português (Brasil)** (`pt-BR`, Portuguese (Brazil)) · script Latn · direction ltr

## The language, measured

These values were read from ICU on Node v22.23.1 with full ICU on 2026-09-02, not recalled.

| Fact | Value |
|---|---|
| BCP-47 code | `pt-BR` |
| Native name, as the menu shows it | Português (Brasil) |
| English name | Portuguese (Brazil) |
| Maximized script | Latn |
| Direction | ltr |
| CLDR cardinal plural categories | one, many, other |
| CLDR ordinal plural categories | other |
| Default numbering system | `latn` |
| Register | você (standard Brazilian address, neither formal nor familiar) |

## Intent

Author the complete Português (Brasil) catalog: all eleven namespaces, every key the English catalogs carry, in the register recorded above and the vocabulary recorded in this language's column of `requirements/glossary.md`. Nothing else — this slice writes no code.

**Key count: 1349.** One key per census site, not one key per distinct English string — the policy is stated with its reason in `requirements/translation.md` §Q1. The census carries 1349 sites and 1091 distinct texts; 153 English strings appear at more than one site and each site still gets its own key, because two sites rendering the same English word can need different words here (the English `Close` is a button in one place and a verb in a sentence in another). Consistency is enforced by the glossary rule, not by sharing keys.

## Requirements

| Id | Requirement | Traces to |
|---|---|---|
| `L-pt-BR-R01` | Every cell of the `pt-BR` column of `requirements/glossary.md` is filled — 61 terms, none empty — and committed BEFORE the first catalog key of this slice is translated. | R43 |
| `L-pt-BR-R02` | A term with no good equivalent in Português (Brasil) is written as `<english term> (kept)` in its glossary cell, so a kept word is a recorded decision and not a gap. | R43 |
| `L-pt-BR-R03` | All eleven namespace files exist under `apps/ui/locales/pt-BR/`: `chrome.json`, `auth.json`, `account.json`, `landing.json`, `workspace.json`, `views.json`, `drawers.json`, `panels.json`, `domain.json`, `public.json`, `formats.json`, and together they carry **1349 keys** — one per census site, per the key-identity policy in `requirements/translation.md` §Q1. | R25 |
| `L-pt-BR-R04` | For every namespace, the key set of `pt-BR` equals the English key set exactly: no key missing, no key extra. | R26 |
| `L-pt-BR-R05` | For every key, the set of `{placeholder}` names in the Português (Brasil) value equals the set in the English value. | R27 |
| `L-pt-BR-R06` | No value in any `pt-BR` namespace is the empty string or whitespace only. | R28 |
| `L-pt-BR-R07` | Every plural key carries exactly the CLDR cardinal categories `one, many, other` — read at test time from `Intl.PluralRules("pt-BR").resolvedOptions().pluralCategories`, not from a hand-written list — and carries no other category. | R40 |
| `L-pt-BR-R08` | Every glossary term renders with the wording in its `pt-BR` glossary cell, in every namespace: one English term is one Português (Brasil) word across the whole application. | R43 |
| `L-pt-BR-R09` | No brand mark, maker name, model identifier, glyph or keyboard shortcut is translated: `Dialectical Engine`, `DebateAI`, `dezbatere.ro`, `OpenAI`, `Anthropic`, `Google`, `gpt-*`, `claude-*`, `gemini-*` and the glyph set of R31 appear in `pt-BR` exactly as they appear in English. | R31, R33 |
| `L-pt-BR-R10` | Every Português (Brasil) value uses the register recorded for this language: você (standard Brazilian address, neither formal nor familiar). A value in another register is a finding against this slice. | R43 |
| `L-pt-BR-R11` | With `pt-BR` active, no covered route renders an English catalog value as a complete text node or a complete attribute value, unless that key is listed in `apps/ui/locales/pt-BR/identical-values.json` with a one-line reason. | R36, R37 |
| `L-pt-BR-R12` | `apps/ui/locales/pt-BR/identical-values.json` exists and every entry carries a reason; an entry with no reason fails this slice. | R37 |
| `L-pt-BR-R13` | This slice writes only files under `apps/ui/locales/pt-BR/` and its own column of `requirements/glossary.md`; it writes no TypeScript, no CSS and no other language's files. | R25 |
| `L-pt-BR-R14` | The English catalogs are unchanged by this slice: a diff of `apps/ui/locales/en/**` against the pre-slice commit is empty. | R34 |
| `L-pt-BR-R15` | Every date, number and plural on screen with `pt-BR` active is produced by `Intl` with `pt-BR` as its locale, which slice I11 built; this slice adds no formatting code. | R38, R39 |

## States

- **Glossary filled** — the `pt-BR` column of `requirements/glossary.md` has no empty cell. This state is reached before any catalog key is written.
- **Catalogs written** — all eleven namespaces exist and parity passes.
- **Walked** — the acceptance walk below has been performed once by the seat and once by V, and the English-word list is empty both times.

## Copy and vocabulary

Register: você (standard Brazilian address, neither formal nor familiar)

Every glossary term uses its cell wording, in every namespace. Where the same English word appears in two namespaces it is one word here too. Where two English terms collapse into one word in this language, the seat records why in `DECISIONS.md` rather than letting it happen silently.

No brand mark, maker name, model identifier, glyph or keyboard shortcut is translated.

## Acceptance — V runs these in a browser

The dev stack is `https://localhost:3000`. This walk is identical for every language slice.

| # | Step | Expected observation |
|---|---|---|
| 1 | In a fresh private window open `https://localhost:3000/` and choose **Português (Brasil)** from the language menu. | The landing page — eyebrow, headline, lede, both calls to action, the four method steps and the pricing line — reads entirely in Português (Brasil). The brand mark and the sample transcript's model identifiers are unchanged. |
| 2 | Right-click and choose View Page Source. | The first line contains `<html lang="pt-BR" dir="ltr"`. |
| 3 | Go to `/sign-up`, then `/verify-email`, then `/enroll-mfa`, then `/login`, and sign in. | Every label, hint, validation message and button on those four screens reads in Português (Brasil). Sign-in works. |
| 4 | Look at the library. | Tab labels, empty-state hints, card metadata and the relative age of each debate read in Português (Brasil), with Português (Brasil) number formatting. |
| 5 | Open `/new` and read every field. | Every label, helper line and option reads in Português (Brasil), and the guide modal does too. |
| 6 | Open a debate and read the toolbar. | The toolbar, the four view buttons and the utility actions read in Português (Brasil). |
| 7 | Switch through Thread, Split, Tree and Map. | Every label, badge, counter and empty state in all four views reads in Português (Brasil). |
| 8 | Open the Honesty, node detail, Investigations and Workspace drawers in turn. | All four read in Português (Brasil), including the condition marks and abstention labels. |
| 9 | Look at the verdict banner, the synthesis panel and the publication control. | All three read in Português (Brasil). |
| 10 | Open `/settings` and read the session list and the deletion controls. | Both read in Português (Brasil), and the timestamps are formatted for Português (Brasil). |
| 11 | Open a published debate URL in a second private window with Português (Brasil) chosen, then change the id to one that does not exist. | The public page and the not-found page both read in Português (Brasil). |
| 12 | Find any counter that can show one item and then several. | The noun takes the grammatically correct form for each count — one, many, other is the category set this language uses. |
| 13 | Walk the whole route list once more and write down every English word you see. | The list is empty, apart from the brand marks, maker names and model identifiers, which are the same in every language on purpose. |

## Out of scope

- Any TypeScript, CSS or configuration change — this slice writes JSON and one markdown column.
- Any other language's files.
- The English catalogs, which are frozen before this wave starts.
- Translating the debate content the models wrote (V-3).

## Owned files — exhaustive

| File | Contents |
|---|---|
| `apps/ui/locales/pt-BR/chrome.json` | the `chrome` namespace |
| `apps/ui/locales/pt-BR/auth.json` | the `auth` namespace |
| `apps/ui/locales/pt-BR/account.json` | the `account` namespace |
| `apps/ui/locales/pt-BR/landing.json` | the `landing` namespace |
| `apps/ui/locales/pt-BR/workspace.json` | the `workspace` namespace |
| `apps/ui/locales/pt-BR/views.json` | the `views` namespace |
| `apps/ui/locales/pt-BR/drawers.json` | the `drawers` namespace |
| `apps/ui/locales/pt-BR/panels.json` | the `panels` namespace |
| `apps/ui/locales/pt-BR/domain.json` | the `domain` namespace |
| `apps/ui/locales/pt-BR/public.json` | the `public` namespace |
| `apps/ui/locales/pt-BR/formats.json` | the `formats` namespace |
| `apps/ui/locales/pt-BR/identical-values.json` | keys whose Português (Brasil) value is deliberately the English one, each with a reason |
| `docs/missions/translation/requirements/glossary.md` | **the `pt-BR` column only** — 61 cells |

The glossary is the one file every language slice writes. Sixteen seats editing sixteen disjoint columns of one markdown table is the mission's single shared-file risk: the orchestrator serialises the glossary commits, or each seat writes `requirements/glossary-pt-BR.md` and the orchestrator merges the columns. **That choice is ARCH-01's and it must be recorded before wave 5 dispatches** — it is the only place where the single-writer law is not satisfied by construction.

