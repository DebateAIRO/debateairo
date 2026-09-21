CODEX MERGE REVIEW S06 r2 — CHANGES · comments read through: s06-merge-r2-2026-09-02

VERDICT: CHANGES — B1, N2, and N3 are closed; N1's code and present-tense
safety argument are correct, but its appended proof record introduces one false
future-proofing claim. No product-behaviour defect was found. One non-blocking
mandatory record correction remains under `F-S06-MERGE-N1`.

FINDING COUNT: 1 (0 blocking, 1 non-blocking mandatory).

## Finding

### N1 — the repaired proof falsely says it is independent of the read-set

Files/lines: worker report `agent-reports/s06-selection-label.md:1079-1088`;
worker self-report `agent-reports/s06-selection-label-self.md:551-567`;
source `dialectical-engine/packages/serve/src/index.ts:1047-1052,1181-1245`.

The repaired source comment is accurate today. Independent extraction from
`resolveTrueUnjudgedReasons` returns exactly `record.mark`,
`record.reviewOutcome`, `record.subjectRef`, and
`record.terminalTransportOutcome`. The widened union arms are structurally
identical except at `servedRootRule`, and the current function does not read that
field. Comparing the function with integration `362299d1` shows only the two type
annotation widenings and the merge comment; the executable body is unchanged.

The appended report nevertheless concludes: “This argument does not depend on
the read-set and so cannot go stale.” The self-report says it “cannot go stale
when someone adds a fifth read” and that the structural argument “stays true as
the body changes.” Those claims are false. The proof depends on one exact
read-set invariant: the resolver must not read `servedRootRule`, because that is
the one field whose admitted type differs.

Concrete failure scenario: a maintainer adds a fifth access that branches on
`record.servedRootRule`. A preserved row may carry a retired history value while
a fresh row cannot, so the two union arms can drive different decisions and the
current safety proof no longer applies. The filed assurance says no re-review is
needed precisely when it would be needed.

Required correction: replace the absolute sentences in the report and
self-report with the bounded claim: the proof is robust to reads of any other
`ConditionMarkRecord` field, because those fields are preserved identically, but
must be re-evaluated if `resolveTrueUnjudgedReasons` begins reading
`servedRootRule`. The source comment needs no change. Ticket
`F-S06-MERGE-N1` remains open for this record-only correction.

## Closed repair checks

- **B1:** `b1-root-typecheck-filed-tip.log:6-14` names full commit
  `9413114cc26088b44e7bd97d1489fa12c905b8de`, full tree
  `d888dcf21f2d61ca5f7d77202b0ab1ceeed0f9db`, porcelain zero before and
  after, and recorded root typecheck exit zero. Independent `git rev-parse`
  returns the same HEAD/tree and current porcelain is empty.
  `b1-tip-provenance.log:4-22` plainly identifies the earlier `e040b1ee`
  record as stale and as supporting evidence rather than a substitute.
- **N2:** independent structural extraction of `CONDITION_MARKS` gives
  31/31/32/32 at `7433be7`, `362299d1`, `6624c3fa`, and `e040b1ee`.
  The raw four-member tail hashes identically at all four objects. The
  integration-side kernel diff is empty, while the lane diff adds exactly
  `LABEL-BASIS-INCOMPLETE` at position 27 of 32; T6 minted nothing and S06
  minted one member.
- **N3:** neither worker artifact contains a `^# ## ` heading. Both have
  anchored `## r2`, `## r3`, `## r4`, and `## r4b` sections. SHA-256 over the
  report with line 2 removed recomputes exactly to its line-2 value,
  `8f1c6769e6f7a361c76937154731f14ea88955601aa75372253bfd76fe661fd1`.

## Packet and static verification record

- The round-2 packet was reviewed before the diff. Its two mandatory output
  paths are the only written files and both resolve inside the declared writable
  root. Its marker, report hash, section names, log paths, counts, and provenance
  constants match the artifacts.
- HEAD is `9413114cc26088b44e7bd97d1489fa12c905b8de`, tree
  `d888dcf21f2d61ca5f7d77202b0ab1ceeed0f9db`, with parent
  `e040b1ee5322b3343987632659509e963d0ccd05` and empty porcelain. The round
  contains one commit and one modified file. Its stat is `+18/-4`; every changed
  line is comment text, and `git diff --summary` reports no mode change.
- I did not re-review the already-cleared merge resolution. I ran no tests,
  builds, installs, compiler, database fixture, provider call, or mutating Git
  command. The typecheck result is author-produced evidence; this static review
  verifies its immutable provenance and record shape, not the compiler execution.

## PREDICTIONS

A marker-focused lens is likely to APPROVE because the source comment now names
all four fields and the present body satisfies the structural proof. I predict it
will miss the new absolute claims at worker-report line 1085 and self-report lines
555-567. A provenance-focused lens should agree that B1 is closed at `9413114c`;
a recounting lens should reproduce 31/31/32/32 and the identical DR-176 tail. On
refile I would check only that the two absolute longevity claims are bounded by
the explicit invalidation trigger: any future read of `servedRootRule`.
