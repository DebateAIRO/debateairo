CODEX REVIEW T5 r1 — CHANGES · comments read through: t05-r1-2026-09-01

# Verdict

**REWORK / CHANGES — 4 blocking findings, 1 non-blocking packet finding.** Round r1 of
three. No test, build, live-provider call, product edit, board mutation, or git mutation was
performed; the review packet required STATIC-only work.

## Packet review

The dispatch constants that can be settled statically are sound:

- Board T05 is `waiting_review`; the review packet's two writable report paths cover both
  required deliverables and no demanded deliverable falls outside them.
- `HEAD=31ea5aa752c0e5d443fd5de83af91d0a3e9abf7c`, with production/migration commit
  `e2f7e1dbcdfd330706e5aa00637f921ec872b002` directly above base
  `86ce04fecff5b4bea7d36b0772d99cb032b648cb`.
- The worker report's `sed '$d'` hash reproduces as
  `3125a46754e1442288ab30c08caee599cd995678d9e0827f79e35713c4c0e4e5`.
- The goal prompt reproduces the SPEC-declared hash
  `78238eebe3a04c38bf6bda89207371abb580c380c8d93a0f4559f5f7a6381986`, and goal
  lines 144–159 are byte-identical to the frozen T5 block.
- The worker packet's absolute working directory resolves. Its `0050`, `0051`, base, and
  moved-anchor claims agree with the inspected artifacts.

The packet is not format-consistent; see N1.

## Independent headline probe

I traced the property from the frozen claim, not from the worker's verdict. For the
constructed values, the production arithmetic is:

```text
leaf A = leaf S = leaf N = 0.5
attack = 0.5 * 0.5 = 0.25
support = 0.25 * 0.5 = 0.125
N is UNKNOWN, so its contribution is absent
agg([0.25]) = 0.25; agg([0.125]) = 0.125
σ(0.5, 0.25, 0.125) = 0.5 - 0.5 * (0.25 - 0.125) = 0.4375
τ = 0.5; FINAL = 0.4375; Δ = 0.0625
```

That arithmetic matches `packages/published-arithmetic/src/index.ts:1-8`. The in-test
control at `tests/integration/t05-measured-edges-database.test.ts:265-267` checks every
arrow is UNKNOWN and the root remains exactly `tau` before measurement. M5 is a real
number-level discriminator: inverting the bearings moves the expected result to 0.5625.
M1 proves the graph update method is load-bearing, but it does not prove the production
runner transport/writeback is load-bearing; see B4.

## Static requirement trace

- **Ordinary in-run call / ledger topology:** `Judge.review` carries a length-pinned
  `edge_bearings` array. `WalkingSkeletonRunner` passes `authoredNode.sourcedEdges` at
  `apps/runner/src/index.ts:2173-2185` and writes the same response at 2204-2208. Static
  search finds no measurement-only provider call site. The focused ledger fixture records
  only the three `JUDGE:review:<node>` keys, but it manually composes the path (B4).
- **Catch-up:** the second production review site passes `edges: []` for every node. This
  refutes the all-call-sites claim (B2).
- **Sentinel:** the former DR-184 scan is inverted in place and names
  `requires a shipped writer to emit a measured edge`. The drafted 2026-09-01 retirement
  cites S3-1, names the inversion, limits the repeal to the all-UNKNOWN constraint, and is
  faithful to the actual S3-1 text: existing review visit, zero extra calls,
  different-maker measurement.
- **Rename:** the old product literal remains only in migration/history/rejection contexts:
  migration 0002, migration 0052's preflight/rename, a kernel retirement comment, and the
  post-upgrade rejection test. Current typed consumers use `REVIEWER`.
- **Cannot-assess:** a `null` bearing is skipped by
  `GraphWriter.recordEdgeMeasurements`; the edge stays UNKNOWN, and propagation excludes
  UNKNOWN/null contributions at `packages/propagation/src/index.ts:371-376`.
- **S4-1:** panel members call `Judge.assess` in the `PANEL:` namespace and receive
  `JudgeSubjectInput`, which has no edges. Review calls `Judge.review` separately in the
  `JUDGE:review:` namespace.
- **Migration:** 0052 follows 0051 and its SQL states a coherent legacy policy, but the
  required upgrade fixture is absent (B3).
- **D16:** kernel is changed, so both surface gates were required. The worker recorded one
  TS2882 at `layout.tsx:3` for each surface. Both layout files have zero diff from base;
  independent prior base/HEAD reports record the same pair. I did not re-run the gates
  because this packet forbids builds.

## Findings

### B1 · Existing multi-maker runner fixtures cannot satisfy the new strict review schema

**File/line:** `tests/integration/database.test.ts:208-210`, consumed throughout at
450, 1835/1841, 1979-1987, 2061-2066, and later runner fixtures; required schema at
`packages/judgement/src/index.ts:119-125,367-424`.

**Failure scenario:** `reviewDouble("agree", "ok")` returns
`{"outcome":"agree","reasons":["ok"]}`. Even when the reviewed node sources zero
edges, `edge_bearings` is a required key. The strict parser therefore returns
`NODE_REVIEW_SCHEMA_FAILURE`; for edge-sourcing nodes, any empty-array patch would still
fail the length pin. The depth-2 fixture at 1831-1884 expects `COMPLETED` but receives a
review failure instead.

**Evidence:** the shared factory is unchanged from `86ce04f`; `git diff --exit-code` for
this file is empty. Static search finds dozens of calls to that factory, while the worker's
63-file zone omitted `tests/integration/database.test.ts`. No runtime result is claimed
because tests were forbidden.

**Required fix:** RED-first update the provider double so review responses carry bearings
with the cardinality and polarity implied by the actual request, then run every affected
runner fixture. Do not paper over this with `edge_bearings: []` globally.

### B2 · Catch-up reviews silently declare edge-owning nodes to have zero sourced edges

**File/line:** `apps/runner/src/index.ts:441-466,582-615`; unchanged test seam
`tests/unit/dr184-catch-up.test.ts:7-60`.

**Failure scenario:** `readUnreviewedNodes` returns node N after its in-run review failed;
N sources an UNKNOWN edge E. `runReviewCatchUp` invokes the reviewer with `edges: []`, so
the model lawfully returns `edge_bearings: []`. The review is persisted and N becomes
reviewed, but E remains UNKNOWN forever. The only reviewer visit that succeeded did not
return a bearing for every edge sourced by N, contrary to S3-1 and the frozen T5 text.

**Evidence:** `ReviewCatchUpNode` has no sourced-edge field, catch-up hardcodes the empty
list, and its dependency contract has no edge reader or measurement writer. The existing
catch-up test is byte-identical to base and only checks call key/bound, so this path has no
RED for the new property.

**Required fix:** add a RED catch-up fixture with an edge-owning unreviewed node; load the
node's applicable sourced edges, carry them on the same catch-up review call, and persist
the returned measurements without creating a measurement-only call. Make the already-
measured policy explicit and test the one-way ratchet.

### B3 · 0052's legacy policy is not exercised as an upgrade from 0051

**File/line:** `migrations/0052_t5_reviewer_measured_edges.sql:35-82`;
`tests/integration/t05-measured-edges-database.test.ts:21-30,329-379`.

**Failure scenario:** database A is migrated through 0051 and contains an old-valid
`UNKNOWN/NULL/EVIDENCE_VERIFIER` edge; 0052 must rename it to `REVIEWER` without inventing
a magnitude. Database B contains an old-valid `MEASURED/<number>/EVIDENCE_VERIFIER` edge;
0052 must refuse with `T5_LEGACY_MEASURED_EVIDENCE_VERIFIER` and roll back non-
destructively. Neither transition is tested. The current test calls `migrate()` from empty
and only verifies that the retired literal is rejected after 0052.

**Evidence:** the only `applyThrough`/`applyOne` upgrade harness remains
`tests/integration/t8-upgrade-migration.test.ts`; static search finds no 0052 or T5
preflight reference in an upgrade test.

**Required fix:** copy the T8 fixture pattern: apply through 0051, seed each legacy shape
in its own database, apply 0052 alone, assert clean convergence for UNKNOWN state and
loud/non-destructive refusal for measured state, then assert the replacement constraint
is validated.

### B4 · The flagship chain test bypasses the production runner wiring it claims to pin

**File/line:** `tests/integration/t05-measured-edges-database.test.ts:194-223,250-299`;
production transport/writeback at `apps/runner/src/index.ts:2173-2208`.

**Failure scenario:** remove `edges: authoredNode.sourcedEdges` and the runner's
`recordEdgeMeasurements` call. The focused FINAL≠TAU and ledger tests still manually call
`Judge.review` and `GraphWriter.recordEdgeMeasurements` in `reviewAndMeasure`; they never
instantiate `WalkingSkeletonRunner`. The reported M1 mutation changes the graph method,
not the production composition-root call site. The helper also labels every offered edge
as `polarity: "attack"` at line 218, including the support edge, and remains green because
the scripted gateway ignores its prompt.

**Evidence:** static search finds no T5 test that invokes `WalkingSkeletonRunner` with
`edge_bearings`; all test references to `recordEdgeMeasurements` are the helper or direct
method guards. Existing runner tests cannot currently supply the new schema (B1).

**Required fix:** make a real `WalkingSkeletonRunner` fixture produce the constructed
UNKNOWN graph and review responses, then assert the post-run MEASURED rows, ledger key
set, and `0.5 -> 0.4375` result. Demonstrate RED when the runner writeback or sourced-edge
transport is removed, and preserve each edge's actual polarity in the prompt.

### N1 · Worker packet gives mutually exclusive marker positions

**File/line:** `.hermes/reports/2026-09-01-algorithm-live-loop/packets/t05-edges.md:50-53`.

**Failure scenario:** line 51 says the marker is the first line; line 53 says the marker is
last. A worker cannot satisfy both, and the filed report chose last. This did not cause the
four code/evidence blockers, so it is non-blocking, but it requires a process ticket and
same-day template fix.

**Required fix / route:** orchestrator packet-template ticket: make marker placement a
single generated invariant and validate it before dispatch.

## Judge severity rulings on declared hazards

**F-T5-1 — V row, not in-lane rework.** The changed state transition makes the identity
comparison conceptually stale, but it is not reachable through today's two product callers
after measurement. `spawnPendingChild` returns an existing placeholder before `addEdge`;
the runner creates a fresh node before calling `addEdge`, and an attempted replay collides
at node creation first. Route to the T7/replay owner with a RED reproducer before changing
identity semantics. It does not endanger this merge once B1-B4 are fixed.

**F-T5-6 — V API-hardening row, not in-lane rework.** The empty operator resolutions and
structural assignability predate T5. The public type is named `MaterialisedGraphSnapshot`,
and the runner, catch-up resolver, and focused T5 test all overlay register-backed
resolutions before `evaluate`. Route a future nominal/partial-snapshot type or rename
decision to V. It does not endanger this merge.

## Not verified

I did not execute RED/GREEN, zone, full, typecheck, D16, mutation, or migration commands;
the review packet expressly prohibited tests and builds. I therefore do not adopt the
worker's pass counts as my own verification. I also did not assess T6 outcome semantics,
T7 stopping, UI/serve behavior, provider behavior, or integration-post-merge D15.

## PREDICTIONS

Other lenses are likely to accept the 0.4375 arithmetic and miss that the test bypasses
the production runner; I expect at least one to call F-T5-2 non-blocking because it is
candidly disclosed, and at least one to focus on addEdge replay while missing that the
current shared runner fixtures cannot parse the new schema at all. I would check first
whether any lens actually traced `reviewDouble` and then whether it distinguished a
component-chain mutant from a composition-root mutant.
