CODEX REVIEW T5 r2 — CHANGES · comments read through: t05-r2-2026-09-01

# Verdict

**REWORK / CHANGES — 1 blocking finding, 4 non-blocking findings. Round 3 is the
last lawful rework round.** The four r1 blockers are substantively repaired, but the
new live review-to-measurement path can commit an unrecoverable half-write. The N-findings
also require same-day tickets and fixes; this contract has no "pass with concerns."

This was a STATIC-only review. I ran no test, build, typecheck, migration, live-provider,
or mutation command and made no product, board, or git mutation.

## Packet review

- Board T05 is `changes_requested`, `rework_round: 1`; the packet's two writable paths
  cover its two demanded deliverables.
- The revised report is 767 lines, has the required marker on line 1, and its line-2
  declaration is reproduced by `sed '2d' | shasum -a 256` as
  `698cfbdfe94c62dca0c20701c02c34aae28e848eb1fe7caec905e03939e63161`.
- The reviewed tip is `1f832f66afdeef3bb72530532a779faa1c25b054`; its parent is
  `31ea5aa752c0e5d443fd5de83af91d0a3e9abf7c`. The lane worktree was clean.
- The actual parent-to-tip delta contains only five worker files: runner, judgement,
  `database.test.ts`, `dr184-catch-up.test.ts`, and the new 0052 upgrade fixture. It is
  613 insertions and 7 deletions. The packet's literal delta command cannot expose this
  committed delta; see N4.

## Independent headline probe

I derived the production-seam oracle from the run's own values in the fixture, not from
the worker's stated result. Every relevant leaf has `tau = 0.5`. The response policy gives
each attack bearing `0.5` and each support bearing `0.25`, and the real runner topology
gives the selected parent two of each:

```text
attack contributions = 0.5 * 0.5   = 0.25, 0.25
support contributions = 0.25 * 0.5 = 0.125, 0.125
agg(attack)  = 1 - (1 - 0.25)^2  = 0.4375
agg(support) = 1 - (1 - 0.125)^2 = 0.234375
FINAL = 0.5 - 0.5 * (0.4375 - 0.234375) = 0.3984375
delta = abs(0.3984375 - 0.5) = 0.1015625
```

The test derives the selected node's tau and bearings from the materialised production
run before applying the published aggregate and sigma functions. Retained M6 and M7 logs
both show `expected 0 to be greater than 0`, with `1 failed | 64 skipped (65)`, when the
runner's sourced-edge transport and writeback are removed respectively. Static search
found no mutant or probe marker in the four production files. B4 is closed.

## r1 blocker verification

### r1 blocker B1 — shared runner double: closed

`tests/integration/database.test.ts:224-273` carries a policy sentinel in the scripted
response, parses the actual HTTP request at the provider boundary, reads every offered
edge's relation, and expands one bearing per live edge. The default policy is
`cannot-assess`, so each actual edge receives `null`; it is not a global empty-array
patch. Explicit support/attack policies preserve polarity.

The retained RED database log reports `14 failed | 50 passed (64)`; GREEN reports
`1 failed | 63 passed (64)`. The sole survivor is the same `claims, judges through the
HTTP gateway...` base-red boarded in `t00-baseline.md`, so the worker's 13-of-14
attribution is supported. The observed review failures are correctly identified as
`NODE_REVIEW_UNAVAILABLE`: `apps/runner/src/index.ts:2250-2259` catches the parser error
and wraps it with that code.

### r1 blocker B2 — catch-up false declaration: happy path closed, durability blocker remains

`packages/judgement/src/index.ts:684-735` loads UNKNOWN edges sourced by each unreviewed
node, including the target statement and actual polarity. `runReviewCatchUp` passes
`node.sourcedEdges` to the same reviewer visit at `apps/runner/src/index.ts:620-632` and
hands that response's measurements to the graph writer at 648-653. Null bearings are
skipped by `GraphWriter.recordEdgeMeasurements` and therefore remain honestly UNKNOWN;
no measurement-only model call exists. This closes the r1 false-empty-list scenario.

The persistence sequence is not failure-safe, however. That is the new B1 below.

### r1 blocker B3 — 0052 upgrade fixture: transition behavior closed, evidence defects remain

`tests/integration/t5-upgrade-migration.test.ts` applies through 0051, seeds separate
0051-valid databases, and applies 0052 alone. Arm A proves
`UNKNOWN/NULL/EVIDENCE_VERIFIER` becomes `UNKNOWN/NULL/REVIEWER`, validates the replacement
constraint, and rejects the retired literal. Arm B proves the measured legacy row raises
`T5_LEGACY_MEASURED_EVIDENCE_VERIFIER`, remains unchanged, and can converge after an
explicit operator edit. The retained focused log records 4/4 passing.

The migration's principal policy is therefore exercised, but two statements in this new
fixture are not true evidence; see N2 and N3.

### r1 blocker B4 — production seam: closed

The flagship test at `tests/integration/database.test.ts:2491-2581` invokes the real
`WalkingSkeletonRunner` through `executeResil01Scenario`; doubles stop at the HTTP
provider boundary. It inspects persisted MEASURED/REVIEWER rows, asserts both polarities
and their policy-specific bearing, checks one `JUDGE:review:%` model call per node and no
measurement-like call site, then materialises and evaluates the production snapshot.
The independent arithmetic above matches its `0.3984375` result and its M6/M7 evidence
pins both production wires.

## Zone, process finding, and scope

The three retained r2 zone logs each report `8 failed | 478 passed (486)`. Their extracted
failure files have the identical SHA-256
`c0e2f431db200302474e94a7f1c70823f4e792efdaa382c46fa01cf0aceac895` and name the same
eight boarded tests: four architecture contract failures, two scaffold failures, the
database happy-path base-red, and the XREV envelope base-red. The report supplies fresh
scaffold payloads: the same three obs-capture dependency edges and three env reads, with
no r2-delta file in either payload. I did not adopt those runs as my own execution.

F-T5-9 is accurate as filed. A response-schema change's dynamic blast radius includes
wire-format producers, and the proposed literal `"outcome"` search now does locate
`database.test.ts`. This is a useful process correction, not an r2 defect.

## Findings

### B1 · Review and returned bearings are committed as two facts, leaving an unrecoverable half-write

**File/line:** `apps/runner/src/index.ts:635-653,2233-2249`;
`packages/judgement/src/index.ts:623-653,684-701`;
`packages/graph/src/index.ts:371-408,512-526`;
`migrations/0019_xrev01_node_review.sql:2-12,41-46`.

**Failure scenario:** node N sources UNKNOWN edge E. Its different-maker review succeeds
with a numeric bearing for E. `recordNodeReview` commits the append-only, node-unique
review first. The subsequent graph transaction then fails—for example, the connection
drops or E no longer satisfies `magnitude_status='UNKNOWN'`. E remains UNKNOWN, but N now
has a review. `readUnreviewedNodes` filters N out via `review.node_id IS NULL`; the review
cannot be updated/deleted and a second insert violates `UNIQUE (node_id)`. Catch-up can
therefore never repair the measurement returned by the successful call. In the ordinary
runner, the second-write error is additionally translated to `NODE_REVIEW_UNAVAILABLE`
even though the review was already recorded.

**Evidence:** `recordNodeReview` opens and commits its own `withWriteTransaction`.
`GraphRepository.withGraphWrite` opens a later, distinct transaction. Neither shipped
call site composes the review and its same-call bearings atomically, and the r2 unit test
only covers a successful measurement write. The partial state changes the future work
set, so retrying the operation is not recovery.

**Required fix:** RED-first inject failure into the later measurement write and prove the
node remains eligible and no half-review survives. Persist the review plus every non-null
bearing from that response in one transaction under the run lock, or introduce an equally
durable recovery state that remains selectable until the edge write succeeds. Cover both
ordinary in-run and catch-up composition roots; a catch-up-only mock is insufficient.

### N1 · The catch-up reviewer contract still instructs callers to send the forbidden empty list

**File/line:** `apps/runner/src/index.ts:469-475`.

**Failure scenario:** a maintainer follows the exported interface documentation. It says
catch-up offers "NO edges" and that an explicit empty list resolves F-T5-2, while the
implementation at 629-631 correctly says and does the opposite. Reusing the documented
contract restores the r1 blocker.

**Evidence:** the two adjacent T5 comments make contradictory normative claims in the same
exported surface.

**Required fix / route:** T5 r3 documentation fix: make the interface state the live
sourced-UNKNOWN-edge policy and pin the wording in the same catch-up review.

### N2 · The 0052 migration-ledger rollback assertion is vacuous

**File/line:** `tests/integration/t5-upgrade-migration.test.ts:81-94,229-232`;
production behavior at `packages/db/src/index.ts:717-742`.

**Failure scenario:** change `applyOne` so 0052 succeeds. The assertion that
`debateai_schema_migration` lacks 0052 still passes, because `applyOne` never inserts that
name on success. It therefore cannot prove the migration record rolled back on refusal.

**Evidence:** the production migrator executes the SQL and inserts its name in the same
transaction at lines 733-737; the test helper executes only the SQL before COMMIT.

**Required fix / route:** T5 r3 test-evidence fix: have `applyOne` mirror the production
ledger insert in the same transaction, assert presence on both successful arms, and
assert absence on refusal.

### N3 · The fixture says its operator disposition preserves a number that it deletes

**File/line:** `tests/integration/t5-upgrade-migration.test.ts:239-244`.

**Failure scenario:** the seeded row contains strength `0.75`. The comment calls the
chosen disposition "the narrowest one that preserves the recorded number," but the next
statement sets `strength=NULL`. An operator following the stated policy discards the
recorded number.

**Evidence:** the fixture's SQL directly contradicts its policy comment.

**Required fix / route:** T5 r3 evidence wording/policy fix: either state honestly that
this demonstration withdraws the legacy measurement, or implement and test a disposition
that actually preserves it without laundering the retired provenance.

### N4 · The r2 packet's committed-delta command necessarily returns no delta

**File/line:** `.hermes/reports/2026-09-01-algorithm-live-loop/packets/t05-codex-r2.md:16`.

**Failure scenario:** the reviewer runs the packet's literal `git ... diff` at clean
committed tip `1f832f6`. It returns no paths, so priority item 7 cannot be verified from
the command the packet declares to be the r1-to-r2 delta.

**Evidence:** the worktree diff is empty. `git diff 31ea5aa..1f832f6` exposes the five
files and 613/7 stat stated above.

**Required fix / route:** orchestrator packet-template ticket: when a worker commit is
declared, emit an explicit reviewed-tip-to-worker-tip range and validate that it is
non-empty before dispatch.

## Not verified

The packet forbids executing tests and builds, so I did not independently run B1/B2/B3/B4,
zone, migration, typecheck, D16, or mutant commands. I verified retained outputs against
the code and recomputed the arithmetic statically. I did not assess T6 outcome semantics,
T7 replay/stopping, provider behavior, D15 post-merge integration, or any live service.

## PREDICTIONS

Other lenses are likely to approve because all four named r1 scenarios are visibly fixed
and both composition-root mutants are now honest. I expect the most common miss to be
treating two sequential awaited writes as one durable review fact; I would check first
whether another lens injected failure after `recordNodeReview`, then whether it noticed
that `readUnreviewedNodes` makes that partial state permanent. A second likely miss is
accepting the 0052 fixture because it copies T8 without comparing its SQL-only `applyOne`
helper to the production migrator's schema-ledger insert.
