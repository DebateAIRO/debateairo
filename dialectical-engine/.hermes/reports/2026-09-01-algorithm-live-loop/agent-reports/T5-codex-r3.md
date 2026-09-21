CODEX REVIEW T5 r3 — CHANGES · comments read through: t05-r3-2026-09-01

# Verdict

**REWORK / CHANGES — 1 blocking finding, 2 non-blocking findings. Use the third
and final lawful rework round; B1 is narrow enough that no V row is needed yet.** The
runtime transaction is correctly composed, but the packet's stronger requirement that
the old sequential pair be unexpressible is not met, and the retained RED does not
discriminate the production composition.

This was a STATIC-only review. I ran no test, build, typecheck, migration, live-provider,
or mutation command and made no product, board, or git mutation.

## Packet review

- Board T05 is `changes_requested`, `rework_round: 2`, with one rework round remaining.
  The packet's two writable paths cover both demanded deliverables.
- The revised report has the required marker on line 1. Its line-2 SHA declaration is
  reproduced by `sed '2d' | shasum -a 256` as
  `fedbf4f1037765875788af740c5ac117da7d4da68ccf1faf61700c79bd0129f8`.
- The reviewed tip is `23df453e03a249476d991c8fdba159d510699a97`; its parent is
  `1f832f66afdeef3bb72530532a779faa1c25b054`. The lane worktree was clean.
- The actual parent-to-tip delta contains the six reported files: runner, graph,
  judgement, the measured-edge integration fixture, the 0052 upgrade fixture, and the
  catch-up unit fixture. It is 483 insertions and 135 deletions. The packet again gives a
  clean-working-tree command for a committed delta; see N1.

## Atomicity trace

The runtime half of B1 is repaired:

- `apps/runner/src/index.ts:455-489` prepares the encrypted review before opening the
  transaction, then uses one `withWriteTransaction` callback for the run advisory lock,
  `insertPreparedNodeReview`, and every `recordEdgeMeasurementsOnClient` update.
- `packages/judgement/src/index.ts:557-604,672-704` separates preparation from a
  client-scoped insert without duplicating the review writer.
- `packages/graph/src/index.ts:199-253,413-426` exposes the existing measured-update law
  on a caller-owned client; `GraphWriter` delegates to it.
- Catch-up routes through the combined dependency at
  `apps/runner/src/index.ts:697-710,781-798`, and the ordinary
  `WalkingSkeletonRunner` routes through it at 2286-2299.
- The graph and judgement packages still do not import one another. Their declared
  architecture rows remain separate, and the already-lawful runner depends on both.

Consequently, a refused numeric edge update rolls back the review insert, successful
review plus bearings land together, and null bearings intentionally leave UNKNOWN edges
while the cannot-assess review lands. The implementation does not need another
transaction redesign.

## Independent source-level probe

The committed regression pin reads the runner source and applies
`/\brecordNodeReview\(/`. I expressed the forbidden pair with legal whitespace and asked
JavaScript's parser and the exact pin to evaluate the same source. The static output was:

```text
{"sourceCompiles":true,"pinRejects":false,"source":"async function bypass(j,g){await j.recordNodeReview ({});await g.withGraphWrite(\"run\",async()=>{})}"}
```

The standalone `JudgementRepository.recordNodeReview` and
`GraphRepository.withGraphWrite(...recordEdgeMeasurements...)` APIs remain public. The
ordinary runner still owns both repositories. The pair is therefore expressible in the
same production file while the regression test stays green. Destructuring or aliasing
would bypass the token pin as well. See B1.

## Retained RED/GREEN evidence

- `r3-red-B1-stranded-halfwrite.log` proves the old shape's state: one committed review,
  edge strength 0.25/MEASURED, node absent from catch-up, and a UNIQUE refusal on a second
  review. But the command result is `1 passed | 13 skipped (14)`; it is a passing
  characterization test, not a RED regression discriminator.
- `r3-red-B1-atomicity.log` reports `3 failed | 10 skipped (13)`, but all three stacks
  stop in `authorArtifactOf` while attempting a forbidden `UPDATE core.node SET
  provenance_ref=...`. They never reach `recordReviewWithMeasurements`. This contradicts
  the report's claim that the log is RED because that operation did not exist.
- `r3-green-B1-atomicity.log` reports 15/15 passing and exercises refusal, success,
  cannot-assess, the characterization demo, and the regex pin. Green behavior is real,
  but there is no property-level RED or production-pair mutant to validate the pin.

Heartbeat law requires RED before GREEN on every rework round. A fixture-setup failure
and an always-green demo cannot substitute for a discriminator that turns red when the
production path regresses.

## N1-N3 rework verification

- **Prior N1 is closed.** `ReviewCatchUpReviewer.review` now says to offer every still-
  unmeasured sourced edge, permits empty only when none remains, and directs a reviewer
  who cannot assess to return null. The false empty-list instruction is gone.
- **Prior N2 is closed.** `applyOne` now executes the SQL and inserts the schema-ledger
  name in the same transaction. Both success paths assert presence and refusal asserts
  absence. Retained M8 first makes the refusal unexpectedly resolve, then—after earlier
  discriminators are probed aside—changes the retired stamp and finally produces
  `expected true to be false` at the ledger assertion. The green fixture reports 4/4.
- **Prior N3 is closed.** The operator arm and its name now state that the demonstrated
  action withdraws 0.75 by restoring UNKNOWN/NULL; they no longer claim to preserve it.

## FINAL numbers, zone, scope, and F-T5-10

The production seam file is unchanged by `23df453`. Recomputing from its run-owned
values gives two 0.25 attack contributions and two 0.125 support contributions:

```text
agg(attack)  = 1 - 0.75^2  = 0.4375
agg(support) = 1 - 0.875^2 = 0.234375
FINAL = 0.5 - 0.5 * (0.4375 - 0.234375) = 0.3984375
delta = 0.1015625
```

The constructed three-node fixture still pins 0.4375. Thus the two headline values are
unchanged.

All three retained r3 zone logs report `8 failed | 483 passed (491)`. Their extracted
failure sets share SHA-256
`c0e2f431db200302474e94a7f1c70823f4e792efdaa382c46fa01cf0aceac895` and contain the same
eight boarded tests as r2. The scaffold payload itself contains only the three existing
obs-capture dependency edges and three existing obs-capture environment reads; none names
an r3-delta file. The client-scoped exports add no judgement-to-graph or graph-to-
judgement package edge.

F-T5-10 is accurate as filed: append-only state plus node uniqueness plus a reader that
selects only the not-yet-done set forms a one-way door when an earlier write commits
without a later required write. Requiring lanes to enumerate such tables and later-write
failure behavior is an appropriate process rule.

## Findings

### B1 · The forbidden sequential pair compiles and passes the source-level pin

**File/line:** `tests/integration/t05-measured-edges-database.test.ts:339-397`;
`packages/judgement/src/index.ts:696-704`; `packages/graph/src/index.ts:418-426`;
worker evidence claim at `agent-reports/t05-edges.md:30-50,70-95`.

**Failure scenario:** a maintainer replaces the ordinary runner's combined call with
`await this.#judgements.recordNodeReview ({...})` followed by
`await this.#graph.withGraphWrite(...recordEdgeMeasurements...)`. The space before `(` is
valid syntax. The two public methods recreate the irreversible r2 half-write, but the
test's `/\brecordNodeReview\(/` does not match, so the claimed source-law pin remains
green. An alias such as `const persist = this.#judgements.recordNodeReview.bind(...)`
also avoids it.

**Evidence:** the independent static probe above compiled the whitespace form and returned
`pinRejects:false`. Static repository search confirms both standalone methods remain
public. The supposed half-write RED is 1/1 passing, while the three actual failures stop
at an append-only fixture update before the atomic operation. No retained result shows
the pin going RED when a production call site is changed back to the old pair.

**Required fix:** use the third and final rework round. Make standalone review-plus-edge
composition structurally unavailable to production—prefer removing/restricting the
unsafe high-level API—or enforce it with a syntax-aware architecture rule that survives
whitespace, comments, optional/computed property access, and aliases. Then mutate the
actual ordinary runner back to the sequential pair and retain a RED whose failure reaches
that rule/property; restore the combined path and retain GREEN. Keep the real transaction
and both combined call sites unchanged.

### N1 · The r3 packet repeats the committed-delta defect already filed as r2 N4

**File/line:** `.hermes/reports/2026-09-01-algorithm-live-loop/packets/t05-codex-r3.md:17`.

**Failure scenario:** at clean committed tip `23df453`, the literal `git ... diff`
returns no paths, so priority item 7 cannot be verified from the declared r2-to-r3 delta.

**Evidence:** the worktree diff is empty; `git diff 1f832f6..23df453` exposes the six-file
483/135 change. This is the same packet-template failure routed in r2.

**Required fix / route:** orchestrator, same day: emit and validate an explicit
reviewed-tip-to-worker-tip range whenever the packet names a worker commit.

### N2 · The worker report calls round 2 the last round while also recording 2 of 3

**File/line:** `agent-reports/t05-edges.md:6,214`; board T05 `rework_round: 2` and r3
packet lines 5 and 35.

**Failure scenario:** a controller follows line 6's "last lawful round" statement and
routes this CHANGES verdict directly to V, even though the board, packet, protocol, and
the report's own footer leave the third rework round available.

**Evidence:** line 6 says `2 of max 3 — the last lawful round`; line 214 says
`Rework rounds spent: 2 of 3`. The board and packet explicitly say one remains.

**Required fix / route:** T5 final-rework report correction, with round language derived
from board state rather than handwritten.

## Not verified

The packet forbids tests and builds, so I did not independently execute the atomicity,
migration, M8, zone, typecheck, D16, or mutation commands. I verified retained output
against the changed source, performed only the static parser/regex probe above, and
recomputed the arithmetic. I did not assess T6, T7, D15 post-merge integration, live
providers, or external services.

## PREDICTIONS

Other lenses are likely to approve because the shared transaction is visibly correct and
the retained 15/15 looks comprehensive. I expect most to miss that the source law checks
one exact token spelling and that its labelled RED either passes or dies in fixture setup.
I would check first whether another lens inserted whitespace or an alias into the old pair,
then whether it read the RED stack far enough to see `authorArtifactOf` rather than the
atomic operation. I also expect the repeated committed-delta packet defect and the
contradictory remaining-round language to be treated as harmless metadata, despite both
already costing a seat cycle.
