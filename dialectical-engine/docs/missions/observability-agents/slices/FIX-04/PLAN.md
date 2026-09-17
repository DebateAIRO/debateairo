# FIX-04 — PLAN (SCAFFOLD — the architecture seat fills steps, clusters and verification commands)

**Slice:** FIX-04 — API request surface: a failing request is recorded before the reply, and the caller gets a correlation id instead of internals
**Gate:** G1 capture · **SPEC:** `slices/FIX-04/SPEC.md` (FROZEN 2026-09-01) · **Requirements:** 10 (`FIX-04-R01` … ) · **File surface / parallel safety:** SPEC §7 (binding; the PLAN may narrow it, never widen it).
Absorbs predecessor tickets: **S08 `t_c1651ebb`** (api binding) including the `obs-context-hook` contract extension of L2-ADDENDUM-2 §4A (the request-scoped context entered at `onRequest`, declaring kind `run` on exactly the three run-scoped route templates). Zone law: ZI-1..ZI-4 and `tests/support/zone-boundary.ts` (`resolveZoneRouteMountRegion()`), V-ruled 2026-08-26.

## Quantifiability law (binding on every step the architecture seat writes)
A stranger can mark every step done or not-done with no judgement call. WRONG: "improve error handling". RIGHT: "requests with a missing id return 400 with a message, and the test asserting this passes". Banned words in any step or acceptance criterion: **improve, better, robust, handle, appropriate**. Each step names its cluster, its acceptance test, and its file surface. Every SPEC requirement is covered by ≥ 1 step; every step traces to ≥ 1 requirement. Executable commands live in labelled fenced blocks, never in table cells (TOOLING-TRAPS: the escaped-pipe family, variants 1–9); acceptance commands use the capture-first idiom (`out=$(…); rc=$?` then an anchored summary match) and are RUN by their author at authoring time against a hostile configuration (missing file, vacuous filter) before they are written down.

## SPEC → PLAN trace — one row per requirement (10 rows; the architecture seat fills the empty cells)

| Requirement | SPEC sentence (abridged — the SPEC text is authoritative) | PLAN step(s) | Cluster | Acceptance test |
|---|---|---|---|---|
| FIX-04-R01 | `apps/api/src/main.ts` imports `@debateai/obs-capture/install/api` as its first statement.… |  |  |  |
| FIX-04-R02 | Every branch of the API error boundary emits an occurrence BEFORE any byte is written to the reply, including … |  |  |  |
| FIX-04-R03 | Every 500-class response body is `{ error: <code>, correlation_id: <id> }` where `<id>` equals the occurrence'… |  |  |  |
| FIX-04-R04 | A request-scoped ambient context is entered at `onRequest` for every request; it declares kind `run` ONLY on t… |  |  |  |
| FIX-04-R05 | The zone-route-mount region — the single top-level `if (options.registration !== undefined) { … }` block w… |  |  |  |
| FIX-04-R06 | No test in this slice reads, stats, lists, imports or hashes any zone file (ZI-4, Batch-8); mount reality is p… |  |  |  |
| FIX-04-R07 | A failing request yields exactly one `obs.occurrence` row with `runtime = 'api'`, `capture_point = 'http'`, `c… |  |  |  |
| FIX-04-R08 | `resolveSession` and every auth flow are untouched; `AuthFlowError` responses keep their status codes and bodi… |  |  |  |
| FIX-04-R09 | Response latency on the zone routes is not measurably changed by the hook (equal-work: one fixed-cost context … |  |  |  |
| FIX-04-R10 | A green suite is a milestone; Done is V's veto after §5.… |  |  |  |

## Clusters — the unit of verification (three runs; the WORST run is the verdict; green-green-red is RED)

| Cluster | PLAN steps | Verification command (see fenced block) | File surface |
|---|---|---|---|
| FIX-04-C1 |  | `(architecture seat fills)` |  |
| FIX-04-C2 |  | `(architecture seat fills)` |  |
| FIX-04-C3 |  | `(architecture seat fills)` |  |

(Add cluster rows as needed; the three rows above are template rows, not a cap.)

### Verification commands (one labelled fenced block per cluster — never in a table cell)

```text
FIX-04-C1: (architecture seat fills — capture-first idiom, anchored summary, nonzero pass count, run three times)
FIX-04-C2: (architecture seat fills)
FIX-04-C3: (architecture seat fills)
```

## Standing tests that READ this slice's write surface
(architecture seat lists them with full paths and counts — TOOLING-TRAPS "Disjoint WRITE surfaces do not imply independent EFFECTS"; check EVERY target a loop iterates.)

## V acceptance
SPEC §5, verbatim, run by V personally. Never restated here. A green cluster is a worker milestone; Done is V's veto.
