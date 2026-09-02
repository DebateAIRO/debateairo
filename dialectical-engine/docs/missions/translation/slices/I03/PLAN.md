# I03 — Settings and account · PLAN

**SCAFFOLD ONLY.** REQ-01 created this file with the trace skeleton, the law and the cluster headers. **The architecture seat (ARCH-01) authors every step and every verification command.** A worker that finds a step cell empty stops and says so — it does not invent the step.

Slice `I03` · SPEC: `docs/missions/translation/slices/I03/SPEC.md` (frozen) · census 90 strings

## The quantifiability law

Every step must be markable done or not-done by a stranger with no judgement call.

- WRONG: "improve error handling"
- RIGHT: "requests with a missing id return 400 with a message, and the test asserting this passes"

**Banned words in any step or acceptance criterion: improve, better, robust, handle, appropriate.** They mean the decision is not finished. A step a stranger cannot mark done or not-done with no judgement call is not a step — split it until they can.

**Acceptance commands.** Every command in this file is RUN by its author at authoring time and classified **BROKEN / GREEN / RED**, never by exit code alone. Grep the output for `startup error`, `unexpected argument`, `failed to load`, `usage:`, `command not found`, `cannot find module`, `no test files found`, `0 passed (0)` before calling anything RED. Capture first, then assert — never put a test runner upstream of a live `grep -q` pipe. Do not store a command inside a markdown table cell: the escaped `\|` a table forces is not a shell pipe. Use a fenced block under the cluster.

## SPEC trace — one row per SPEC requirement

| SPEC id | Requirement (abbreviated) | PLAN steps | Cluster |
|---|---|---|---|
| `I03-R01` | Every one of the 90 strings this slice owns, listed per file in `requirements/census.md`, is read from `locale… | | |
| `I03-R02` | `locales/en/account.json` is created by this slice, is valid JSON, has no empty value, and no key exists in it… | | |
| `I03-R03` | Every untranslatable token in the owned files stays a literal: brand marks, maker names, model identifiers, gl… | | |
| `I03-R04` | Rendering each owned file in English after extraction produces HTML byte-identical to the baseline captured fr… | | |
| `I03-R05` | Whitespace is preserved: every `{" "}` separator and every leading or trailing space of a JSX text node in the… | | |
| `I03-R06` | The hardcoded-string scanner reports **0** user-visible literals in the owned files, counting only files this … | | |
| `I03-R07` | A sentence whose grammar runs through an inline element becomes one key with the element as a placeholder, not… | | |
| `I03-R08` | No plural, date or number handling changes in this slice; those sites keep their current behaviour until slice… | | |
| `I03-R09` | Every standing test that reads one of this slice's owned files from disk and asserts an English phrase against… | | |
| `I03-R10` | No test file listed as base-RED at `4f764037` is used as evidence for this slice. | | |
| `I03-R11` | Only text changes in the owned files: no control flow, validation, request, cookie, storage, redirect or secur… | | |
| `I03-R12` | The sentence at `components/AccountErasureControls.tsx:107` (`Status: <strong>{status}</strong>. Scheduled del… | | |
| `I03-R13` | `tests/unit/s10-erasure-ui.test.ts`, which reads `components/AccountErasureControls.tsx` from disk, passes or … | | |

**Trace count: 13 requirements, 13 scaffold rows.** ARCH-01 fills the two right-hand columns; every requirement must end with at least one step and exactly one cluster, and every step must trace back to a row here.

## Clusters

A cluster is the smallest group of steps that can be verified together, independently of the rest of the slice. It is also the review unit: a reviewer probes a cluster, not the slice diff.

**The three-run law:** each cluster's verification command runs THREE times and the WORST run is the verdict. Green-green-red is RED; the cause gets fixed, and re-running until green is falsification. Record all three outcomes and each run's wall-clock.

### `I03-C1`

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

### `I03-C2`

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

### `I03-C3`

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

### `I03-C4`

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

