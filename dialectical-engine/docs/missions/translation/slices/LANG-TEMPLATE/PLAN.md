# LANG-TEMPLATE · PLAN

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
| `LANG-TEMPLATE-R01` | Every cell of the `es` column of `requirements/glossary.md` is filled — 61 terms, none empty — and committed B… | | |
| `LANG-TEMPLATE-R02` | A term with no good equivalent in Español is written as `<english term> (kept)` in its glossary cell, so a kep… | | |
| `LANG-TEMPLATE-R03` | All eleven namespace files exist under `apps/ui/locales/es/`: `chrome.json`, `auth.json`, `account.json`, `lan… | | |
| `LANG-TEMPLATE-R04` | For every namespace, the key set of `es` equals the English key set exactly: no key missing, no key extra. | | |
| `LANG-TEMPLATE-R05` | For every key, the set of `{placeholder}` names in the Español value equals the set in the English value. | | |
| `LANG-TEMPLATE-R06` | No value in any `es` namespace is the empty string or whitespace only. | | |
| `LANG-TEMPLATE-R07` | Every plural key carries exactly the CLDR cardinal categories `one, many, other` — read at test time from `Int… | | |
| `LANG-TEMPLATE-R08` | Every glossary term renders with the wording in its `es` glossary cell, in every namespace: one English term i… | | |
| `LANG-TEMPLATE-R09` | No brand mark, maker name, model identifier, glyph or keyboard shortcut is translated: `Dialectical Engine`, `… | | |
| `LANG-TEMPLATE-R10` | Every Español value uses the register recorded for this language: tú (informal) — the product is a personal re… | | |
| `LANG-TEMPLATE-R11` | With `es` active, no covered route renders an English catalog value as a complete text node or a complete attr… | | |
| `LANG-TEMPLATE-R12` | `apps/ui/locales/es/identical-values.json` exists and every entry carries a reason; an entry with no reason fa… | | |
| `LANG-TEMPLATE-R13` | This slice writes only files under `apps/ui/locales/es/` and its own column of `requirements/glossary.md`; it … | | |
| `LANG-TEMPLATE-R14` | The English catalogs are unchanged by this slice: a diff of `apps/ui/locales/en/**` against the pre-slice comm… | | |
| `LANG-TEMPLATE-R15` | Every date, number and plural on screen with `es` active is produced by `Intl` with `es` as its locale, which … | | |

**Trace count: 15 requirements, 15 scaffold rows.**

## Clusters

**The three-run law:** each cluster's verification runs THREE times and the WORST run is the verdict.

### `LANG-TEMPLATE-C1` — glossary column filled

| Field | Value |
|---|---|
| PLAN steps it contains | |
| File surface | |
| Pre-fix state | |
| Run 1 / Run 2 / Run 3 | / / |

```sh
# ARCH-01 fills this.
```

### `LANG-TEMPLATE-C2` — catalogs written and parity green

| Field | Value |
|---|---|
| PLAN steps it contains | |
| File surface | |
| Pre-fix state | |
| Run 1 / Run 2 / Run 3 | / / |

```sh
# ARCH-01 fills this.
```

### `LANG-TEMPLATE-C3` — leak scan clean

| Field | Value |
|---|---|
| PLAN steps it contains | |
| File surface | |
| Pre-fix state | |
| Run 1 / Run 2 / Run 3 | / / |

```sh
# ARCH-01 fills this.
```

### `LANG-TEMPLATE-C4` — the walk

| Field | Value |
|---|---|
| PLAN steps it contains | |
| File surface | |
| Pre-fix state | |
| Run 1 / Run 2 / Run 3 | / / |

```sh
# ARCH-01 fills this.
```

