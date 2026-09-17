## r1

### Case file

The review found four blockers, but they share two causes rather than four unrelated
symptoms.

First, the schema change was enumerated only through production call sites and the focused
T5 fixtures. The shared runner response factory in `tests/integration/database.test.ts`
was not treated as a consumer, and the catch-up review path was treated as if an explicit
empty list made it compliant. It does not: an explicit wrong value is still wrong. The
price is one r1 rework round and a broad runner-suite repair that could have been avoided
by enumerating every review response producer alongside every review call site.

Second, the evidence tested the components in a hand-written orchestration rather than the
production composition root. The flagship helper calls `Judge.review` and
`GraphWriter.recordEdgeMeasurements` itself, so the reported M1 mutant proves the graph
writer is load-bearing but does not prove the runner's `sourcedEdges` transport or
writeback is load-bearing. The same shortcut admitted a false `polarity: "attack"` for the
support edge because the scripted provider ignores its prompt. The price was roughly
30 minutes of static trace work to separate correct arithmetic from incomplete orchestration
evidence, plus another rework round unless the existing database runner fixture is upgraded
to carry the headline proof.

### What I nearly got wrong

I nearly accepted M1 as a full chain mutant because it crosses judgement, graph,
materialisation, and propagation. The decisive check was asking which production line
could be deleted without making the test red: the runner's writeback can be deleted while
the test helper continues to call the graph method directly. I also nearly accepted
F-T5-2 as future work because the worker disclosed it candidly; comparing it again with
S3-1 showed that catch-up is itself a reviewer visit for a node that can own sourced edges.

I initially treated the migration's clear preflight policy as sufficient. The packet's
T8-fixture requirement is stronger: old-valid state must actually be seeded at 0051 and
0052 must be applied in isolation. A from-empty `migrate()` run cannot prove that.

### Dead ends and severity calibration

- F-T5-1 looked like an immediate replay blocker, but the only two production callers do
  not reach `addEdge` after a measured edge exists: `spawnPendingChild` returns from its
  replay guard, while the runner must insert the node before it inserts the edge. This is
  T7/replay-adjacent future work, not an in-lane merge blocker.
- F-T5-6 looked like a new FINAL≠TAU hazard, but the empty-resolution snapshot predates
  T5, is named `MaterialisedGraphSnapshot`, and current runner/catch-up/test callers overlay
  register-backed resolutions before `evaluate`. It is an API-hardening V row.
- D16 was not worth re-running under a STATIC-only packet. The kernel trigger is real,
  the two layout files are unchanged from `86ce04f`, and earlier base/HEAD pairs record the
  same single TS2882 on each surface.

### Packet friction and one-prompt upgrades

The worker packet contradicts itself at `t05-edges.md:51-53`: it orders the marker on the
first line and then says the marker is last. That did not invalidate the code, but it costs
every seat a format decision and makes automation depend on which sentence the seat chose.

The fleet can make this class of task cheaper with four mechanical packet checks:

1. For a strict response-schema change, enumerate both call sites and every fixture/fake
   that produces the response.
2. For an orchestration claim, require a mutant at the production composition root; a
   hand-written replica is supporting evidence only.
3. For a migration after N, require three named fixture arms: old-valid convergence,
   old-valid-but-policy-refused non-destructive failure, and post-upgrade rejection.
4. Emit one unambiguous marker location and validate it before dispatch.

## r2

### Case file

The four r1 blockers were repaired, but making the graph numerically live exposed a
durability boundary that the happy-path rework did not test. The reviewer response is
one logical fact: a node review plus the bearings returned by that same call. Production
persists it as two independent commits, review first and graph update second. If the
second commit fails, the append-only review makes the node disappear from the catch-up
query while its edge can remain UNKNOWN. The price is the third and last lawful rework
round; the avoidable review cost was tracing two repositories and their transaction
wrappers after the unit fixture showed only the success path.

Two evidence defects came from imitating a nearby fixture rather than the production
operation. The 0052 `applyOne` helper copied T8's SQL-only transaction, so its assertion
that the migration ledger lacks 0052 is green after success too. The same fixture says
its operator disposition preserves `0.75` while setting the strength to NULL. Neither
changes the migration SQL verdict, but both make the evidence say more than it proves.
The packet made a similar category error: it named a plain working-tree `git diff` as the
r1-to-r2 delta even though it also said the worker had committed `1f832f6`; that command
is necessarily empty on the clean committed tree.

### What I nearly got wrong

I nearly approved B2 after confirming that sourced edges reach the catch-up reviewer and
that the same response is passed to the graph writer. The decisive question was what
happens between the two awaited calls. `recordNodeReview` commits first; the graph writer
opens a different transaction. Because `ledger.node_review` is append-only and unique by
node, the partial state is not merely a transient exception—it changes future work
selection permanently.

I also nearly accepted the migration-ledger assertion because the fixture follows the T8
shape exactly. Comparing `applyOne` with the production `migrate()` loop showed that the
fixture omits the migration-row insert it claims to test.

### Dead ends and severity calibration

- I checked whether EDGE-target undercuts made the catch-up query incomplete. Current
  shipped callers mint the node-target shape at issue, so I did not turn future breadth
  into a T5 finding.
- I recomputed the richer runner topology independently. Two `0.25` attacks aggregate to
  `0.4375`; two `0.125` supports aggregate to `0.234375`; the published sigma yields
  `0.3984375`, delta `0.1015625`. M6 and M7 both fail at the production seam, so B4 is
  genuinely closed.
- F-T5-9's proposed wire-producer search does find `database.test.ts` in the revised tree.
  The process statement is sound; no new finding was manufactured from its wording.

### Packet friction and one-prompt upgrades

The packet's committed-delta command cost a manual parent lookup and a second diff. A
packet generator should reject a clean-tree `git diff` when a worker commit is declared
and emit `git diff <reviewed-tip>..<worker-tip>` instead.

The worker prompt should also require one failure-injection invariant whenever one model
response is persisted across repositories: fail each later write and prove retry or
rollback preserves eligibility. Migration fixtures should use the same helper as the
production migrator, including schema-ledger insertion, then assert both success presence
and refusal absence. These two generated checks would have made this r2 verifiable in one
pass.

## r3

### Case file

The runtime repair is correctly composed: the node-review insert and all non-null edge
measurements share one transaction under the run advisory lock, and both production paths
call it. The remaining failure is in the guarantee around that repair. The worker reduced
"the old pair is unexpressible" to a regex for the exact token
`recordNodeReview(`. Valid TypeScript with one intervening space compiles, expresses the
same old two-transaction pair, and passes the pin. The public standalone review method
also remains available. The price is the third and final lawful rework round for an
evidence/pinning defect rather than another transaction redesign.

The RED record repeated the same substitution. The file labelled as the stranded RED is
a 1/1 passing characterization test that manually invokes the old shape. The three-test
RED fails earlier in fixture setup while attempting a forbidden update to append-only
`core.node`; it never reaches `recordReviewWithMeasurements`. Those logs explain the bug,
but neither is a mutation test proving the production composition goes red if reverted.

### What I nearly got wrong

I nearly approved after tracing the shared `PoolClient`, `withWriteTransaction`, advisory
lock, rollback behavior, and both call sites. All of that is sound. The packet's explicit
instruction to try to express the sequential pair statically was decisive: adding a
space before the call parenthesis made the test's regex return false while JavaScript's
parser accepted the source.

I also nearly treated any failing pre-fix log as RED evidence. Reading the stack showed
all three failures originated in `authorArtifactOf` before the operation under review.
Failure color is not enough; the failure must reach and discriminate the property.

### Dead ends and severity calibration

- I looked for a judgement-to-graph package edge. There is none: both client-scoped
  primitives depend only on existing database types, and `apps/runner` lawfully composes
  them. This part of B1 is closed.
- The cannot-assess arm is intentionally asymmetric: the review commits while null
  bearings leave edges UNKNOWN. That is an honest result, not an atomicity leak.
- N1-N3 are genuinely repaired. The migration helper now inserts its schema-ledger row,
  M8 reaches and kills the formerly vacuous assertion, and the operator prose says it
  withdraws 0.75. The FINAL numbers and the eight-file zone failure set are unchanged.
- F-T5-10 accurately names the one-way-door class. It is a useful standing packet clause,
  not another lane blocker.

### Packet friction and one-prompt upgrades

The r3 packet repeats the exact committed-delta defect filed as r2 N4: plain `git diff`
is empty at clean commit `23df453`, so the parent had to be recovered again. The worker
report also calls rework round 2 "the last lawful round" while the board, packet, and its
own footer say 2 of 3. These are mechanically preventable dispatch/report errors.

For one-prompt convergence, require every source-law pin to carry a bypass table:
whitespace, comments, optional chaining, computed access, destructured aliases, and
direct low-level primitives. Prefer eliminating the unsafe public composition or an
AST-aware architecture rule over regex matching. Require the RED log to name the
property's expected failure and verify its stack reaches the target operation; then
mutate the actual production call site back to the forbidden pair and show that exact pin
goes RED. Finally, packet generation should derive both commit ranges and remaining-round
language from board state rather than hand-writing either.

## r4

### Case file

Deletion closes the stated seal. `JudgementRepository.recordNodeReview` and
`GraphWriter.recordEdgeMeasurements` are absent from the public production types. The
whitespace probe, bound alias, and computed-access variants now produce the five expected
TypeScript diagnostics, and the architecture test requires the probe project to fail
while naming both deleted methods. M9 restores the old sequential calls at the real
runner seam and fails on two missing-property diagnostics. The production runner remains
byte-unchanged in r4, and the existing atomicity arms still pass in all three zone logs.

The price of convergence was four Codex verification rounds and all three lawful worker
rework rounds. That makes residue routing important: no issue discovered here can be
phrased as another worker iteration. The product blocker is closed, but two mechanical
residues are ready for V disposition: the packet repeats its empty committed-delta
command, and three unrelated TypeScript files changed from mode 0644 to 0755.

### What I nearly got wrong

I nearly expanded the packet's property from deletion of the two standalone public
methods into deletion of every client-scoped primitive. That would reject the intended
transaction composer itself: the runner needs client-bound preparation and insertion
operations inside one transaction. The relevant boundary is that the old high-level
two-transaction pair cannot be expressed through the deleted public methods; the probe
matrix and M9 establish exactly that. The test-only helper can recreate unsafe setup, but
the architecture import rules keep it out of `apps/` and `packages/`, and the static
search found no production import.

I also treated "untouched" carefully. The integration fixtures changed so they could
construct historical unsafe states after API deletion, but the production runner did
not change and the three atomicity properties still execute and pass. That is compatible
with the packet's runtime-preservation requirement.

### Dead ends and severity calibration

- The five diagnostics are substantive, not regex theatre: TS2339 covers direct and
  bound access, while TS7053 covers computed access.
- The r3 evidence corrections are honest. The earlier atomicity RED was a fixture-setup
  failure, the stranded-write log was a passing characterization, and M9 is now the
  property-discriminating mutation.
- The zone remains identical across three runs at 8 failed and 532 passed, with the same
  fail-set digest. Static arithmetic independently reproduces production FINAL
  `0.3984375`, constructed FINAL `0.4375`, and delta `0.1015625`.
- The executable-bit drift does not reopen atomicity, so it is nonblocking product-wise.
  It is nevertheless outside the stated seal/probe/report delta and must not be silently
  accepted at the rework cap.

### Packet friction and one-prompt upgrades

The committed-delta defect survived r2, r3, and r4: plain `git diff` is empty on clean
commit `ab7881a`, whereas `git diff 23df453..ab7881a` reveals the eleven-file change. A
packet generator should derive and validate an explicit base/tip range and refuse to
dispatch when a declared worker commit yields an empty review delta. A second mechanical
guard should reject executable-bit changes on non-script source files unless the packet
explicitly permits them. Finally, seal packets should keep the mechanism ladder used
here—ordinary call, whitespace, bound alias, computed access, then a mutation at the real
production seam—so "unexpressible" is demonstrated rather than inferred.
