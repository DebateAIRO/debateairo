# PACKET — codex review T4 r2 (rework verification) · four elements per spine §4

## 1. Ticket-state block
Same lane ticket (board/T04-way-of-knowing.md, rework_round 1). Writable surface: EXACTLY
/Users/stefan.nour/Library/CloudStorage/OneDrive-adessoGroup/Debate/V5/dialectical-engine/.hermes/reports/2026-09-01-algorithm-live-loop/agent-reports/T4-codex-r2.md
and the `## r2` section of T4-codex-self.md. No tests, builds, git changes.

## 2. Immediate upstream artifacts
- The revised report (marker `REWORK READY FOR REVIEW — T4 r2`, sha line under it — verify):
  /Users/stefan.nour/Library/CloudStorage/OneDrive-adessoGroup/Debate/V5/dialectical-engine/.hermes/reports/2026-09-01-algorithm-live-loop/agent-reports/t04-wok.md
- Your r1 findings (the convergence standard):
  /Users/stefan.nour/Library/CloudStorage/OneDrive-adessoGroup/Debate/V5/dialectical-engine/.hermes/reports/2026-09-01-algorithm-live-loop/agent-reports/T4-codex-r1.md
- Governing rulings (mission DECISIONS.md): J5 (canonical mark path + ONE type-forced label
  line each in apps/ui/lib/v3/labels.ts and web/lib/v3Presentation.ts, nothing more),
  D12 (baseline authority), D14 (surface-local tsc gates for lanes touching ui/web), D15.
- Diff: `git -C /Users/stefan.nour/Library/CloudStorage/OneDrive-adessoGroup/Debate/V5/.worktrees/lane-t4 diff 1c9578a..HEAD` (worker states HEAD 7d179c6).
Verify, priority order: (1) B1 — WAY-OF-KNOWING-DOWNGRADED is minted in kernel
CONDITION_MARKS (worker says MID-LIST to protect dr174's slice(-4) positional tail read —
verify that positional consumer still reads the DR-176 tail correctly) + contract
ConditionMarkSchema; the typed record flows judgement → runner → node projection; the
production-seam test observes the PROJECTED mark from the served answer. (2) B2 — the
record's node id comes from writer.addNode() (both root :1514-ish and child :1658-ish
paths); mutant M5's claim (rebinding to workItemId fails in PostgreSQL on the
condition_mark_node FK) — re-check statically that the FK exists and the test asserts the
failure. (3) B3 — the full-suite row is now terminal (26f/1762p/1788): check the report
classifies the 26 failures (base was 24 on the r1 tree with 3 fewer tests) — every failure
named PRE-EXISTING (vs the lane's own base evidence / F21 flake class) or owned. (4) J5
bounds — exactly ONE mapping line in each of the two UI switches; anything beyond is
BLOCKING. (5) D14 — the lane TOUCHED apps/ui and web/: the report must carry
`tsc --noEmit -p apps/ui/tsconfig.json` AND `-p web/tsconfig.json` rows with base
classification. If absent, that is a FINDING (D14 is explicit). (6) Scope: serve's dead
RAN bucket untouched (F5 guard).

## 3. Handoff marker
First line: `CODEX REVIEW T4 r2 — APPROVE|CHANGES · comments read through: t04-r2-2026-09-01`

## 4. Stop conditions
- STATIC only; verbatim output for re-runs. On CHANGES: round 3 is the last — say so.
- ~30 minutes. Self-report `## r2` BEFORE the marker.
- Final message = `FILED: <path>` + VERDICT line + finding count.
