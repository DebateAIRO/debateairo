# PACKET — worker T7 rework r3 (FINAL round, 3 of 3) · spine §4

## 1. Ticket-state block
Ticket /Users/stefan.nour/Library/CloudStorage/OneDrive-adessoGroup/Debate/V5/dialectical-engine/.hermes/reports/2026-09-01-algorithm-live-loop/board/T07-adaptive-stopping.md
(rework_round 3 — the LAST lawful round; whatever remains after it goes to V's packet, not a
round 4). Allowed paths unchanged: lane worktree
/Users/stefan.nour/Library/CloudStorage/OneDrive-adessoGroup/Debate/V5/.worktrees/lane-t7
(tip 754090a, clean), report t07-stopping.md (append `## r4`), self-report (`## r4`), logs/t07/.
Never push/merge; never edit board or DECISIONS.

## 2. Immediate upstream artifacts
RULINGS FIRST: J15 + ADDENDUM + ADDENDUM-2, D24 (mutant transcripts carry the mutation) in
/Users/stefan.nour/Library/CloudStorage/OneDrive-adessoGroup/Debate/V5/dialectical-engine/.hermes/reports/2026-09-01-algorithm-live-loop/DECISIONS.md.
THEN codex r2 (read in full; its dispositions accept your B1 fixture substitution "in
principle, with a bounded risk", the record truth + three-state walk, and the B2 no-mark arm):
/Users/stefan.nour/Library/CloudStorage/OneDrive-adessoGroup/Debate/V5/dialectical-engine/.hermes/reports/2026-09-01-algorithm-live-loop/agent-reports/T7-codex-r2.md
(recovered in-sandbox after the reviewer's out-of-tree write was rejected; provenance note at its foot).
The four findings, all mandatory this round:
- B1 (blocking): `expectedRootCount` is OPTIONAL on the exported strict
  `decideRoundContinuation` (propagation/src/index.ts:~794) with a fallback to
  `rootNodeIds.length` (:~837) — a direct caller omitting it buys GLOBAL_DELTA_CONVERGED
  with root B never compared. Fix: make it REQUIRED on the exported decision itself, remove
  the fallback, update every strict call site; add a compile-time negative fixture
  (omission rejected — e.g. `// @ts-expect-error` pinned so it fails if the field becomes
  optional again) plus the runtime shortened-scope case with expectedRootCount: 2 →
  ROOT_SCOPE_INCOMPLETE. Your structural live-seam pin may stay.
- B2 (blocking): `decideRoundBoundary` (:~947-990) partitions BEFORE validating and, on any
  partial scope, returns a literal record with `maxRootMovement: null` and
  `movedRootNodeIds: []` even when a comparable root moved (codex's case: A 1/2→3/4 with B
  uncomparable must record maxRootMovement 1/4 and movedRootNodeIds ["root:A"]); the same
  early return skips STOPPING_ROOT_SCOPE_OVERFULL and every input validation. Fix: validate
  the full boundary input first; compute movement for every comparable root even when others
  are uncomparable; ROOT_SCOPE_INCOMPLETE may stay dominant or a documented precedence with
  ROOT_MOVED — but no fact is erased; convergence stays impossible below full coverage.
  Outer-boundary tests: (a) one moved comparable + one uncomparable root; (b) overfull /
  invalid expected-count guards through the OUTER path; mutate the outer path, not only the
  strict helper. Interface doc for `maxRootMovement` must be true again.
- N1: the report's commit count is still false — count with `git rev-list --count
  7433be7..HEAD` and quote the command output verbatim.
- N2: `epsilon: 0.126` is not "one representable step above 1/8" (next-up is 1/8 + 2^-55).
  Either rename the case ("when epsilon rises above it") or construct the true next
  binary64 value with a reviewed nextUp helper and keep the stronger wording.
RED before GREEN for B1 and B2 (the compile-time negative counts as RED when it fails to
compile at the r3 tip); D24-shape transcripts for every mutant; D16 pairs if the diff
touches kernel/contract/UI (it should not this round — say so with `git diff --stat`).

## 3. Handoff marker
Report head rewritten to D21: line 1
`REWORK READY FOR REVIEW — T7 r4 · comments read through: t07-codex-r2-2026-09-01`,
line 2 `report sha256:` (`sed '2d' … | shasum -a 256`); self-report `## r4` BEFORE the marker.

## 4. Stop conditions
- This is round 3/3. Anything you cannot close lawfully is written as a V-row draft in the
  report's FINDINGS (decision required · your recommendation · default), not attempted as a
  round 4. BLOCKED (reason) on line 1 if a ruling is needed.
- Final message = `FILED: <path>` + marker + B1/B2 RED and GREEN log paths + the verbatim
  rev-list count.
