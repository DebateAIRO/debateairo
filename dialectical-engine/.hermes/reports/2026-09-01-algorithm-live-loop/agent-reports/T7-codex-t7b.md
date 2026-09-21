CODEX REVIEW T7B — APPROVE · comments read through: t7b-2026-09-02

# T7B codex static review

## VERDICT

**PASS / APPROVE. Finding count: 0.** V-authorized micro-ticket T7B closes codex r3 B1
without widening scope. The `NO_MEASURED_EDGE` arm now returns the already-computed `moved`
list while retaining `CONTINUE / NO_MEASURED_EDGE`; the exact counterexample, the preservation
of J15(b), and the reported-defect mutant are pinned adequately for this one-line correction.

## SCOPE AND PRODUCT RESULT

Fresh read-only metadata identified HEAD
`3ea7fd3325d5daf9716221105a1af8e2a7512afa`, tree
`f7bbe9c9a45d8460493a837557df0b62c84223ec`, and an empty short status. The diff from
`b64c1d04` is exactly two files and `44 insertions(+), 1 deletion(-)`: the propagation source
and its unit file. `git diff --check b64c1d04..HEAD` returned no output.

The only executable product change is
`packages/propagation/src/index.ts:928`, in the `NO_MEASURED_EDGE` arm:
`movedRootNodeIds: Object.freeze([])` becomes `movedRootNodeIds: moved`. The surrounding
addition is explanatory comment. No other return arm or product file changed. The arm still
returns `kind: "CONTINUE"` and `reason: "NO_MEASURED_EDGE"`, before the coverage and
delta-convergence arms, so J15(b)'s vacuity refusal is unchanged.

## PIN AND FAILURE DIRECTION

The fixture at `tests/unit/t07-adaptive-stopping.test.ts:1477-1498,1554-1589` supplies the
published r3 B1 input: roots A and B, expected count 2, A at `1/2` before and `3/4` after, B
absent from both evaluated strength sets, `delta = 0.01`, and the boundary call overriding
`measuredEdgeCount` to 0. The exact-result pin asserts:

```text
CONTINUE / NO_MEASURED_EDGE
measuredEdgeCount = 0
maxRootMovement = 0.25
movedRootNodeIds = ["root:A"]
comparedRootNodeIds = ["root:A"]
uncomparedRootNodeIds = ["root:B"]
expectedRootCount = 2
```

This matches the control flow: the live boundary partitions A as comparable and B as
uncomparable; `rootMovement` computes `abs(0.75 - 0.5) = 0.25`; its strict `movement > delta`
filter names A; and the zero-evidence arm returns that list without changing the dominant
reason.

The second test is not vacuous. It invokes the same genuinely moved input and rejects both a
`STOP` kind and a `GLOBAL_DELTA_CONVERGED` reason. Its negative assertions are redundant with
the preceding exact-result pin, but together they can fail in either forbidden stop direction
and directly preserve the requested J15(b) property.

The stored T7B-M1 transcript is adequate RED evidence for a micro-ticket of this shape, with
an explicit limitation. It is not pre-implementation RED and the worker does not claim it is.
It restores the reported defect verbatim, and the exact moved-root assertion fails:

```text
Tests  1 failed | 62 passed (63)
D24 COUNTS  pre=0  applied=1  restored=0
```

The transcript includes the mutant-only token, mutation diff, discriminating failure, restore
command, empty post-restore residue, and identical pre/post SHA-256
`bc2b4fe35cebeb02474e8d0608f031a6476559cf6696b267b5af53af4076cddc`. This proves the
pin catches codex r3 B1. It does not prove test-first authorship; for expected-value independence,
the relevant provenance is that the input and outputs were published in codex r3 before T7B was
implemented. Given the host hold's write -> commit -> run order and the one-assignment correction,
that combination is sufficient here.

## ARM SCAN AND PRESERVED ASSERTIONS

I confirm the worker's eight-arm scan against the finalized shared body:

1. `ROUND_1_FLOOR`, `DEPTH_CEILING`, partial-coverage `ROOT_SCOPE_INCOMPLETE`, and
   `ROOT_MOVED` already return computed `moved` truthfully.
2. `NO_PREVIOUS_ROUND` and nothing-comparable `ROOT_SCOPE_INCOMPLETE` return literal empties
   only while `movement === null`, making those empties equal to computed `moved`.
3. `GLOBAL_DELTA_CONVERGED` is selected only when `moved.length === 0`, so its literal empty is
   also equal to `moved`.
4. `NO_MEASURED_EDGE` was the sole erasure and now returns `moved`.

The recorded follow-up—write `moved` uniformly in the three provably-empty arms—was correctly
left unacted. It is a class-hardening refactor, not part of V-authorized B1, and the diff leaves
all three sites untouched.

The landed all-UNKNOWN J15(b) assertion at
`tests/unit/t07-adaptive-stopping.test.ts:804-835` is unchanged. It uses identical strength
sets, asserts `maxRootMovement: 0`, `movedRootNodeIds: []`, and `measuredEdgeCount: 0`, and
expects `CONTINUE / NO_MEASURED_EDGE`; a companion assertion shows the same zero movement may
converge when the measured-edge count is 1. No landed assertion was weakened by T7B.

## STORED GATES AND REPORT AUDIT

I did not rerun any gate. The supplied artifacts record, at the filed commit/tree and with
`clean: yes` in every header:

- root typecheck: `tsc exit=0`;
- unit cluster runs 1-3: `63 passed (63)` each;
- zone cluster runs 1-3: `230 passed (230)` each.

The worker report has the required line-1 marker and its line-2 hash reproduces under the stated
`sed '2d'` recipe as
`1b05b7175eab05a794559012d8980f94e773bdbc49349925722578d9d4805bdf`. Its T7B claims agree
with the source, tests, transcript, and gate headers.

## PACKET REVIEW

No packet defect found. The packet path and every cited artifact resolve; the base/tip/tree,
two-file diff, report marker/hash, test totals, V authorization, and follow-up disposition match
the stored artifacts. Its two required outputs are exactly the two paths in its writable surface.
The scope is identical to codex r3 B1 and to the V authorization at the DECISIONS tail.

## FINDINGS

None.

## NOT VERIFIED

- Per the packet, I ran no tests, builds, typechecks, installs, mutation commands, provider calls,
  browser flows, or database fixtures. Gate results above are readings of stored worker logs.
- I did not repeat the heavy integration cluster or the D15 batch suite; D15 remains the binding
  pre-merge measurement from codex r3.
- I did not alter product code, tests, git state, the board, or any artifact other than this verdict
  and the authorized appended `## t7b` self-report.

## PREDICTIONS

I predict another lens may either reject the mutant merely for lacking pre-implementation
chronology or overstate it as test-first RED; both miss the narrower conclusion supported here:
it is adequate reported-defect discrimination with independently published expected values, but
not authorship-order evidence. I also predict a class-oriented scan may ask to replace the three
remaining literal empties immediately; the first check should be their reachability predicates,
which prove equality to `moved` and confirm that such cleanup is outside T7B rather than a second
defect. Finally, a packet-only reader may call the no-stop test vacuous because it uses negative
assertions; checking the shared moved input and the immediately preceding exact-result pin should
falsify that concern.
