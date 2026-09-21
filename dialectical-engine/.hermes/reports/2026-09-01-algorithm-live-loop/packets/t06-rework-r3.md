# PACKET — worker T6 rework r3 (FINAL round, 3 of 3) · spine §4

## 1. Ticket-state block
Ticket /Users/stefan.nour/Library/CloudStorage/OneDrive-adessoGroup/Debate/V5/dialectical-engine/.hermes/reports/2026-09-01-algorithm-live-loop/board/T06-review-teeth.md
(rework_round 3 — the LAST lawful round; residue goes to V's packet, never a round 4).
Allowed paths unchanged: lane worktree
/Users/stefan.nour/Library/CloudStorage/OneDrive-adessoGroup/Debate/V5/.worktrees/lane-t6
(tip df59c41a, clean), report t06-teeth.md (append `## r4`), self-report (`## r4`), logs/t06/.
Never push/merge; never edit board or DECISIONS.

## 2. Immediate upstream artifacts
RULINGS FIRST: J14 + ADDENDUM, D21, D24 in
/Users/stefan.nour/Library/CloudStorage/OneDrive-adessoGroup/Debate/V5/dialectical-engine/.hermes/reports/2026-09-01-algorithm-live-loop/DECISIONS.md;
the one-way-door clause's OPERATIVE TEXT is in
/Users/stefan.nour/Library/CloudStorage/OneDrive-adessoGroup/Debate/V5/dialectical-engine/.hermes/reports/2026-09-01-algorithm-live-loop/agent-reports/t05-edges.md
(lines 415-421; DECISIONS.md holds only its residue pointer — the r2 review packet mislocated
it, an orchestrator defect now ledgered).
THEN codex r2 (read in full):
/Users/stefan.nour/Library/CloudStorage/OneDrive-adessoGroup/Debate/V5/dialectical-engine/.hermes/reports/2026-09-01-algorithm-live-loop/agent-reports/T6-codex-r2.md
The findings, all mandatory this round:
- B1 (blocking): `readNodesForRun` (packages/serve/src/index.ts:~2164-2167, :2199,
  :2227-2230, :2314-2318) selects `review.outcome` from `ledger.node_review` — whose CHECK
  lawfully admits agree | dispute | cannot-assess — but its pg result generic declares the
  value as only `"cannot-assess" | null`, and a copied condition-mark comment sits on it. A
  typed consumer can omit both live states and still compile: the exact homonym trap the
  do-not-tidy guard exists for. Fix: restore `"agree" | "dispute" | "cannot-assess" | null`
  on that result type, replace the comment with the true ledger source/invariant, keep the
  one-value narrowing ONLY on condition-mark disclosure reads (:~1662 is correct). RED: a
  type-level or runtime probe that fails at the r3 tip (e.g. a fixture with an `agree`
  review projected through readNodesForRun, asserting the live value survives typed
  consumers), then GREEN.
- N1: (a) every D24 transcript header says `lane tip c7511826` while the report and packet
  say the campaign ran at `67d9d9b4` — correct the provenance statement (the campaign is not
  invalidated; the later commit changed only the sequence fixture — say exactly that);
  (b) the transport guard's concurrency safety comes from `ServeRepository.persist` and the
  only production review writer both holding the same exclusive run-content advisory lease,
  NOT from the transaction alone — correct the report and the code comment; (c) F-T6-7: either
  route it to a concrete ticket (a structural filter-exclusivity requirement) or relabel it
  NOT VERIFIED / non-finding limitation — a named non-blocking finding cannot be "not charged".
- N3: `packages/contract/src/index.ts` acquired mode 100755 in commit c7511826 (an OneDrive
  exec-bit flip that got committed). Fix: `git update-index --chmod=-x` on that path and
  commit the mode restore alone (content unchanged — prove with `git diff --stat` showing 0/0
  and a `mode change 100755 => 100644` summary line); then run `git diff --summary 7433be7..HEAD
  | grep -c "mode change"` and quote it (must be 0). The orchestrator has set
  `core.fileMode=false` on the lane worktrees so future flips stay invisible to git; the
  committed one must still be reverted in-tree.
- N2 was the orchestrator's (ledgered) — nothing for you.
RED before GREEN for B1; D24-shape transcripts for any mutant; D16 pairs REQUIRED (the diff
touches packages/contract — mode only — and packages/serve; run both gates at base and tip).

## 3. Handoff marker
Report head rewritten to D21: line 1
`REWORK READY FOR REVIEW — T6 r4 · comments read through: t06-codex-r2-2026-09-02`,
line 2 `report sha256:` (`sed '2d' … | shasum -a 256`); self-report `## r4` BEFORE the marker.

## 4. Stop conditions
- Round 3/3. Anything not lawfully closable becomes a V-row draft in the report's FINDINGS
  (decision required · recommendation · default), never a round 4.
- Final message = `FILED: <path>` + marker + the B1 RED/GREEN log paths + the mode-change
  count line verbatim.
