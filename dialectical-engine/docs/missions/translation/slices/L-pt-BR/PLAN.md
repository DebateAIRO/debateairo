# L-pt-BR — Português (Brasil) · PLAN

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
| `L-pt-BR-R01` | Every cell of the `pt-BR` column of `requirements/glossary.md` is filled — 61 terms, none empty — and committe… | | |
| `L-pt-BR-R02` | A term with no good equivalent in Português (Brasil) is written as `<english term> (kept)` in its glossary cel… | | |
| `L-pt-BR-R03` | All eleven namespace files exist under `apps/ui/locales/pt-BR/`: `chrome.json`, `auth.json`, `account.json`, `… | | |
| `L-pt-BR-R04` | For every namespace, the key set of `pt-BR` equals the English key set exactly: no key missing, no key extra. | | |
| `L-pt-BR-R05` | For every key, the set of `{placeholder}` names in the Português (Brasil) value equals the set in the English … | | |
| `L-pt-BR-R06` | No value in any `pt-BR` namespace is the empty string or whitespace only. | | |
| `L-pt-BR-R07` | Every plural key carries exactly the CLDR cardinal categories `one, many, other` — read at test time from `Int… | | |
| `L-pt-BR-R08` | Every glossary term renders with the wording in its `pt-BR` glossary cell, in every namespace: one English ter… | | |
| `L-pt-BR-R09` | No brand mark, maker name, model identifier, glyph or keyboard shortcut is translated: `Dialectical Engine`, `… | | |
| `L-pt-BR-R10` | Every Português (Brasil) value uses the register recorded for this language: você (standard Brazilian address,… | | |
| `L-pt-BR-R11` | With `pt-BR` active, no covered route renders an English catalog value as a complete text node or a complete a… | | |
| `L-pt-BR-R12` | `apps/ui/locales/pt-BR/identical-values.json` exists and every entry carries a reason; an entry with no reason… | | |
| `L-pt-BR-R13` | This slice writes only files under `apps/ui/locales/pt-BR/` and its own column of `requirements/glossary.md`; … | | |
| `L-pt-BR-R14` | The English catalogs are unchanged by this slice: a diff of `apps/ui/locales/en/**` against the pre-slice comm… | | |
| `L-pt-BR-R15` | Every date, number and plural on screen with `pt-BR` active is produced by `Intl` with `pt-BR` as its locale, … | | |

**Trace count: 15 requirements, 15 scaffold rows.**

## Clusters

**The three-run law:** each cluster's verification runs THREE times and the WORST run is the verdict.

### `L-pt-BR-C1` — glossary column filled

| Field | Value |
|---|---|
| PLAN steps it contains | |
| File surface | |
| Pre-fix state | |
| Run 1 / Run 2 / Run 3 | / / |

```sh
# ARCH-01 fills this.
```

### `L-pt-BR-C2` — catalogs written and parity green

| Field | Value |
|---|---|
| PLAN steps it contains | |
| File surface | |
| Pre-fix state | |
| Run 1 / Run 2 / Run 3 | / / |

```sh
# ARCH-01 fills this.
```

### `L-pt-BR-C3` — leak scan clean

| Field | Value |
|---|---|
| PLAN steps it contains | |
| File surface | |
| Pre-fix state | |
| Run 1 / Run 2 / Run 3 | / / |

```sh
# ARCH-01 fills this.
```

### `L-pt-BR-C4` — the walk

| Field | Value |
|---|---|
| PLAN steps it contains | |
| File surface | |
| Pre-fix state | |
| Run 1 / Run 2 / Run 3 | / / |

```sh
# ARCH-01 fills this.
```

