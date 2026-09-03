# FIX-07 — PLAN (SCAFFOLD — the architecture seat fills steps, clusters and verification commands)

**Slice:** FIX-07 — It says when it is blind: a quiet hour and an off hour are different queries, and capture has an OFF switch that still counts
**Gate:** G1 capture · **SPEC:** `slices/FIX-07/SPEC.md` (FROZEN 2026-09-01) · **Requirements:** 7 (`FIX-07-R01` … ) · **File surface / parallel safety:** SPEC §7 (binding; the PLAN may narrow it, never widen it).
Absorbs: the D4 obligations no predecessor slice owned end-to-end (S03b gap counter exists; S05b flushes gap rows; nothing writes a heartbeat) · OBS-R060 (runtime disable via an auditable switch, no redeploy) — the capture half of D7, operated by FIX-10's `obsctl`.

## Quantifiability law (binding on every step the architecture seat writes)
A stranger can mark every step done or not-done with no judgement call. WRONG: "improve error handling". RIGHT: "requests with a missing id return 400 with a message, and the test asserting this passes". Banned words in any step or acceptance criterion: **improve, better, robust, handle, appropriate**. Each step names its cluster, its acceptance test, and its file surface. Every SPEC requirement is covered by ≥ 1 step; every step traces to ≥ 1 requirement. Executable commands live in labelled fenced blocks, never in table cells (TOOLING-TRAPS: the escaped-pipe family, variants 1–9); acceptance commands use the capture-first idiom (`out=$(…); rc=$?` then an anchored summary match) and are RUN by their author at authoring time against a hostile configuration (missing file, vacuous filter) before they are written down.

## SPEC → PLAN trace — one row per requirement (7 rows; the architecture seat fills the empty cells)

| Requirement | SPEC sentence (abridged — the SPEC text is authoritative) | PLAN step(s) | Cluster | Acceptance test |
|---|---|---|---|---|
| FIX-07-R01 | Every armed runtime upserts one `obs.component_health` row per flush cycle: `component = 'capture:<runtime>'`,… |  |  |  |
| FIX-07-R02 | Every loss class is a counted row: `QUEUE_FULL`, `SPOOL_FAILURE`, `POSTGRES_FAILURE`, `REDACTOR_FAILURE`, `GAP… |  |  |  |
| FIX-07-R03 | A capture OFF switch exists (file or register row; ARCH decides; path stated in DECISIONS.md) that every runti… |  |  |  |
| FIX-07-R04 | One query V can paste distinguishes "quiet" (heartbeats present, zero occurrences) from "off" (no heartbeat ne… |  |  |  |
| FIX-07-R05 | The heartbeat's cost is bounded: one small upsert per flush cycle per process; no heartbeat when the runtime i… |  |  |  |
| FIX-07-R06 | The OFF switch changes nothing about the product: the failing job's exit code and stderr bytes are identical w… |  |  |  |
| FIX-07-R07 | A green suite is a milestone; Done is V's veto after §5.… |  |  |  |

## Clusters — the unit of verification (three runs; the WORST run is the verdict; green-green-red is RED)

| Cluster | PLAN steps | Verification command (see fenced block) | File surface |
|---|---|---|---|
| FIX-07-C1 |  | `(architecture seat fills)` |  |
| FIX-07-C2 |  | `(architecture seat fills)` |  |
| FIX-07-C3 |  | `(architecture seat fills)` |  |

(Add cluster rows as needed; the three rows above are template rows, not a cap.)

### Verification commands (one labelled fenced block per cluster — never in a table cell)

```text
FIX-07-C1: (architecture seat fills — capture-first idiom, anchored summary, nonzero pass count, run three times)
FIX-07-C2: (architecture seat fills)
FIX-07-C3: (architecture seat fills)
```

## Standing tests that READ this slice's write surface
(architecture seat lists them with full paths and counts — TOOLING-TRAPS "Disjoint WRITE surfaces do not imply independent EFFECTS"; check EVERY target a loop iterates.)

## V acceptance
SPEC §5, verbatim, run by V personally. Never restated here. A green cluster is a worker milestone; Done is V's veto.
