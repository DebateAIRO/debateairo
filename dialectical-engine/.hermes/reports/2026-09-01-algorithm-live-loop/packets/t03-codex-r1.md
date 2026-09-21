# PACKET — codex review T3 r1 (the flagship lane) · four elements per spine §4

## 1. Ticket-state block
Lane ticket /Users/stefan.nour/Library/CloudStorage/OneDrive-adessoGroup/Debate/V5/dialectical-engine/.hermes/reports/2026-09-01-algorithm-live-loop/board/T03-judge-panel.md
(status waiting_review). Writable surface: EXACTLY TWO files:
/Users/stefan.nour/Library/CloudStorage/OneDrive-adessoGroup/Debate/V5/dialectical-engine/.hermes/reports/2026-09-01-algorithm-live-loop/agent-reports/T3-codex-r1.md
/Users/stefan.nour/Library/CloudStorage/OneDrive-adessoGroup/Debate/V5/dialectical-engine/.hermes/reports/2026-09-01-algorithm-live-loop/agent-reports/T3-codex-self.md
No tests, builds, git changes, no live provider calls.

## 2. Immediate upstream artifacts
- Diff: `git -C /Users/stefan.nour/Library/CloudStorage/OneDrive-adessoGroup/Debate/V5/.worktrees/lane-t3 diff 5868a38..HEAD` (worker: f2c76d0 + 7bf9193; 9 files incl. runner, judgement, 3 acceptance files, scaffold, orphan-audit).
- The report (sha-lined; note its sha scheme is `sed '$d'` — last line excluded):
  /Users/stefan.nour/Library/CloudStorage/OneDrive-adessoGroup/Debate/V5/dialectical-engine/.hermes/reports/2026-09-01-algorithm-live-loop/agent-reports/t03-panel.md
- The dispatching packet (review it): /Users/stefan.nour/Library/CloudStorage/OneDrive-adessoGroup/Debate/V5/dialectical-engine/.hermes/reports/2026-09-01-algorithm-live-loop/packets/t03-panel.md
- The standard: goal-prompt.md lines 129–143 (Global DoD 28–40) at
  /Users/stefan.nour/Library/CloudStorage/OneDrive-adessoGroup/Debate/V5/dialectical-engine/.hermes/reports/2026-08-31-algorithm-correctness/goal-prompt.md
  + /Users/stefan.nour/Library/CloudStorage/OneDrive-adessoGroup/Debate/V5/dialectical-engine/.hermes/reports/2026-09-01-algorithm-live-loop/slices/S03-panel/SPEC.md
  + NEW ruling J12 and boards F29/F30 (they answer the worker's F6/F1/F3 routes) at
  /Users/stefan.nour/Library/CloudStorage/OneDrive-adessoGroup/Debate/V5/dialectical-engine/.hermes/reports/2026-09-01-algorithm-live-loop/DECISIONS.md
Review questions, priority order: (1) THE DoD's RED — one reduced judgement per node with
panelContractHashes ≥2 members and non-null dispersion on an M≥2 path, failing at 5868a38
(the skeleton literal live) — verify the RED log's failure is the DESIRED assertion, not
scaffolding. (2) The wiring — runJudgePanel per authored node with every other healthy
maker; author's self-assessment ONE member; measureDispersion/applyCorrelatedErrorDiscount
/applyDeclaredDisagreement fed from T16's SEALED rows (grep that no policy value is
re-declared in code); skeleton literal reachable ONLY at M=1 (trace both root and child
paths). (3) Confirm-item-5 policy — partial-panel mark; all-failed → the
PANEL-DEGRADED-SINGLE-VOICE mark + recorded one-band step-down; timeout/parse/all-failed
EACH tested (PanelMemberFailure kinds). (4) The ACCEPTANCE receipt — dispersion + family
discount live through the fake-CLI seams, not only unit calls. (5) JUDGE'S EXPLICIT
QUESTION on the worker's F4 honesty limit: the multiplier branch is unreachable with one
provider per family — assess whether a SAME-FAMILY acceptance fixture (two configured
providers sharing a family via a seeded map — a topology a real deployment can have) is
lawful and cheap; if yes, that is a finding with the fixture as the suggested fix; if the
seams make it unreasonable, say so and the s04-surface pin stands. (6) J12 — the loud
stop for unsealed panel rows: implemented? The 8 database.test.ts fixtures seeded as
coherence, their assertions unchanged, the pre-existing file's signature delta disclosed
via paired base↔HEAD payloads? (If the worker's filed diff predates J12 — it does — then
J12's items are the EXPECTED r2 rework content: enumerate them as findings, not as
surprises.) (7) Mutant 3's story (the vacuous first family assertion, rewritten) — verify
the shipped assertion now pins family resolution. (8) The two load-flipped tests named in
FAILURE CLASSIFICATION — properly attributed to flake families, not absorbed. (9) Packet
review.

## 3. Handoff marker
First line: `CODEX REVIEW T3 r1 — APPROVE|CHANGES · comments read through: t03-r1-2026-09-01`

## 4. Stop conditions
- STATIC only; verbatim re-run output; CANNOT-ASSESS over guesses.
- ~45 minutes (the mission's largest diff); round r1 of max 3.
- Self-report (exact `## r1`) BEFORE the marker.
- Final message = `FILED: <path>` + VERDICT line + finding count.
