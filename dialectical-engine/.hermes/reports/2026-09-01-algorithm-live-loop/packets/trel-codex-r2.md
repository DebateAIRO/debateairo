# PACKET — codex review TREL r2 (rework verification) · four elements per spine §4

## 1. Ticket-state block
Same lane ticket (/Users/stefan.nour/Library/CloudStorage/OneDrive-adessoGroup/Debate/V5/dialectical-engine/.hermes/reports/2026-09-01-algorithm-live-loop/board/TREL-relay-binaries.md, status changes_requested → your r2 verdict decides). Writable surface: EXACTLY
/Users/stefan.nour/Library/CloudStorage/OneDrive-adessoGroup/Debate/V5/dialectical-engine/.hermes/reports/2026-09-01-algorithm-live-loop/agent-reports/TREL-codex-r2.md
and the `## r2` section of
/Users/stefan.nour/Library/CloudStorage/OneDrive-adessoGroup/Debate/V5/dialectical-engine/.hermes/reports/2026-09-01-algorithm-live-loop/agent-reports/TREL-codex-self.md
No tests, builds, or git state changes.

## 2. Immediate upstream artifacts
- The revised report (marker `REWORK READY FOR REVIEW — TREL r2`; carries a `report sha256:` line under the marker — verify the hash matches the body you read, and re-read once if not):
  /Users/stefan.nour/Library/CloudStorage/OneDrive-adessoGroup/Debate/V5/dialectical-engine/.hermes/reports/2026-09-01-algorithm-live-loop/agent-reports/trel-relay.md
- Your r1 findings (the convergence standard):
  /Users/stefan.nour/Library/CloudStorage/OneDrive-adessoGroup/Debate/V5/dialectical-engine/.hermes/reports/2026-09-01-algorithm-live-loop/agent-reports/TREL-codex-r1.md
- The diff at the reworked commit: `git -C /Users/stefan.nour/Library/CloudStorage/OneDrive-adessoGroup/Debate/V5/.worktrees/lane-trel log --oneline 1c9578a..HEAD` and the corresponding diff.
Verify, in priority order: (1) B1 — the env-backed default now resolves LAZILY only when no
testOnlyCommand is present; resolveTestGuardedCommand remains authoritative for selecting
AND rejecting the test seam; the two regression arms exist and their RED/GREEN evidence is
in the report (blank override + test mode selects the fake command; outside test the exact
TEST_ONLY_*_COMMAND_FORBIDDEN precedence holds). (2) B2 — the SUITES section now cites
ruling D13 (judge-stage authoritative full suite) instead of an "owed" row. (3) No new
claims or surface beyond B1's fix. (4) N3 discipline — marker was the last write, sha line
present.

## 3. Handoff marker
First line of TREL-codex-r2.md:
`CODEX REVIEW TREL r2 — APPROVE|CHANGES · comments read through: trel-r2-2026-09-01`

## 4. Stop conditions
- STATIC only; verbatim output for every re-run command.
- APPROVE = B1 implemented with both regression arms + no new over-claims; CHANGES = name
  exactly what fails (round 3 would be the last).
- ~20 minutes.
- Self-report `## r2` BEFORE the marker.
- Final message = `FILED: <path>` + VERDICT line + finding count.
