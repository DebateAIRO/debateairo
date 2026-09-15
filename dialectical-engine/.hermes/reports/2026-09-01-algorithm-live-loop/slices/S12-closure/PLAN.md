<!-- REQ-01 zero-drift transcription. Quoted spans are byte-identical to goal-v4. -->
# S12 PLAN — Closure: global DoD, confirm-items, delta/epsilon refit

**Skeleton only.** Mission `DECISIONS.md` R7-1 elects no ARCHITECTURE loop —
goal-v4 embeds the HOW — so the lane stages below are the plan surface and the
worker fills the evidence column. REQ-01 authored NO steps: every DoD clause in
the trace table is a verbatim substring of the goal (D7).

**Quantifiability law (requirements contract §2).** A stranger must be able to mark
every row done or not-done with no judgement call. No acceptance criterion may
contain *improve*, *better*, *robust*, *handle*, or *appropriate*. A row nobody can
check mechanically is not a row — split it until it is.

## Lane stages (slice-map: RED evidence → GREEN → suites → codex review → judge)

| # | stage | gate — mechanically checkable | evidence (worker fills) |
|---|---|---|---|
| 1 | RED | the FIRST test asserts the DESIRED behavior and FAILS on `dev@1c9578a`; failing output pasted verbatim with the command that produced it | |
| 2 | GREEN | the same test passes unchanged — assertion never flipped (Global DoD, goal 29–31) | |
| 3 | SUITES | `pnpm run typecheck` exit code + `pnpm test` reported `passed/total`; every pre-existing failure named individually against T0's pin | |
| 4 | CODEX REVIEW | static review filed; every finding ticketed (router §2.2); ≤3 rework rounds, round 4 goes to a V DECISIONS PACKET row | |
| 5 | JUDGE | Fable 5 verdict recorded (mission D1: judge verdict stands in for Hermes stage review) | |

## SPEC → DoD trace

Every row is a verbatim DoD clause from the goal. Coverage is complete by
construction: the clauses are machine-split from the `DoD:` blocks in the same line
ranges `SPEC.md` quotes.

| # | goal task | DoD clause (verbatim) | cluster | done? |
|---|---|---|---|---|
| 1 | Global DoD (goal 29) | RED before GREEN means: the FIRST test asserts the DESIRED behavior and fails on the baseline. Never write a test that passes today and flip its assertion later. Read-only probes documenting old behavior are allowed but are not the RED evidence. | S12-C1 | |
| 2 | Global DoD (goal 32) | Suites reported passed/total; pre-existing failures named, never absorbed. | S12-C1 | |
| 3 | Global DoD (goal 33) | Full multi-maker acceptance run (M≥2, depth≥2) completes with: panel-reduced τ (non-self-graded), measured edges, at least one root's final strength ≠ τ, an adaptive stop or ceiling recorded, a synthesizer verdict statement acknowledging the strongest surviving objection, an evaluator loop record (≤3 rounds), a code-derived three-state label, a band counted over cited nodes, AND envelope state WITHIN at terminal. | S12-C1 | |
| 4 | Global DoD (goal 38) | Mono-maker acceptance run still completes (skeleton path + marks intact). | S12-C1 | |
| 5 | Global DoD (goal 39) | Every new policy value lives in sealed register rows via T16's mechanism; missing rows fail loudly. | S12-C1 | |

## Clusters (requirements contract §3)

A cluster is the smallest group of rows verifiable together, independently of the
rest of the slice. Each needs an id, its rows, ONE verification command, its file
surface. **Three-run law: the verification runs THREE times and the WORST run is
the verdict.** Green-green-red is RED — fix the cause; re-running until green is
falsification. Clusters are the review unit: codex probes a cluster, not the diff.

| cluster | rows | ONE verification command | file surface |
|---|---|---|---|
| S12-C1 | all | (worker/orchestrator fills) | (fills) |

## Standing hazards for this lane

- RED evidence is the FIRST test failing on baseline. A read-only probe that
  documents today's behavior is allowed but is NOT the RED evidence (goal 29–31).
- Suites are reported `passed/total`; pre-existing failures are named, never
  absorbed, and never covered by a blanket "nothing is mine" claim (router §2.6).
- Every new policy value lives in a sealed register row via T16's mechanism;
  missing rows fail loudly (goal 39–40). No code constants.
- Every degradation or skip emits a visible condition mark (Scope law, goal 26).

