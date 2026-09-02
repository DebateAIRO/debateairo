# FIX-15 — PLAN (SCAFFOLD — the architecture seat fills steps, clusters and verification commands)

**Slice:** FIX-15 — Hatchet failed-run ingest: a job Hatchet marks FAILED becomes a row from the second source, deduplicated against ours — behind SPIKE-D1
**Gate:** G2 listener · **SPEC:** `slices/FIX-15/SPEC.md` (FROZEN 2026-09-01) · **Requirements:** 7 (`FIX-15-R01` … ) · **File surface / parallel safety:** SPEC §7 (binding; the PLAN may narrow it, never widen it).
Absorbs predecessor ticket: **S24** (hatchet ingest — ticket id not in the D12 log; RP-2 `t_fbefa222`). V's A2 steer (2026-08-21, "an agent that listens to both") and OBS-R137–R144 bind. C4 boundary: Hatchet RUN FAILURES are error-shaped (FixAgent); Hatchet INFRASTRUCTURE health (workers registered, queue depth, dispatch latency) is the ObservationAgent's.

## Quantifiability law (binding on every step the architecture seat writes)
A stranger can mark every step done or not-done with no judgement call. WRONG: "improve error handling". RIGHT: "requests with a missing id return 400 with a message, and the test asserting this passes". Banned words in any step or acceptance criterion: **improve, better, robust, handle, appropriate**. Each step names its cluster, its acceptance test, and its file surface. Every SPEC requirement is covered by ≥ 1 step; every step traces to ≥ 1 requirement. Executable commands live in labelled fenced blocks, never in table cells (TOOLING-TRAPS: the escaped-pipe family, variants 1–9); acceptance commands use the capture-first idiom (`out=$(…); rc=$?` then an anchored summary match) and are RUN by their author at authoring time against a hostile configuration (missing file, vacuous filter) before they are written down.

## SPEC → PLAN trace — one row per requirement (7 rows; the architecture seat fills the empty cells)

| Requirement | SPEC sentence (abridged — the SPEC text is authoritative) | PLAN step(s) | Cluster | Acceptance test |
|---|---|---|---|---|
| FIX-15-R01 | SPIKE-D1 (half a day, read-only, at G2 entry, custodian/orchestrator act) answers: retention window · `runs.l… |  |  |  |
| FIX-15-R02 | Ingest polls `runs.list` (FAILED/CANCELLED, cursor window minus overlap) on `obs.hatchet.pollIntervalMs` as co… |  |  |  |
| FIX-15-R03 | Rows land as `source = 'hatchet'`, `runtime = 'ingest'`, `source_event_ref = 'hatchet:<runId>:<attempt>'`, ide… |  |  |  |
| FIX-15-R04 | Cross-source merge: when `v3RunId/v3WorkItemId` match a first-party occurrence's `run_ref/work_item_ref` withi… |  |  |  |
| FIX-15-R05 | Both clocks are stamped; skew is measured continuously; `skewToleranceMs` may be ratified only from a split-cl… |  |  |  |
| FIX-15-R06 | Hatchet is never a dependency of the capture path; a Hatchet outage degrades this source and is itself an occu… |  |  |  |
| FIX-15-R07 | A green suite is a milestone; Done is V's veto after §5.… |  |  |  |

## Clusters — the unit of verification (three runs; the WORST run is the verdict; green-green-red is RED)

| Cluster | PLAN steps | Verification command (see fenced block) | File surface |
|---|---|---|---|
| FIX-15-C1 |  | `(architecture seat fills)` |  |
| FIX-15-C2 |  | `(architecture seat fills)` |  |
| FIX-15-C3 |  | `(architecture seat fills)` |  |

(Add cluster rows as needed; the three rows above are template rows, not a cap.)

### Verification commands (one labelled fenced block per cluster — never in a table cell)

```text
FIX-15-C1: (architecture seat fills — capture-first idiom, anchored summary, nonzero pass count, run three times)
FIX-15-C2: (architecture seat fills)
FIX-15-C3: (architecture seat fills)
```

## Standing tests that READ this slice's write surface
(architecture seat lists them with full paths and counts — TOOLING-TRAPS "Disjoint WRITE surfaces do not imply independent EFFECTS"; check EVERY target a loop iterates.)

## V acceptance
SPEC §5, verbatim, run by V personally. Never restated here. A green cluster is a worker milestone; Done is V's veto.
