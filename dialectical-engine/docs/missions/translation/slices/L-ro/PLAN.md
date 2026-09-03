# L-ro — Română · PLAN

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
| `L-ro-R01` | Every cell of the `ro` column of `requirements/glossary.md` is filled — 61 terms, none empty — and committed B… | | |
| `L-ro-R02` | A term with no good equivalent in Română is written as `<english term> (kept)` in its glossary cell, so a kept… | | |
| `L-ro-R03` | All eleven namespace files exist under `apps/ui/locales/ro/`: `chrome.json`, `auth.json`, `account.json`, `lan… | | |
| `L-ro-R04` | For every namespace, the key set of `ro` equals the English key set exactly: no key missing, no key extra. | | |
| `L-ro-R05` | For every key, the set of `{placeholder}` names in the Română value equals the set in the English value. | | |
| `L-ro-R06` | No value in any `ro` namespace is the empty string or whitespace only. | | |
| `L-ro-R07` | Every plural key carries exactly the CLDR cardinal categories `one, few, other` — read at test time from `Intl… | | |
| `L-ro-R08` | Every glossary term renders with the wording in its `ro` glossary cell, in every namespace: one English term i… | | |
| `L-ro-R09` | No brand mark, maker name, model identifier, glyph or keyboard shortcut is translated: `Dialectical Engine`, `… | | |
| `L-ro-R10` | Every Română value uses the register recorded for this language: tu (informal) — the home market, and dezbater… | | |
| `L-ro-R11` | With `ro` active, no covered route renders an English catalog value as a complete text node or a complete attr… | | |
| `L-ro-R12` | `apps/ui/locales/ro/identical-values.json` exists and every entry carries a reason; an entry with no reason fa… | | |
| `L-ro-R13` | This slice writes only files under `apps/ui/locales/ro/` and its own column of `requirements/glossary.md`; it … | | |
| `L-ro-R14` | The English catalogs are unchanged by this slice: a diff of `apps/ui/locales/en/**` against the pre-slice comm… | | |
| `L-ro-R15` | Every date, number and plural on screen with `ro` active is produced by `Intl` with `ro` as its locale, which … | | |

**Trace count: 15 requirements, 15 scaffold rows.**

## Clusters

**The three-run law:** each cluster's verification runs THREE times and the WORST run is the verdict.

### `L-ro-C1` — glossary column filled

| Field | Value |
|---|---|
| PLAN steps it contains | |
| File surface | |
| Pre-fix state | |
| Run 1 / Run 2 / Run 3 | / / |

```sh
# ARCH-01 fills this.
```

### `L-ro-C2` — catalogs written and parity green

| Field | Value |
|---|---|
| PLAN steps it contains | |
| File surface | |
| Pre-fix state | |
| Run 1 / Run 2 / Run 3 | / / |

```sh
# ARCH-01 fills this.
```

### `L-ro-C3` — leak scan clean

| Field | Value |
|---|---|
| PLAN steps it contains | |
| File surface | |
| Pre-fix state | |
| Run 1 / Run 2 / Run 3 | / / |

```sh
# ARCH-01 fills this.
```

### `L-ro-C4` — the walk

| Field | Value |
|---|---|
| PLAN steps it contains | |
| File surface | |
| Pre-fix state | |
| Run 1 / Run 2 / Run 3 | / / |

```sh
# ARCH-01 fills this.
```

