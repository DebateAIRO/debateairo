# LANG-TEMPLATE — the master SPEC every language slice is generated from · SPEC

**This file is the master. Each language slice's `SPEC.md` is this document with that language's facts from `requirements/translation.md` §Q2 substituted, and nothing else changed.** The placeholders are `{CODE}`, `{NATIVE}`, `{ENGLISH}`, `{SCRIPT}`, `{DIR}`, `{CARD}`, `{ORD}`, `{NUM}`, `{REGISTER}`. Three requirements are conditional: the right-to-left requirement appears only for `ar` and `ur`, the no-space-wrapping requirement only for `zh-CN`, `ja` and `ko`, and the Turkish-casing requirement only for `tr`. The acceptance walk is identical for every language — the same thirteen steps in the same order — because a language that needs a different walk is a language whose slice is not comparable to the others.

**The facts substituted below are the `es` row, deliberately.** v1 of this file substituted the English row, which made four of its requirements degenerate — `-R01` asked for an `en` column that `glossary.md` does not have, `-R05` read "the placeholder names in the English value equal the set in the English value", `-R11` would have failed every key, and `-R14` ("a diff of `apps/ui/locales/en/**` is empty") contradicted `-R03` and `-R13`. A master that cannot be read for sense cannot do the one job its own header claims. Substituting a real target language fixes every one of those without changing a single requirement.

> **SPEC v2 — supersedes `SPEC-v1.md`, 2026-09-02, REQ-01 rework round 1.**
>
> Written in answer to the blind review `docs/missions/translation/reviews/REQ-REV-01.md`. A defect correction with no scope change; v1 is archived beside this file.
>
> **What changed:** N7 — the key-identity policy is now stated (one key per census site, not per distinct English string) and the key figure is the measured **1349**, replacing the unexplained "≈1360". B4 and N2 — 22 rows left the census, so every derived figure moved. N8 — the master is now instantiated with the `es` row rather than the English row, which had made four of its own requirements degenerate.

**FROZEN at creation, 2026-09-02, by REQ-01. No seat edits this file.**

Mission: `translation` · slice `LANG-TEMPLATE` · language **Español** (`es`, Spanish) · script Latn · direction ltr

## The language, measured

These values were read from ICU on Node v22.23.1 with full ICU on 2026-09-02, not recalled.

| Fact | Value |
|---|---|
| BCP-47 code | `es` |
| Native name, as the menu shows it | Español |
| English name | Spanish |
| Maximized script | Latn |
| Direction | ltr |
| CLDR cardinal plural categories | one, many, other |
| CLDR ordinal plural categories | other |
| Default numbering system | `latn` |
| Register | tú (informal) — the product is a personal reasoning instrument, not an institution; matches the English direct address |

## Intent

Author the complete Español catalog: all eleven namespaces, every key the English catalogs carry, in the register recorded above and the vocabulary recorded in this language's column of `requirements/glossary.md`. Nothing else — this slice writes no code.

**Key count: 1349.** One key per census site, not one key per distinct English string — the policy is stated with its reason in `requirements/translation.md` §Q1. The census carries 1349 sites and 1091 distinct texts; 153 English strings appear at more than one site and each site still gets its own key, because two sites rendering the same English word can need different words here (the English `Close` is a button in one place and a verb in a sentence in another). Consistency is enforced by the glossary rule, not by sharing keys.

## Requirements

| Id | Requirement | Traces to |
|---|---|---|
| `LANG-TEMPLATE-R01` | Every cell of the `es` column of `requirements/glossary.md` is filled — 61 terms, none empty — and committed BEFORE the first catalog key of this slice is translated. | R43 |
| `LANG-TEMPLATE-R02` | A term with no good equivalent in Español is written as `<english term> (kept)` in its glossary cell, so a kept word is a recorded decision and not a gap. | R43 |
| `LANG-TEMPLATE-R03` | All eleven namespace files exist under `apps/ui/locales/es/`: `chrome.json`, `auth.json`, `account.json`, `landing.json`, `workspace.json`, `views.json`, `drawers.json`, `panels.json`, `domain.json`, `public.json`, `formats.json`, and together they carry **1349 keys** — one per census site, per the key-identity policy in `requirements/translation.md` §Q1. | R25 |
| `LANG-TEMPLATE-R04` | For every namespace, the key set of `es` equals the English key set exactly: no key missing, no key extra. | R26 |
| `LANG-TEMPLATE-R05` | For every key, the set of `{placeholder}` names in the Español value equals the set in the English value. | R27 |
| `LANG-TEMPLATE-R06` | No value in any `es` namespace is the empty string or whitespace only. | R28 |
| `LANG-TEMPLATE-R07` | Every plural key carries exactly the CLDR cardinal categories `one, many, other` — read at test time from `Intl.PluralRules("es").resolvedOptions().pluralCategories`, not from a hand-written list — and carries no other category. | R40 |
| `LANG-TEMPLATE-R08` | Every glossary term renders with the wording in its `es` glossary cell, in every namespace: one English term is one Español word across the whole application. | R43 |
| `LANG-TEMPLATE-R09` | No brand mark, maker name, model identifier, glyph or keyboard shortcut is translated: `Dialectical Engine`, `DebateAI`, `dezbatere.ro`, `OpenAI`, `Anthropic`, `Google`, `gpt-*`, `claude-*`, `gemini-*` and the glyph set of R31 appear in `es` exactly as they appear in English. | R31, R33 |
| `LANG-TEMPLATE-R10` | Every Español value uses the register recorded for this language: tú (informal) — the product is a personal reasoning instrument, not an institution; matches the English direct address. A value in another register is a finding against this slice. | R43 |
| `LANG-TEMPLATE-R11` | With `es` active, no covered route renders an English catalog value as a complete text node or a complete attribute value, unless that key is listed in `apps/ui/locales/es/identical-values.json` with a one-line reason. | R36, R37 |
| `LANG-TEMPLATE-R12` | `apps/ui/locales/es/identical-values.json` exists and every entry carries a reason; an entry with no reason fails this slice. | R37 |
| `LANG-TEMPLATE-R13` | This slice writes only files under `apps/ui/locales/es/` and its own column of `requirements/glossary.md`; it writes no TypeScript, no CSS and no other language's files. | R25 |
| `LANG-TEMPLATE-R14` | The English catalogs are unchanged by this slice: a diff of `apps/ui/locales/en/**` against the pre-slice commit is empty. | R34 |
| `LANG-TEMPLATE-R15` | Every date, number and plural on screen with `es` active is produced by `Intl` with `es` as its locale, which slice I11 built; this slice adds no formatting code. | R38, R39 |

## States

- **Glossary filled** — the `es` column of `requirements/glossary.md` has no empty cell. This state is reached before any catalog key is written.
- **Catalogs written** — all eleven namespaces exist and parity passes.
- **Walked** — the acceptance walk below has been performed once by the seat and once by V, and the English-word list is empty both times.

## Copy and vocabulary

Register: tú (informal) — the product is a personal reasoning instrument, not an institution; matches the English direct address

Every glossary term uses its cell wording, in every namespace. Where the same English word appears in two namespaces it is one word here too. Where two English terms collapse into one word in this language, the seat records why in `DECISIONS.md` rather than letting it happen silently.

No brand mark, maker name, model identifier, glyph or keyboard shortcut is translated.

## Acceptance — V runs these in a browser

The dev stack is `https://localhost:3000`. This walk is identical for every language slice.

| # | Step | Expected observation |
|---|---|---|
| 1 | In a fresh private window open `https://localhost:3000/` and choose **Español** from the language menu. | The landing page — eyebrow, headline, lede, both calls to action, the four method steps and the pricing line — reads entirely in Español. The brand mark and the sample transcript's model identifiers are unchanged. |
| 2 | Right-click and choose View Page Source. | The first line contains `<html lang="es" dir="ltr"`. |
| 3 | Go to `/sign-up`, then `/verify-email`, then `/enroll-mfa`, then `/login`, and sign in. | Every label, hint, validation message and button on those four screens reads in Español. Sign-in works. |
| 4 | Look at the library. | Tab labels, empty-state hints, card metadata and the relative age of each debate read in Español, with Español number formatting. |
| 5 | Open `/new` and read every field. | Every label, helper line and option reads in Español, and the guide modal does too. |
| 6 | Open a debate and read the toolbar. | The toolbar, the four view buttons and the utility actions read in Español. |
| 7 | Switch through Thread, Split, Tree and Map. | Every label, badge, counter and empty state in all four views reads in Español. |
| 8 | Open the Honesty, node detail, Investigations and Workspace drawers in turn. | All four read in Español, including the condition marks and abstention labels. |
| 9 | Look at the verdict banner, the synthesis panel and the publication control. | All three read in Español. |
| 10 | Open `/settings` and read the session list and the deletion controls. | Both read in Español, and the timestamps are formatted for Español. |
| 11 | Open a published debate URL in a second private window with Español chosen, then change the id to one that does not exist. | The public page and the not-found page both read in Español. |
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
| `apps/ui/locales/es/chrome.json` | the `chrome` namespace |
| `apps/ui/locales/es/auth.json` | the `auth` namespace |
| `apps/ui/locales/es/account.json` | the `account` namespace |
| `apps/ui/locales/es/landing.json` | the `landing` namespace |
| `apps/ui/locales/es/workspace.json` | the `workspace` namespace |
| `apps/ui/locales/es/views.json` | the `views` namespace |
| `apps/ui/locales/es/drawers.json` | the `drawers` namespace |
| `apps/ui/locales/es/panels.json` | the `panels` namespace |
| `apps/ui/locales/es/domain.json` | the `domain` namespace |
| `apps/ui/locales/es/public.json` | the `public` namespace |
| `apps/ui/locales/es/formats.json` | the `formats` namespace |
| `apps/ui/locales/es/identical-values.json` | keys whose Español value is deliberately the English one, each with a reason |
| `docs/missions/translation/requirements/glossary.md` | **the `es` column only** — 61 cells |

The glossary is the one file every language slice writes. Sixteen seats editing sixteen disjoint columns of one markdown table is the mission's single shared-file risk: the orchestrator serialises the glossary commits, or each seat writes `requirements/glossary-es.md` and the orchestrator merges the columns. **That choice is ARCH-01's and it must be recorded before wave 5 dispatches** — it is the only place where the single-writer law is not satisfied by construction.

