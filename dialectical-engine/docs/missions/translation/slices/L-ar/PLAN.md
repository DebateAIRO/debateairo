# L-ar — العربية · PLAN

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
| `L-ar-R01` | Every cell of the `ar` column of `requirements/glossary.md` is filled — 61 terms, none empty — and committed B… | | |
| `L-ar-R02` | A term with no good equivalent in العربية is written as `<english term> (kept)` in its glossary cell, so a kep… | | |
| `L-ar-R03` | All eleven namespace files exist under `apps/ui/locales/ar/`: `chrome.json`, `auth.json`, `account.json`, `lan… | | |
| `L-ar-R04` | For every namespace, the key set of `ar` equals the English key set exactly: no key missing, no key extra. | | |
| `L-ar-R05` | For every key, the set of `{placeholder}` names in the العربية value equals the set in the English value. | | |
| `L-ar-R06` | No value in any `ar` namespace is the empty string or whitespace only. | | |
| `L-ar-R07` | Every plural key carries exactly the CLDR cardinal categories `zero, one, two, few, many, other` — read at tes… | | |
| `L-ar-R08` | Every glossary term renders with the wording in its `ar` glossary cell, in every namespace: one English term i… | | |
| `L-ar-R09` | No brand mark, maker name, model identifier, glyph or keyboard shortcut is translated: `Dialectical Engine`, `… | | |
| `L-ar-R10` | Every العربية value uses the register recorded for this language: Modern Standard Arabic, masculine singular أ… | | |
| `L-ar-R11` | With `ar` active, no covered route renders an English catalog value as a complete text node or a complete attr… | | |
| `L-ar-R12` | `apps/ui/locales/ar/identical-values.json` exists and every entry carries a reason; an entry with no reason fa… | | |
| `L-ar-R13` | This slice writes only files under `apps/ui/locales/ar/` and its own column of `requirements/glossary.md`; it … | | |
| `L-ar-R14` | The English catalogs are unchanged by this slice: a diff of `apps/ui/locales/en/**` against the pre-slice comm… | | |
| `L-ar-R15` | Every date, number and plural on screen with `ar` active is produced by `Intl` with `ar` as its locale, which … | | |
| `L-ar-R16` | With `ar` active the page mirrors — `<html dir="rtl">`, logical properties in effect, directional glyphs flipp… | | |

**Trace count: 16 requirements, 16 scaffold rows.**

## Clusters

**The three-run law:** each cluster's verification runs THREE times and the WORST run is the verdict.

### `L-ar-C1` — glossary column filled

| Field | Value |
|---|---|
| PLAN steps it contains | |
| File surface | |
| Pre-fix state | |
| Run 1 / Run 2 / Run 3 | / / |

```sh
# ARCH-01 fills this.
```

### `L-ar-C2` — catalogs written and parity green

| Field | Value |
|---|---|
| PLAN steps it contains | |
| File surface | |
| Pre-fix state | |
| Run 1 / Run 2 / Run 3 | / / |

```sh
# ARCH-01 fills this.
```

### `L-ar-C3` — leak scan clean

| Field | Value |
|---|---|
| PLAN steps it contains | |
| File surface | |
| Pre-fix state | |
| Run 1 / Run 2 / Run 3 | / / |

```sh
# ARCH-01 fills this.
```

### `L-ar-C4` — the walk

| Field | Value |
|---|---|
| PLAN steps it contains | |
| File surface | |
| Pre-fix state | |
| Run 1 / Run 2 / Run 3 | / / |

```sh
# ARCH-01 fills this.
```

