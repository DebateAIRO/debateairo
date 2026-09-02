# L-es — Español · PLAN

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
| `L-es-R01` | Every cell of the `es` column of `requirements/glossary.md` is filled — 61 terms, none empty — and committed B… | | |
| `L-es-R02` | A term with no good equivalent in Español is written as `<english term> (kept)` in its glossary cell, so a kep… | | |
| `L-es-R03` | All eleven namespace files exist under `apps/ui/locales/es/`: `chrome.json`, `auth.json`, `account.json`, `lan… | | |
| `L-es-R04` | For every namespace, the key set of `es` equals the English key set exactly: no key missing, no key extra. | | |
| `L-es-R05` | For every key, the set of `{placeholder}` names in the Español value equals the set in the English value. | | |
| `L-es-R06` | No value in any `es` namespace is the empty string or whitespace only. | | |
| `L-es-R07` | Every plural key carries exactly the CLDR cardinal categories `one, many, other` — read at test time from `Int… | | |
| `L-es-R08` | Every glossary term renders with the wording in its `es` glossary cell, in every namespace: one English term i… | | |
| `L-es-R09` | No brand mark, maker name, model identifier, glyph or keyboard shortcut is translated: `Dialectical Engine`, `… | | |
| `L-es-R10` | Every Español value uses the register recorded for this language: tú (informal) — the product is a personal re… | | |
| `L-es-R11` | With `es` active, no covered route renders an English catalog value as a complete text node or a complete attr… | | |
| `L-es-R12` | `apps/ui/locales/es/identical-values.json` exists and every entry carries a reason; an entry with no reason fa… | | |
| `L-es-R13` | This slice writes only files under `apps/ui/locales/es/` and its own column of `requirements/glossary.md`; it … | | |
| `L-es-R14` | The English catalogs are unchanged by this slice: a diff of `apps/ui/locales/en/**` against the pre-slice comm… | | |
| `L-es-R15` | Every date, number and plural on screen with `es` active is produced by `Intl` with `es` as its locale, which … | | |

**Trace count: 15 requirements, 15 scaffold rows.**

## Clusters

**The three-run law:** each cluster's verification runs THREE times and the WORST run is the verdict.

### `L-es-C1` — glossary column filled

| Field | Value |
|---|---|
| PLAN steps it contains | |
| File surface | |
| Pre-fix state | |
| Run 1 / Run 2 / Run 3 | / / |

```sh
# ARCH-01 fills this.
```

### `L-es-C2` — catalogs written and parity green

| Field | Value |
|---|---|
| PLAN steps it contains | |
| File surface | |
| Pre-fix state | |
| Run 1 / Run 2 / Run 3 | / / |

```sh
# ARCH-01 fills this.
```

### `L-es-C3` — leak scan clean

| Field | Value |
|---|---|
| PLAN steps it contains | |
| File surface | |
| Pre-fix state | |
| Run 1 / Run 2 / Run 3 | / / |

```sh
# ARCH-01 fills this.
```

### `L-es-C4` — the walk

| Field | Value |
|---|---|
| PLAN steps it contains | |
| File surface | |
| Pre-fix state | |
| Run 1 / Run 2 / Run 3 | / / |

```sh
# ARCH-01 fills this.
```

