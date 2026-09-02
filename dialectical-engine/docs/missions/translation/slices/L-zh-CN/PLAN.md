# L-zh-CN — 简体中文 · PLAN

**SCAFFOLD ONLY.** REQ-01 created this file. **ARCH-01 authors every step and every verification command.** A seat that finds a step cell empty stops and says so.

## The quantifiability law

Every step must be markable done or not-done by a stranger with no judgement call.

- WRONG: "improve the Spanish wording"
- RIGHT: "every value in `es/auth.json` uses `tú`, and a scan for `usted` returns zero hits outside `identical-values.json`"

**Banned words in any step or acceptance criterion: improve, better, robust, handle, appropriate.**

**Acceptance commands** are RUN by their author at authoring time and classified **BROKEN / GREEN / RED**, never by exit code alone. Commands live in fenced blocks, never in table cells.

## SPEC trace — one row per SPEC requirement

| SPEC id | Requirement (abbreviated) | PLAN steps | Cluster |
|---|---|---|---|
| `L-zh-CN-R01` | Every cell of the `zh-CN` column of `requirements/glossary.md` is filled — 61 terms, none empty — and committe… | | |
| `L-zh-CN-R02` | A term with no good equivalent in 简体中文 is written as `<english term> (kept)` in its glossary cell, so a kept w… | | |
| `L-zh-CN-R03` | All eleven namespace files exist under `apps/ui/locales/zh-CN/`: `chrome.json`, `auth.json`, `account.json`, `… | | |
| `L-zh-CN-R04` | For every namespace, the key set of `zh-CN` equals the English key set exactly: no key missing, no key extra. | | |
| `L-zh-CN-R05` | For every key, the set of `{placeholder}` names in the 简体中文 value equals the set in the English value. | | |
| `L-zh-CN-R06` | No value in any `zh-CN` namespace is the empty string or whitespace only. | | |
| `L-zh-CN-R07` | Every plural key carries exactly the CLDR cardinal categories `other` — read at test time from `Intl.PluralRul… | | |
| `L-zh-CN-R08` | Every glossary term renders with the wording in its `zh-CN` glossary cell, in every namespace: one English ter… | | |
| `L-zh-CN-R09` | No brand mark, maker name, model identifier, glyph or keyboard shortcut is translated: `Dialectical Engine`, `… | | |
| `L-zh-CN-R10` | Every 简体中文 value uses the register recorded for this language: plain 您-free register; use 您 only in account-se… | | |
| `L-zh-CN-R11` | With `zh-CN` active, no covered route renders an English catalog value as a complete text node or a complete a… | | |
| `L-zh-CN-R12` | `apps/ui/locales/zh-CN/identical-values.json` exists and every entry carries a reason; an entry with no reason… | | |
| `L-zh-CN-R13` | This slice writes only files under `apps/ui/locales/zh-CN/` and its own column of `requirements/glossary.md`; … | | |
| `L-zh-CN-R14` | The English catalogs are unchanged by this slice: a diff of `apps/ui/locales/en/**` against the pre-slice comm… | | |
| `L-zh-CN-R15` | Every date, number and plural on screen with `zh-CN` active is produced by `Intl` with `zh-CN` as its locale, … | | |
| `L-zh-CN-R16` | 简体中文 wraps between characters rather than at spaces; no value in this catalog relies on a space to break a lin… | | |

**Trace count: 16 requirements, 16 scaffold rows.**

## Clusters

**The three-run law:** each cluster's verification runs THREE times and the WORST run is the verdict.

### `L-zh-CN-C1` — glossary column filled

| Field | Value |
|---|---|
| PLAN steps it contains | |
| File surface | |
| Pre-fix state | |
| Run 1 / Run 2 / Run 3 | / / |

```sh
# ARCH-01 fills this.
```

### `L-zh-CN-C2` — catalogs written and parity green

| Field | Value |
|---|---|
| PLAN steps it contains | |
| File surface | |
| Pre-fix state | |
| Run 1 / Run 2 / Run 3 | / / |

```sh
# ARCH-01 fills this.
```

### `L-zh-CN-C3` — leak scan clean

| Field | Value |
|---|---|
| PLAN steps it contains | |
| File surface | |
| Pre-fix state | |
| Run 1 / Run 2 / Run 3 | / / |

```sh
# ARCH-01 fills this.
```

### `L-zh-CN-C4` — the walk

| Field | Value |
|---|---|
| PLAN steps it contains | |
| File surface | |
| Pre-fix state | |
| Run 1 / Run 2 / Run 3 | / / |

```sh
# ARCH-01 fills this.
```

