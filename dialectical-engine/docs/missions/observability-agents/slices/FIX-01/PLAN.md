# FIX-01 — PLAN (SCAFFOLD — the architecture seat fills steps, clusters and verification commands)

**Slice:** FIX-01 — First row: a real scheduler-job fault becomes a row V can query
**Gate:** G1 capture · **SPEC:** `slices/FIX-01/SPEC.md` (FROZEN 2026-09-01) · **Requirements:** 15 (`FIX-01-R01` … ) · **File surface / parallel safety:** SPEC §7 (binding; the PLAN may narrow it, never widen it).
Absorbs predecessor tickets: **S05b `t_3a04cc06`** (runtime capture wiring — the mission's central defect: the product stores nothing) · **S10 `t_6c5e1a6e`** (scheduler binding). Cites: S05 `t_6e99d607` (frozen installers, read-only), S03b `t_9b5ca941` (core, read-only), S01 `t_1fde033d` (store, read-only).

## Quantifiability law (binding on every step the architecture seat writes)
A stranger can mark every step done or not-done with no judgement call. WRONG: "improve error handling". RIGHT: "requests with a missing id return 400 with a message, and the test asserting this passes". Banned words in any step or acceptance criterion: **improve, better, robust, handle, appropriate**. Each step names its cluster, its acceptance test, and its file surface. Every SPEC requirement is covered by ≥ 1 step; every step traces to ≥ 1 requirement. Executable commands live in labelled fenced blocks, never in table cells (TOOLING-TRAPS: the escaped-pipe family, variants 1–9); acceptance commands use the capture-first idiom (`out=$(…); rc=$?` then an anchored summary match) and are RUN by their author at authoring time against a hostile configuration (missing file, vacuous filter) before they are written down.

## SPEC → PLAN trace — one row per requirement (15 rows; the architecture seat fills the empty cells)

| Requirement | SPEC sentence (abridged — the SPEC text is authoritative) | PLAN step(s) | Cluster | Acceptance test |
|---|---|---|---|---|
| FIX-01-R01 | The `@debateai/obs-capture/runtime` subpath (already declared in `packages/obs-capture/package.json:11`, targe… |  |  |  |
| FIX-01-R02 | When the runtime arms, a real bounded reference queue replaces the installer's drop-everything default; an `em… |  |  |  |
| FIX-01-R03 | The flusher writes post-redaction envelopes to `obs.occurrence` through the `pg` driver as role `debateai_obs_… |  |  |  |
| FIX-01-R04 | Spool: only post-redaction envelopes are written, through the installer's pre-opened fd; on the next arm of an… |  |  |  |
| FIX-01-R05 | The Tier-1 exit sink installed by the runtime: (O-1) writes at most one record per process death — never a T… |  |  |  |
| FIX-01-R06 | `apps/scheduler/src/cli.ts` imports `@debateai/obs-capture/install/scheduler` as its first statement and runs … |  |  |  |
| FIX-01-R07 | A scheduler job that throws produces exactly one `obs.occurrence` row with `runtime = 'scheduler'`, `capture_p… |  |  |  |
| FIX-01-R08 | No planted secret survives: a database URL carrying a password, passed to the failing job, leaves the password… |  |  |  |
| FIX-01-R09 | Least privilege is real in both directions: the sink succeeds as `debateai_obs_writer`; `SELECT 1 FROM core.ru… |  |  |  |
| FIX-01-R10 | The product is unaffected: the failing job's exit code and its stderr byte length are identical with and witho… |  |  |  |
| FIX-01-R11 | With Postgres down, the failing job's envelope is spooled, the job's exit code is unchanged, and after Postgre… |  |  |  |
| FIX-01-R12 | Two identical faults produce two occurrence rows sharing one `fingerprint` (no occurrence-level dedup; folding… |  |  |  |
| FIX-01-R13 | The runtime reads its bounds from `OBS_*` environment variables with declared calibration seeds (predecessor L… |  |  |  |
| FIX-01-R14 | Nothing in this slice imports, reads, stats, lists or names by import any zone path; zone membership stays pat… |  |  |  |
| FIX-01-R15 | A green test suite is a worker milestone only; Done is V's veto after running §5 personally.… |  |  |  |

## Clusters — the unit of verification (three runs; the WORST run is the verdict; green-green-red is RED)

| Cluster | PLAN steps | Verification command (see fenced block) | File surface |
|---|---|---|---|
| FIX-01-C1 |  | `(architecture seat fills)` |  |
| FIX-01-C2 |  | `(architecture seat fills)` |  |
| FIX-01-C3 |  | `(architecture seat fills)` |  |

(Add cluster rows as needed; the three rows above are template rows, not a cap.)

### Verification commands (one labelled fenced block per cluster — never in a table cell)

```text
FIX-01-C1: (architecture seat fills — capture-first idiom, anchored summary, nonzero pass count, run three times)
FIX-01-C2: (architecture seat fills)
FIX-01-C3: (architecture seat fills)
```

## Standing tests that READ this slice's write surface
(architecture seat lists them with full paths and counts — TOOLING-TRAPS "Disjoint WRITE surfaces do not imply independent EFFECTS"; check EVERY target a loop iterates.)

## V acceptance
SPEC §5, verbatim, run by V personally. Never restated here. A green cluster is a worker milestone; Done is V's veto.
