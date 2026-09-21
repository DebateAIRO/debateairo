# PACKET — codex review T0 r2 (rework verification) · four elements per spine §4

## 1. Ticket-state block
Lane ticket board/T00-baseline.md (rework_round 1). Writable surface: EXACTLY
/Users/stefan.nour/Library/CloudStorage/OneDrive-adessoGroup/Debate/V5/dialectical-engine/.hermes/reports/2026-09-01-algorithm-live-loop/agent-reports/T0-codex-r2.md
and the `## r2` section of T0-codex-self.md. No tests, builds, git changes, no provider calls.

## 2. Immediate upstream artifacts (existence-checked at packet-write time)
- The revised report (marker `REWORK READY FOR REVIEW — T0 r4`, sha-lined):
  /Users/stefan.nour/Library/CloudStorage/OneDrive-adessoGroup/Debate/V5/dialectical-engine/.hermes/reports/2026-09-01-algorithm-live-loop/agent-reports/t00-baseline.md
- Your r1 findings: .../agent-reports/T0-codex-r1.md
- The NEW capture evidence: .../logs/t0/ceremony2.log and .../logs/t0/ceremony2-recovery.log
Verify: (1) B1 — the withdrawal is complete (the worker claims 12 label sites now read
UNSTABLE — CANNOT-ASSESS; grep for surviving causal wording outside the withdrawal block).
(2) B2 — ceremony2-recovery.log holds queries Q1–Q8 each with verbatim results and ends
with the PGDATA_AFTER_DELETE=ABSENT sentinel; the record-grade facts (run 29b2d42d…,
answer 4c7c5d38…, M=1 panel, 4 probe rows, gate refusal) re-derive from those captures;
run 1's ids remain labeled testimony-grade. (3) B3 — the mark arithmetic: Q7's
OWED-CHECK-UNEXECUTED=20 with 20+2+1+1=24 matching Q8's count(*); the report's corrected
multiplicity. (4) N2 — the literal suite name restored. (5) The two runs' structural
facts are consistent (same panel shape, same gate, same mark classes — fresh ids only).

## 3. Handoff marker
First line: `CODEX REVIEW T0 r2 — APPROVE|CHANGES · comments read through: t00-r2-2026-09-01`

## 4. Stop conditions
- STATIC only; verbatim re-run output. On CHANGES: round 3 is the last — say so.
- ~20 minutes. Self-report `## r2` BEFORE the marker.
- Final message = `FILED: <path>` + VERDICT line + finding count.
