# FIX-02 — PLAN (SCAFFOLD — the architecture seat fills steps, clusters and verification commands)

**Slice:** FIX-02 — Root survives the wrapper: the original error is reachable under every product wrap
**Gate:** G1 capture · **SPEC:** `slices/FIX-02/SPEC.md` (FROZEN 2026-09-01) · **Requirements:** 8 (`FIX-02-R01` … ) · **File surface / parallel safety:** SPEC §7 (binding; the PLAN may narrow it, never widen it).
Absorbs predecessor ticket: **S07 `t_9f4e5bfb`** (cause-chain retrofit) — MINUS the `buildSchemaRepairPacket` region of `apps/runner/src/index.ts`, which moves to FIX-03 so that the runner file has one writer (REQ-FIX decision, DECISIONS.md). Cites: D12 `t_40c2cc1b` comment 2026-08-27 ("D2 is not merely unproven, it is impossible").

## Quantifiability law (binding on every step the architecture seat writes)
A stranger can mark every step done or not-done with no judgement call. WRONG: "improve error handling". RIGHT: "requests with a missing id return 400 with a message, and the test asserting this passes". Banned words in any step or acceptance criterion: **improve, better, robust, handle, appropriate**. Each step names its cluster, its acceptance test, and its file surface. Every SPEC requirement is covered by ≥ 1 step; every step traces to ≥ 1 requirement. Executable commands live in labelled fenced blocks, never in table cells (TOOLING-TRAPS: the escaped-pipe family, variants 1–9); acceptance commands use the capture-first idiom (`out=$(…); rc=$?` then an anchored summary match) and are RUN by their author at authoring time against a hostile configuration (missing file, vacuous filter) before they are written down.

## SPEC → PLAN trace — one row per requirement (8 rows; the architecture seat fills the empty cells)

| Requirement | SPEC sentence (abridged — the SPEC text is authoritative) | PLAN step(s) | Cluster | Acceptance test |
|---|---|---|---|---|
| FIX-02-R01 | `TypedDomainError` accepts `options?: { cause?: unknown }` and passes it to `super(message, options)`; `new Ty… |  |  |  |
| FIX-02-R02 | `typedPoolFailure` (`packages/db/src/index.ts`, the `wrapper` region — `:14-18` at `dc9fd57`, line numbers n… |  |  |  |
| FIX-02-R03 | `createPool`'s `pool.on("error")` path (`packages/db/src/index.ts` `wrapper` region, `:69-72` at `dc9fd57`) no… |  |  |  |
| FIX-02-R04 | Walking `.cause` from the outermost product error reaches the original pg error object (identity, not text) th… |  |  |  |
| FIX-02-R05 | Async joins in the touched regions preserve every rejection, not only the first (`AggregateError` or equivalen… |  |  |  |
| FIX-02-R06 | The stored record carries the chain: after a wrapped fault is captured through FIX-01's pipeline, `obs.occurre… |  |  |  |
| FIX-02-R07 | Zero behaviour change for callers that do not pass a cause: the repo-wide `pnpm typecheck` diagnostic count in… |  |  |  |
| FIX-02-R08 | A green test suite is a worker milestone only; Done is V's veto after running §5.… |  |  |  |

## Clusters — the unit of verification (three runs; the WORST run is the verdict; green-green-red is RED)

| Cluster | PLAN steps | Verification command (see fenced block) | File surface |
|---|---|---|---|
| FIX-02-C1 |  | `(architecture seat fills)` |  |
| FIX-02-C2 |  | `(architecture seat fills)` |  |
| FIX-02-C3 |  | `(architecture seat fills)` |  |

(Add cluster rows as needed; the three rows above are template rows, not a cap.)

### Verification commands (one labelled fenced block per cluster — never in a table cell)

```text
FIX-02-C1: (architecture seat fills — capture-first idiom, anchored summary, nonzero pass count, run three times)
FIX-02-C2: (architecture seat fills)
FIX-02-C3: (architecture seat fills)
```

## Standing tests that READ this slice's write surface
(architecture seat lists them with full paths and counts — TOOLING-TRAPS "Disjoint WRITE surfaces do not imply independent EFFECTS"; check EVERY target a loop iterates.)

## V acceptance
SPEC §5, verbatim, run by V personally. Never restated here. A green cluster is a worker milestone; Done is V's veto.
