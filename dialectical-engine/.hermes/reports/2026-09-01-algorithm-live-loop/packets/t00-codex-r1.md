# PACKET — codex review T0 r1 (whole-record evidence review) · four elements per spine §4

## 1. Ticket-state block
Lane ticket board/T00-baseline.md (status waiting_review; this is T0's FIRST review round —
its r1→r3 were dependency continuations, now judged pin-complete). Writable surface:
EXACTLY TWO files:
/Users/stefan.nour/Library/CloudStorage/OneDrive-adessoGroup/Debate/V5/dialectical-engine/.hermes/reports/2026-09-01-algorithm-live-loop/agent-reports/T0-codex-r1.md
/Users/stefan.nour/Library/CloudStorage/OneDrive-adessoGroup/Debate/V5/dialectical-engine/.hermes/reports/2026-09-01-algorithm-live-loop/agent-reports/T0-codex-self.md
No tests, builds, git changes; the primary checkout and lane-trel worktree are read-only.

## 2. Immediate upstream artifacts
- The COMPLETE report under review (marker `READY FOR PEER REVIEW — T0 r3`, sha-lined;
  structure: post-provisioning baseline-of-record + D.1/D.2 tables + ceremony record
  (D17) + F11 correction block + pre-provisioning trap record below):
  /Users/stefan.nour/Library/CloudStorage/OneDrive-adessoGroup/Debate/V5/dialectical-engine/.hermes/reports/2026-09-01-algorithm-live-loop/agent-reports/t00-baseline.md
- Its evidence: /Users/stefan.nour/Library/CloudStorage/OneDrive-adessoGroup/Debate/V5/dialectical-engine/.hermes/reports/2026-09-01-algorithm-live-loop/logs/t0/ (typecheck-post*, test-post1/2/3, ceremony + recovery logs)
- The dispatching packet + rulings D9/D12/D17 (mission DECISIONS.md) — packet review duty
  includes whether the orchestrator's resume instructions were followable.
Verify, priority order: (1) PINS vs logs — typecheck-post1/2 truly clean; test-post1/2/3
summary lines match the quoted counts; the D.1 table's 23 rows each appear failing in all
three logs (spot-verify ≥8 rows across all three logs — set-equality is the fleet rule);
the 5 D.2 contention artifacts have their solo-run logs. (2) CEREMONY RECORD vs its logs:
the typed CLAUDE_CLI_FAILED evidence verbatim; the recovered-from-DB facts (run id, answer
id, panel, probe rows, marks) are plausible and internally consistent; the recovery method
documented; no second spend. (3) F11 correction: the projection claim at
acceptance/main.ts:85-89 — re-read the code yourself and confirm the corrected sentence is
now true and the original survives only quoted. (4) The two aborted runs attributed to
the orchestrator, never to the suite. (5) Report sha self-consistency per its stated rule.

## 3. Handoff marker
First line: `CODEX REVIEW T0 r1 — APPROVE|CHANGES · comments read through: t00-r1-2026-09-01`

## 4. Stop conditions
- STATIC only; verbatim output for every re-run; CANNOT-ASSESS over guesses.
- ~35 minutes; this opens T0's 3-round review cycle (r1 of max 3).
- Self-report (exact `## r1`) BEFORE the marker.
- Final message = `FILED: <path>` + VERDICT line + finding count.
