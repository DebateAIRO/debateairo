# L-ja — 日本語 · PLAN

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
| `L-ja-R01` | Every cell of the `ja` column of `requirements/glossary.md` is filled — 61 terms, none empty — and committed B… | | |
| `L-ja-R02` | A term with no good equivalent in 日本語 is written as `<english term> (kept)` in its glossary cell, so a kept wo… | | |
| `L-ja-R03` | All eleven namespace files exist under `apps/ui/locales/ja/`: `chrome.json`, `auth.json`, `account.json`, `lan… | | |
| `L-ja-R04` | For every namespace, the key set of `ja` equals the English key set exactly: no key missing, no key extra. | | |
| `L-ja-R05` | For every key, the set of `{placeholder}` names in the 日本語 value equals the set in the English value. | | |
| `L-ja-R06` | No value in any `ja` namespace is the empty string or whitespace only. | | |
| `L-ja-R07` | Every plural key carries exactly the CLDR cardinal categories `other` — read at test time from `Intl.PluralRul… | | |
| `L-ja-R08` | Every glossary term renders with the wording in its `ja` glossary cell, in every namespace: one English term i… | | |
| `L-ja-R09` | No brand mark, maker name, model identifier, glyph or keyboard shortcut is translated: `Dialectical Engine`, `… | | |
| `L-ja-R10` | Every 日本語 value uses the register recorded for this language: です・ます polite form; no 敬語 honorifics, no 体言止め for… | | |
| `L-ja-R11` | With `ja` active, no covered route renders an English catalog value as a complete text node or a complete attr… | | |
| `L-ja-R12` | `apps/ui/locales/ja/identical-values.json` exists and every entry carries a reason; an entry with no reason fa… | | |
| `L-ja-R13` | This slice writes only files under `apps/ui/locales/ja/` and its own column of `requirements/glossary.md`; it … | | |
| `L-ja-R14` | The English catalogs are unchanged by this slice: a diff of `apps/ui/locales/en/**` against the pre-slice comm… | | |
| `L-ja-R15` | Every date, number and plural on screen with `ja` active is produced by `Intl` with `ja` as its locale, which … | | |
| `L-ja-R16` | 日本語 wraps between characters rather than at spaces; no value in this catalog relies on a space to break a line… | | |

**Trace count: 16 requirements, 16 scaffold rows.**

## Clusters

**The three-run law:** each cluster's verification runs THREE times and the WORST run is the verdict.

### `L-ja-C1` — glossary column filled

| Field | Value |
|---|---|
| PLAN steps it contains | |
| File surface | |
| Pre-fix state | |
| Run 1 / Run 2 / Run 3 | / / |

```sh
# ARCH-01 fills this.
```

### `L-ja-C2` — catalogs written and parity green

| Field | Value |
|---|---|
| PLAN steps it contains | |
| File surface | |
| Pre-fix state | |
| Run 1 / Run 2 / Run 3 | / / |

```sh
# ARCH-01 fills this.
```

### `L-ja-C3` — leak scan clean

| Field | Value |
|---|---|
| PLAN steps it contains | |
| File surface | |
| Pre-fix state | |
| Run 1 / Run 2 / Run 3 | / / |

```sh
# ARCH-01 fills this.
```

### `L-ja-C4` — the walk

| Field | Value |
|---|---|
| PLAN steps it contains | |
| File surface | |
| Pre-fix state | |
| Run 1 / Run 2 / Run 3 | / / |

```sh
# ARCH-01 fills this.
```

