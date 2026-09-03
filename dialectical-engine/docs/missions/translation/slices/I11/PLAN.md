# I11 — Locale formatting and right-to-left · PLAN

**SCAFFOLD ONLY.** REQ-01 created this file with the trace skeleton, the law and the cluster headers. **The architecture seat (ARCH-01) authors every step and every verification command.** A worker that finds a step cell empty stops and says so — it does not invent the step.

Slice `I11` · SPEC: `docs/missions/translation/slices/I11/SPEC.md` (frozen) · census 15 strings

## The quantifiability law

Every step must be markable done or not-done by a stranger with no judgement call.

- WRONG: "improve error handling"
- RIGHT: "requests with a missing id return 400 with a message, and the test asserting this passes"

**Banned words in any step or acceptance criterion: improve, better, robust, handle, appropriate.** They mean the decision is not finished. A step a stranger cannot mark done or not-done with no judgement call is not a step — split it until they can.

**Acceptance commands.** Every command in this file is RUN by its author at authoring time and classified **BROKEN / GREEN / RED**, never by exit code alone. Grep the output for `startup error`, `unexpected argument`, `failed to load`, `usage:`, `command not found`, `cannot find module`, `no test files found`, `0 passed (0)` before calling anything RED. Capture first, then assert — never put a test runner upstream of a live `grep -q` pipe. Do not store a command inside a markdown table cell: the escaped `\|` a table forces is not a shell pipe. Use a fenced block under the cluster.

## SPEC trace — one row per SPEC requirement

| SPEC id | Requirement (abbreviated) | PLAN steps | Cluster |
|---|---|---|---|
| `I11-R01` | Each of the **12 user-visible formatting sites** listed in `requirements/census.md` §(g) passes the active lan… | | |
| `I11-R02` | `lib/format.ts:relativeTime` is rewritten on `Intl.RelativeTimeFormat` with the active language and produces t… | | |
| `I11-R03` | Each of the 24 hand-made plural lines listed in `requirements/census.md` §(e) selects its form through `Intl.P… | | |
| `I11-R04` | A plural key in language X carries exactly the CLDR cardinal categories that `Intl.PluralRules(X).resolvedOpti… | | |
| `I11-R05` | R41's closing set is exactly these sites and no others: `lib/v3/adapter.ts:363-368` (percentage by concatenati… | | |
| `I11-R06` | Every case transform applied to user-visible text passes the active language, so Turkish `i` uppercases to `İ`… | | |
| `I11-R07` | All 79 physical direction declarations in `apps/ui/app/globals.css` listed in `requirements/census.md` are log… | | |
| `I11-R08` | With `ar` or `ur` active, `→` renders as `←` and the back arrow flips, by a mechanism that reads the active di… | | |
| `I11-R09` | Numbers, model identifiers and brand marks stay left-to-right inside right-to-left text and are not visually r… | | |
| `I11-R10` | Each non-Latin script has a declared system fallback stack in `globals.css` and no font file is added to the r… | | |
| `I11-R11` | No colour literal is introduced outside the first `:root {` and `html[data-mode="chamber"] {` blocks, and any … | | |
| `I11-R12` | Rendering every covered route in English after this slice produces HTML byte-identical to the baseline, includ… | | |
| `I11-R13` | `tests/unit/t9-mode-tokens.test.ts` is base-RED at `4f764037` and supplies no evidence for this slice; whether… | | |

**Trace count: 13 requirements, 13 scaffold rows.** ARCH-01 fills the two right-hand columns; every requirement must end with at least one step and exactly one cluster, and every step must trace back to a row here.

## Clusters

A cluster is the smallest group of steps that can be verified together, independently of the rest of the slice. It is also the review unit: a reviewer probes a cluster, not the slice diff.

**The three-run law:** each cluster's verification command runs THREE times and the WORST run is the verdict. Green-green-red is RED; the cause gets fixed, and re-running until green is falsification. Record all three outcomes and each run's wall-clock.

### `I11-C1`

| Field | Value |
|---|---|
| Name | |
| PLAN steps it contains | |
| File surface | |
| Pre-fix state | |
| Run 1 / Run 2 / Run 3 | / / |

Verification command (fenced, not in a table cell):

```sh
# ARCH-01 fills this. It must be run at authoring time and its outcome classified BROKEN / GREEN / RED.
```

### `I11-C2`

| Field | Value |
|---|---|
| Name | |
| PLAN steps it contains | |
| File surface | |
| Pre-fix state | |
| Run 1 / Run 2 / Run 3 | / / |

Verification command (fenced, not in a table cell):

```sh
# ARCH-01 fills this. It must be run at authoring time and its outcome classified BROKEN / GREEN / RED.
```

### `I11-C3`

| Field | Value |
|---|---|
| Name | |
| PLAN steps it contains | |
| File surface | |
| Pre-fix state | |
| Run 1 / Run 2 / Run 3 | / / |

Verification command (fenced, not in a table cell):

```sh
# ARCH-01 fills this. It must be run at authoring time and its outcome classified BROKEN / GREEN / RED.
```

### `I11-C4`

| Field | Value |
|---|---|
| Name | |
| PLAN steps it contains | |
| File surface | |
| Pre-fix state | |
| Run 1 / Run 2 / Run 3 | / / |

Verification command (fenced, not in a table cell):

```sh
# ARCH-01 fills this. It must be run at authoring time and its outcome classified BROKEN / GREEN / RED.
```

Add further clusters as the work needs them; four headers is a floor, not a cap. This file has **no line cap** — a step merged with another to save space is the defect the quantifiability law exists to prevent.

