# FIX-03 — PLAN (SCAFFOLD — the architecture seat fills steps, clusters and verification commands)

**Slice:** FIX-03 — Runner job surface: a failed run's job is recorded with its real run identity, and the original error is never replaced
**Gate:** G1 capture · **SPEC:** `slices/FIX-03/SPEC.md` (FROZEN 2026-09-01) · **Requirements:** 12 (`FIX-03-R01` … ) · **File surface / parallel safety:** SPEC §7 (binding; the PLAN may narrow it, never widen it).
Absorbs predecessor tickets: **S06 `t_5504afe0`** (runner binding — PARTIAL on `dev`: `apps/runner/src/main.ts:1` carries the installer import and `tests/integration/obs-l3-s06-runner-binding.test.ts` exists via `e8d99d33`, but `apps/runner/src/index.ts` contains no capture call — grep 2026-09-01) · **S03c** (declared-kind projection, `planning/L2-ADDENDUM-2-DECLARED-KINDS.md` §4 — ticket 

## Quantifiability law (binding on every step the architecture seat writes)
A stranger can mark every step done or not-done with no judgement call. WRONG: "improve error handling". RIGHT: "requests with a missing id return 400 with a message, and the test asserting this passes". Banned words in any step or acceptance criterion: **improve, better, robust, handle, appropriate**. Each step names its cluster, its acceptance test, and its file surface. Every SPEC requirement is covered by ≥ 1 step; every step traces to ≥ 1 requirement. Executable commands live in labelled fenced blocks, never in table cells (TOOLING-TRAPS: the escaped-pipe family, variants 1–9); acceptance commands use the capture-first idiom (`out=$(…); rc=$?` then an anchored summary match) and are RUN by their author at authoring time against a hostile configuration (missing file, vacuous filter) before they are written down.

## SPEC → PLAN trace — one row per requirement (12 rows; the architecture seat fills the empty cells)

| Requirement | SPEC sentence (abridged — the SPEC text is authoritative) | PLAN step(s) | Cluster | Acceptance test |
|---|---|---|---|---|
| FIX-03-R01 | In `declareHatchetWalkingSkeletonTask`'s catch, capture fires BEFORE `recordTerminalFailure`, inside an ambien… |  |  |  |
| FIX-03-R02 | When `recordTerminalFailure` returns false, the ORIGINAL caught error is re-thrown (the `RUNNER_FAILURE_STATE_… |  |  |  |
| FIX-03-R03 | Retries of one work item fold into one work unit: each occurrence carries `attempt_index`, and `obs.incident.d… |  |  |  |
| FIX-03-R04 | `packages/obs-capture/src/kinds.ts` (new) holds the frozen six-kind list — `run`, `work_item`, `node`, `atte… |  |  |  |
| FIX-03-R05 | The projection is a veto, not a vote: a value reaches `run_ref` only when a seam DECLARED it as kind `run`; a … |  |  |  |
| FIX-03-R06 | `kinds.ts` has zero runtime imports (type-only import of `ObsContext`); a resolve-hook trace of `import("@deba… |  |  |  |
| FIX-03-R07 | `buildSchemaRepairPacket` (`apps/runner/src/index.ts`) no longer interpolates the raw zod parse text into the … |  |  |  |
| FIX-03-R08 | The provider gateway seam (`createPostgresProviderGateway` region) seeds `run` into the ambient context for pr… |  |  |  |
| FIX-03-R09 | A failed runner job yields exactly one `obs.occurrence` row per attempt with `runtime = 'runner'`, `capture_po… |  |  |  |
| FIX-03-R10 | No user-linked value is ever a lawful kind: `asker_id` and `session_id` are inexpressible (no kind exists), as… |  |  |  |
| FIX-03-R11 | The runner's exit code, Hatchet result payload, and the terminal-failure write are unchanged in every case whe… |  |  |  |
| FIX-03-R12 | A green suite is a milestone; Done is V's veto after §5.… |  |  |  |

## Clusters — the unit of verification (three runs; the WORST run is the verdict; green-green-red is RED)

| Cluster | PLAN steps | Verification command (see fenced block) | File surface |
|---|---|---|---|
| FIX-03-C1 |  | `(architecture seat fills)` |  |
| FIX-03-C2 |  | `(architecture seat fills)` |  |
| FIX-03-C3 |  | `(architecture seat fills)` |  |

(Add cluster rows as needed; the three rows above are template rows, not a cap.)

### Verification commands (one labelled fenced block per cluster — never in a table cell)

```text
FIX-03-C1: (architecture seat fills — capture-first idiom, anchored summary, nonzero pass count, run three times)
FIX-03-C2: (architecture seat fills)
FIX-03-C3: (architecture seat fills)
```

## Standing tests that READ this slice's write surface
(architecture seat lists them with full paths and counts — TOOLING-TRAPS "Disjoint WRITE surfaces do not imply independent EFFECTS"; check EVERY target a loop iterates.)

## V acceptance
SPEC §5, verbatim, run by V personally. Never restated here. A green cluster is a worker milestone; Done is V's veto.
