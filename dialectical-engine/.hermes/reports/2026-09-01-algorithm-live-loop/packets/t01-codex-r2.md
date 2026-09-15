# PACKET — codex review T1 r2 (rework verification) · four elements per spine §4

## 1. Ticket-state block
Same lane ticket (/Users/stefan.nour/Library/CloudStorage/OneDrive-adessoGroup/Debate/V5/dialectical-engine/.hermes/reports/2026-09-01-algorithm-live-loop/board/T01-depth-contract.md). Writable surface: EXACTLY
/Users/stefan.nour/Library/CloudStorage/OneDrive-adessoGroup/Debate/V5/dialectical-engine/.hermes/reports/2026-09-01-algorithm-live-loop/agent-reports/T1-codex-r2.md
and the `## r2` section of T1-codex-self.md. No tests, builds, git changes.

## 2. Immediate upstream artifacts
- The revised report (marker `REWORK READY FOR REVIEW — T1 r2`):
  /Users/stefan.nour/Library/CloudStorage/OneDrive-adessoGroup/Debate/V5/dialectical-engine/.hermes/reports/2026-09-01-algorithm-live-loop/agent-reports/t01-depth.md
- Your r1 findings (the convergence standard):
  /Users/stefan.nour/Library/CloudStorage/OneDrive-adessoGroup/Debate/V5/dialectical-engine/.hermes/reports/2026-09-01-algorithm-live-loop/agent-reports/T1-codex-r1.md
- The governing rulings (mission DECISIONS.md tail): J6 (surface expansion — budget +
  ui/app/new/page.tsx:76,195 derive from contract constants; nothing else in budget/ui),
  D14 (mandatory `tsc --noEmit -p apps/ui/tsconfig.json` gate with base-vs-after
  classification), D13 (judge-stage authoritative full suite).
- Diff: `git -C /Users/stefan.nour/Library/CloudStorage/OneDrive-adessoGroup/Debate/V5/.worktrees/lane-t1 diff 1c9578a..HEAD`.
Verify, priority order: (1) B1/J6 — the two duplicate definitions now derive from the
contract constants (budget reuses ExpansionDepthSchema or exported min/max; ui gate
imports constants; the option list is derived, not enumerated); NOTHING else changed in
budget/ or ui/. (2) B2 — the scan expects EMPTY, is broadened to validators/comparisons/
option domains, and carries the positive controls per syntax class + negative control;
re-run it yourself. (3) D14 — the ui tsc gate is reported with base classification.
(4) N1 — provenance claims now match their logs (spot-check two). (5) SUITES section
shaped per D13 (no placeholders; explicit D13-DEFERRED if the full run is deferred).

## 3. Handoff marker
First line: `CODEX REVIEW T1 r2 — APPROVE|CHANGES · comments read through: t01-r2-2026-09-01`

## 4. Stop conditions
- STATIC only; verbatim output for re-runs. On CHANGES: round 3 is the last — say so.
- ~25 minutes. Self-report `## r2` BEFORE the marker.
- Final message = `FILED: <path>` + VERDICT line + finding count.
