# I01 — Language foundation and the menu · PLAN

**SCAFFOLD ONLY.** REQ-01 created this file with the trace skeleton, the law and the cluster headers. **The architecture seat (ARCH-01) authors every step and every verification command.** A worker that finds a step cell empty stops and says so — it does not invent the step.

Slice `I01` · SPEC: `docs/missions/translation/slices/I01/SPEC.md` (frozen) · census 22 strings

## The quantifiability law

Every step must be markable done or not-done by a stranger with no judgement call.

- WRONG: "improve error handling"
- RIGHT: "requests with a missing id return 400 with a message, and the test asserting this passes"

**Banned words in any step or acceptance criterion: improve, better, robust, handle, appropriate.** They mean the decision is not finished. A step a stranger cannot mark done or not-done with no judgement call is not a step — split it until they can.

**Acceptance commands.** Every command in this file is RUN by its author at authoring time and classified **BROKEN / GREEN / RED**, never by exit code alone. Grep the output for `startup error`, `unexpected argument`, `failed to load`, `usage:`, `command not found`, `cannot find module`, `no test files found`, `0 passed (0)` before calling anything RED. Capture first, then assert — never put a test runner upstream of a live `grep -q` pipe. Do not store a command inside a markdown table cell: the escaped `\|` a table forces is not a shell pipe. Use a fenced block under the cluster.

## SPEC trace — one row per SPEC requirement

| SPEC id | Requirement (abbreviated) | PLAN steps | Cluster |
|---|---|---|---|
| `I01-R01` | A module exports the seventeen languages of `requirements/translation.md` §Q2, each with its BCP-47 code, nati… | | |
| `I01-R02` | A `LanguageMenu` component renders as a native `<button>` with `tabIndex` 0, a non-empty accessible name conta… | | |
| `I01-R03` | With the list open, ArrowDown and ArrowUp move the highlighted option, Enter and Space choose the highlighted … | | |
| `I01-R04` | The active language's option carries `aria-current="true"` and every option is labelled by the native name fro… | | |
| `I01-R05` | `LanguageMenu` renders as a sibling of `<ModeToggle` inside the same parent element at all four sites: `compon… | | |
| `I01-R06` | In the debate toolbar the component renders its compact variant, which is one focusable element. | | |
| `I01-R07` | Choosing a language writes the cookie `__Host-debateai-locale` with `Path=/`, `Secure`, `SameSite=Lax`, `Max-A… | | |
| `I01-R08` | The choice handler calls none of `window.location.assign`, `window.location.replace`, `window.location.href =`… | | |
| `I01-R09` | The choice is written nowhere but that cookie: no `localStorage`, no `sessionStorage`, no account record, no A… | | |
| `I01-R10` | `filteredSessionCookies` in `app/api/[...path]/route.ts` still admits exactly `__Host-debateai-session` and `_… | | |
| `I01-R11` | A pure negotiation function maps an `Accept-Language` header to a language code and has a committed test table… | | |
| `I01-R12` | A request with no locale cookie is served in the negotiated language and no cookie is written by negotiation. | | |
| `I01-R13` | A request whose locale cookie value is not one of the seventeen codes is served in English, and the rejected v… | | |
| `I01-R14` | The `<html>` element carries `lang` equal to the active code and `dir` equal to `rtl` for `ar` and `ur` and `l… | | |
| `I01-R15` | `locales/<code>/chrome.json` exists for all seventeen codes, carries the identical key set, has no empty value… | | |
| `I01-R16` | Every one of the 22 chrome strings in `components/TopBar.tsx`, `components/ModeToggle.tsx`, `components/landin… | | |
| `I01-R17` | Rendering the four owned files in English after this slice produces HTML byte-identical to the baseline captur… | | |
| `I01-R18` | The menu introduces no colour literal outside the first `:root {` and `html[data-mode="chamber"] {` blocks of … | | |
| `I01-R19` | At a 390px-wide viewport the control is visible in the top bar and in the debate toolbar with no horizontal sc… | | |
| `I01-R20` | The menu introduces no new font family. | | |
| `I01-R21` | `app/layout.tsx`'s `metadata.description` is read from `chrome.json` and `metadata.title` is not, because the … | | |
| `I01-R22` | Catalogs are files committed to the repository: this slice adds no run-time translation call and no translatio… | | |
| `I01-R23` | A key present in English and absent at run time renders the English value and never renders empty and never re… | | |
| `I01-R24` | The JavaScript delivered for a route in language X contains no catalog value belonging to another language, an… | | |
| `I01-R25` | A choice made on one route survives a browser reload of that route and of every other route, and every subsequ… | | |
| `I01-R26` | No file under `apps/api`, `packages/crypto`, `packages/db` or `migrations` changes — a fence that binds every … | | |

**Trace count: 26 requirements, 26 scaffold rows.** ARCH-01 fills the two right-hand columns; every requirement must end with at least one step and exactly one cluster, and every step must trace back to a row here.

## Clusters

A cluster is the smallest group of steps that can be verified together, independently of the rest of the slice. It is also the review unit: a reviewer probes a cluster, not the slice diff.

**The three-run law:** each cluster's verification command runs THREE times and the WORST run is the verdict. Green-green-red is RED; the cause gets fixed, and re-running until green is falsification. Record all three outcomes and each run's wall-clock.

### `I01-C1`

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

### `I01-C2`

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

### `I01-C3`

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

### `I01-C4`

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

