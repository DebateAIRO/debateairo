# I09 — Domain copy modules · PLAN

**SCAFFOLD ONLY.** REQ-01 created this file with the trace skeleton, the law and the cluster headers. **The architecture seat (ARCH-01) authors every step and every verification command.** A worker that finds a step cell empty stops and says so — it does not invent the step.

Slice `I09` · SPEC: `docs/missions/translation/slices/I09/SPEC.md` (frozen) · census 215 strings

## The quantifiability law

Every step must be markable done or not-done by a stranger with no judgement call.

- WRONG: "improve error handling"
- RIGHT: "requests with a missing id return 400 with a message, and the test asserting this passes"

**Banned words in any step or acceptance criterion: improve, better, robust, handle, appropriate.** They mean the decision is not finished. A step a stranger cannot mark done or not-done with no judgement call is not a step — split it until they can.

**Acceptance commands.** Every command in this file is RUN by its author at authoring time and classified **BROKEN / GREEN / RED**, never by exit code alone. Grep the output for `startup error`, `unexpected argument`, `failed to load`, `usage:`, `command not found`, `cannot find module`, `no test files found`, `0 passed (0)` before calling anything RED. Capture first, then assert — never put a test runner upstream of a live `grep -q` pipe. Do not store a command inside a markdown table cell: the escaped `\|` a table forces is not a shell pipe. Use a fenced block under the cluster.

## SPEC trace — one row per SPEC requirement

| SPEC id | Requirement (abbreviated) | PLAN steps | Cluster |
|---|---|---|---|
| `I09-R01` | Every one of the 229 strings this slice owns, listed per file in `requirements/census.md`, is read from `local… | | |
| `I09-R02` | `locales/en/domain.json` is created by this slice, is valid JSON, has no empty value, and no key exists in it … | | |
| `I09-R03` | Every untranslatable token in the owned files stays a literal: brand marks, maker names, model identifiers, gl… | | |
| `I09-R04` | Rendering each owned file in English after extraction produces HTML byte-identical to the baseline captured fr… | | |
| `I09-R05` | Whitespace is preserved: every `{" "}` separator and every leading or trailing space of a JSX text node in the… | | |
| `I09-R06` | The hardcoded-string scanner reports **0** user-visible literals in the owned files, counting only files this … | | |
| `I09-R07` | A sentence whose grammar runs through an inline element becomes one key with the element as a placeholder, not… | | |
| `I09-R08` | No plural, date or number handling changes in this slice; those sites keep their current behaviour until slice… | | |
| `I09-R09` | Every standing test that reads one of this slice's owned files from disk and asserts an English phrase against… | | |
| `I09-R10` | No test file listed as base-RED at `4f764037` is used as evidence for this slice. | | |
| `I09-R11` | The 28 condition-mark labels and the 5 abstention-kind labels in `lib/v3/labels.ts` become catalog keys whose … | | |
| `I09-R12` | The `pluralize` helper at `lib/scoringResponse.ts:125` and its four call sites keep their current English outp… | | |
| `I09-R13` | `lib/api.ts` and `app/api/[...path]/route.ts`: a message a reader can see is extracted; an error *code* such a… | | |
| `I09-R14` | `lib/v3/adapter.ts:363-368`, which builds a percentage by string concatenation, keeps its current output in th… | | |
| `I09-R15` | `tests/unit/dr174-resilience.test.ts`, `tests/unit/dr184-judged-standing.test.ts` and `tests/unit/pol01-policy… | | |
| `I09-R16` | `apps/ui/lib/scoringResponse.test.mjs` asserts the RETURN VALUES of `lib/scoringResponse.ts` (57 assertions) a… | | |

**Trace count: 16 requirements, 16 scaffold rows.** ARCH-01 fills the two right-hand columns; every requirement must end with at least one step and exactly one cluster, and every step must trace back to a row here.

## Clusters

A cluster is the smallest group of steps that can be verified together, independently of the rest of the slice. It is also the review unit: a reviewer probes a cluster, not the slice diff.

**The three-run law:** each cluster's verification command runs THREE times and the WORST run is the verdict. Green-green-red is RED; the cause gets fixed, and re-running until green is falsification. Record all three outcomes and each run's wall-clock.

### `I09-C1`

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

### `I09-C2`

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

### `I09-C3`

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

### `I09-C4`

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

