# I08 — Banners, panels and controls · PLAN

**SCAFFOLD ONLY.** REQ-01 created this file with the trace skeleton, the law and the cluster headers. **The architecture seat (ARCH-01) authors every step and every verification command.** A worker that finds a step cell empty stops and says so — it does not invent the step.

Slice `I08` · SPEC: `docs/missions/translation/slices/I08/SPEC.md` (frozen) · census 147 strings

## The quantifiability law

Every step must be markable done or not-done by a stranger with no judgement call.

- WRONG: "improve error handling"
- RIGHT: "requests with a missing id return 400 with a message, and the test asserting this passes"

**Banned words in any step or acceptance criterion: improve, better, robust, handle, appropriate.** They mean the decision is not finished. A step a stranger cannot mark done or not-done with no judgement call is not a step — split it until they can.

**Acceptance commands.** Every command in this file is RUN by its author at authoring time and classified **BROKEN / GREEN / RED**, never by exit code alone. Grep the output for `startup error`, `unexpected argument`, `failed to load`, `usage:`, `command not found`, `cannot find module`, `no test files found`, `0 passed (0)` before calling anything RED. Capture first, then assert — never put a test runner upstream of a live `grep -q` pipe. Do not store a command inside a markdown table cell: the escaped `\|` a table forces is not a shell pipe. Use a fenced block under the cluster.

## SPEC trace — one row per SPEC requirement

| SPEC id | Requirement (abbreviated) | PLAN steps | Cluster |
|---|---|---|---|
| `I08-R01` | Every one of the 147 strings this slice owns, listed per file in `requirements/census.md`, is read from `local… | | |
| `I08-R02` | `locales/en/panels.json` is created by this slice, is valid JSON, has no empty value, and no key exists in it … | | |
| `I08-R03` | Every untranslatable token in the owned files stays a literal: brand marks, maker names, model identifiers, gl… | | |
| `I08-R04` | Rendering each owned file in English after extraction produces HTML byte-identical to the baseline captured fr… | | |
| `I08-R05` | Whitespace is preserved: every `{" "}` separator and every leading or trailing space of a JSX text node in the… | | |
| `I08-R06` | The hardcoded-string scanner reports **0** user-visible literals in the owned files, counting only files this … | | |
| `I08-R07` | A sentence whose grammar runs through an inline element becomes one key with the element as a placeholder, not… | | |
| `I08-R08` | No plural, date or number handling changes in this slice; those sites keep their current behaviour until slice… | | |
| `I08-R09` | Every standing test that reads one of this slice's owned files from disk and asserts an English phrase against… | | |
| `I08-R10` | No test file listed as base-RED at `4f764037` is used as evidence for this slice. | | |
| `I08-R11` | The rendered uppercase state words `PRIVATE`, `PUBLISHED`, `PUBLISH`, `VERDICT`, `UNAVAILABLE` are catalog key… | | |
| `I08-R12` | `components/ModelPresentation.tsx` renders maker names and model identifiers, which stay literals under R31; o… | | |
| `I08-R13` | The hand-made plural at `components/RecommendedInvestigations.tsx:87` and the one at `components/LegacyRunClai… | | |
| `I08-R14` | `tests/render/evaluator-dev-menu-controls.test.tsx`, `tests/render/s9-legacy-claim-controls.test.tsx` and `tes… | | |

**Trace count: 14 requirements, 14 scaffold rows.** ARCH-01 fills the two right-hand columns; every requirement must end with at least one step and exactly one cluster, and every step must trace back to a row here.

## Clusters

A cluster is the smallest group of steps that can be verified together, independently of the rest of the slice. It is also the review unit: a reviewer probes a cluster, not the slice diff.

**The three-run law:** each cluster's verification command runs THREE times and the WORST run is the verdict. Green-green-red is RED; the cause gets fixed, and re-running until green is falsification. Record all three outcomes and each run's wall-clock.

### `I08-C1`

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

### `I08-C2`

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

### `I08-C3`

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

### `I08-C4`

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

