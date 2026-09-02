# L-ko — 한국어 · PLAN

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
| `L-ko-R01` | Every cell of the `ko` column of `requirements/glossary.md` is filled — 61 terms, none empty — and committed B… | | |
| `L-ko-R02` | A term with no good equivalent in 한국어 is written as `<english term> (kept)` in its glossary cell, so a kept wo… | | |
| `L-ko-R03` | All eleven namespace files exist under `apps/ui/locales/ko/`: `chrome.json`, `auth.json`, `account.json`, `lan… | | |
| `L-ko-R04` | For every namespace, the key set of `ko` equals the English key set exactly: no key missing, no key extra. | | |
| `L-ko-R05` | For every key, the set of `{placeholder}` names in the 한국어 value equals the set in the English value. | | |
| `L-ko-R06` | No value in any `ko` namespace is the empty string or whitespace only. | | |
| `L-ko-R07` | Every plural key carries exactly the CLDR cardinal categories `other` — read at test time from `Intl.PluralRul… | | |
| `L-ko-R08` | Every glossary term renders with the wording in its `ko` glossary cell, in every namespace: one English term i… | | |
| `L-ko-R09` | No brand mark, maker name, model identifier, glyph or keyboard shortcut is translated: `Dialectical Engine`, `… | | |
| `L-ko-R10` | Every 한국어 value uses the register recorded for this language: 해요체 polite (…해요/…하세요); not 하십시오체, which reads as… | | |
| `L-ko-R11` | With `ko` active, no covered route renders an English catalog value as a complete text node or a complete attr… | | |
| `L-ko-R12` | `apps/ui/locales/ko/identical-values.json` exists and every entry carries a reason; an entry with no reason fa… | | |
| `L-ko-R13` | This slice writes only files under `apps/ui/locales/ko/` and its own column of `requirements/glossary.md`; it … | | |
| `L-ko-R14` | The English catalogs are unchanged by this slice: a diff of `apps/ui/locales/en/**` against the pre-slice comm… | | |
| `L-ko-R15` | Every date, number and plural on screen with `ko` active is produced by `Intl` with `ko` as its locale, which … | | |
| `L-ko-R16` | 한국어 wraps between characters rather than at spaces; no value in this catalog relies on a space to break a line… | | |

**Trace count: 16 requirements, 16 scaffold rows.**

## Clusters

**The three-run law:** each cluster's verification runs THREE times and the WORST run is the verdict.

### `L-ko-C1` — glossary column filled

| Field | Value |
|---|---|
| PLAN steps it contains | |
| File surface | |
| Pre-fix state | |
| Run 1 / Run 2 / Run 3 | / / |

```sh
# ARCH-01 fills this.
```

### `L-ko-C2` — catalogs written and parity green

| Field | Value |
|---|---|
| PLAN steps it contains | |
| File surface | |
| Pre-fix state | |
| Run 1 / Run 2 / Run 3 | / / |

```sh
# ARCH-01 fills this.
```

### `L-ko-C3` — leak scan clean

| Field | Value |
|---|---|
| PLAN steps it contains | |
| File surface | |
| Pre-fix state | |
| Run 1 / Run 2 / Run 3 | / / |

```sh
# ARCH-01 fills this.
```

### `L-ko-C4` — the walk

| Field | Value |
|---|---|
| PLAN steps it contains | |
| File surface | |
| Pre-fix state | |
| Run 1 / Run 2 / Run 3 | / / |

```sh
# ARCH-01 fills this.
```

