# Phase report — C4 review diamond H4 (ARCH-V3-R1)

Diamond over the 20-document C4 set: Codex lens (gpt-5.6-sol) ∥ fresh
independent Opus lens (session h4-reviewer, deviation 8), blind to each
other; merge by orchestrator (DR-006). C4's own rework budget: 3 rounds.

## Round 1

- Codex: CHANGES REQUESTED — H-C-1..10 (2 BLOCKER: terminal-route enum
  4-vs-5 with a test frozen against the wrong side; S0 startable without a
  global acceptance gate). Gap adjudication: 12 REAL / 15 MISREAD.
- Opus: CHANGES REQUESTED — H-O-1..19 (2 BLOCKER: continuous replay
  self-test had no legal owner; apps/api couldn't serve four declared
  endpoints). Gap adjudication: 28 REAL / 3 MISREAD / 4 UNVERIFIABLE.
- Merge: 2 disagreements adjudicated with evidence (AC-89/90 fixtures exist
  as FX-SRV-10/11 — verified at source by the merge node; toolchain-row
  compatible readings). 29 findings routed to owning lanes; all repaired;
  cross-sync wave reconciled lane residuals (incl. the fleet-owner
  conflict: battery owns, runner executes, reaper writes expiry). New REAL
  gaps surfaced and homed: API-4, MOD-4, REG-7, TRACE-8/9/10.
- Structural additions this round (all SEAT-PROPOSAL, FinalPlan-bound):
  apps/scheduler (charter-S1 two-limb split), work_item table,
  evidence/critique/valuation schemas, global pre-S0 gate GPG-1..4,
  five-terminal-route unification under DR-037, four toolchain register
  keys + bootstrap path, Q-nn as the set's primary address.

## Round 2

- Codex: CHANGES REQUESTED — 7/10 repaired + H-C-11..14 (4 MAJOR, all
  cross-sync: fixture-namespace fork after the replay split; gap-index
  arithmetic/staleness; deployment/dependency view drift; missing register
  rows for new controls).
- Opus: CHANGES REQUESTED — 17/19 repaired, 2 PARTIAL + H-O-20..24 (the one
  genuine break: 04's wire enum still four-member). All 24 gap
  adjudications honored; zero regression damage; the round's structural
  content survived all attacks.
- Merge: all items mechanical one-lane syncs; routed to lanes 1, 4, 5, 6, 7.

## Round 3 (final)

All repairs applied: namespace healed (109/109 ids verified in 07, zero
bare FX-LG-01 anywhere outside the definition sentence), wire enum five
with depth-zero servable, gap index 38 rows = 37 unique + 1 directed item,
apps/scheduler in the deployment view, five new register keys
(declaredPollInterval, paginationLimitMax/Default, convergenceEpsilon,
convergenceStopDefaults + REG-8 naming question), reaper credential scope.
Final verification by both lenses: verdicts recorded in
reviews/codex-c4-final.md and reviews/opus-c4-final.md (see closure
report for the outcome).

## Counters

C4 rework_round: 3 of 3 used. Findings: 29 → 9 → (final verification).
Escalations: 0 new (VS-1 stands from C2). FinalPlan consolidation authored
by the c2-author seat: architecture/FinalPlan-consolidation.md — 13
directed amendments A-01..A-13 + the three-conjunct ARCHITECTURE SATISFIED
condition, marker withheld.
