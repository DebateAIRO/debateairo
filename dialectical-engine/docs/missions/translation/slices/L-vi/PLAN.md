# L-vi — Tiếng Việt · PLAN

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
| `L-vi-R01` | Every cell of the `vi` column of `requirements/glossary.md` is filled — 61 terms, none empty — and committed B… | | |
| `L-vi-R02` | A term with no good equivalent in Tiếng Việt is written as `<english term> (kept)` in its glossary cell, so a … | | |
| `L-vi-R03` | All eleven namespace files exist under `apps/ui/locales/vi/`: `chrome.json`, `auth.json`, `account.json`, `lan… | | |
| `L-vi-R04` | For every namespace, the key set of `vi` equals the English key set exactly: no key missing, no key extra. | | |
| `L-vi-R05` | For every key, the set of `{placeholder}` names in the Tiếng Việt value equals the set in the English value. | | |
| `L-vi-R06` | No value in any `vi` namespace is the empty string or whitespace only. | | |
| `L-vi-R07` | Every plural key carries exactly the CLDR cardinal categories `other` — read at test time from `Intl.PluralRul… | | |
| `L-vi-R08` | Every glossary term renders with the wording in its `vi` glossary cell, in every namespace: one English term i… | | |
| `L-vi-R09` | No brand mark, maker name, model identifier, glyph or keyboard shortcut is translated: `Dialectical Engine`, `… | | |
| `L-vi-R10` | Every Tiếng Việt value uses the register recorded for this language: bạn (neutral second person) — the standar… | | |
| `L-vi-R11` | With `vi` active, no covered route renders an English catalog value as a complete text node or a complete attr… | | |
| `L-vi-R12` | `apps/ui/locales/vi/identical-values.json` exists and every entry carries a reason; an entry with no reason fa… | | |
| `L-vi-R13` | This slice writes only files under `apps/ui/locales/vi/` and its own column of `requirements/glossary.md`; it … | | |
| `L-vi-R14` | The English catalogs are unchanged by this slice: a diff of `apps/ui/locales/en/**` against the pre-slice comm… | | |
| `L-vi-R15` | Every date, number and plural on screen with `vi` active is produced by `Intl` with `vi` as its locale, which … | | |

**Trace count: 15 requirements, 15 scaffold rows.**

## Clusters

**The three-run law:** each cluster's verification runs THREE times and the WORST run is the verdict.

### `L-vi-C1` — glossary column filled

| Field | Value |
|---|---|
| PLAN steps it contains | |
| File surface | |
| Pre-fix state | |
| Run 1 / Run 2 / Run 3 | / / |

```sh
# ARCH-01 fills this.
```

### `L-vi-C2` — catalogs written and parity green

| Field | Value |
|---|---|
| PLAN steps it contains | |
| File surface | |
| Pre-fix state | |
| Run 1 / Run 2 / Run 3 | / / |

```sh
# ARCH-01 fills this.
```

### `L-vi-C3` — leak scan clean

| Field | Value |
|---|---|
| PLAN steps it contains | |
| File surface | |
| Pre-fix state | |
| Run 1 / Run 2 / Run 3 | / / |

```sh
# ARCH-01 fills this.
```

### `L-vi-C4` — the walk

| Field | Value |
|---|---|
| PLAN steps it contains | |
| File surface | |
| Pre-fix state | |
| Run 1 / Run 2 / Run 3 | / / |

```sh
# ARCH-01 fills this.
```

