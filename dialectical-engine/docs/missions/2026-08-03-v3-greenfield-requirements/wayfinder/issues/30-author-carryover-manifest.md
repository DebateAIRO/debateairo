# 30 — Author destination artifact 2: the clean-room carryover manifest

Type: task
Status: resolved
Blocked by: 26, 28

## Answer

Authored, thrice-reviewed, reworked to revision 4, ACCEPTED (DR-067).
Register closed 17/17 (DR-062). Final form in spec-pack/ and DebateAI-V3's
docs/founding/.

## Question

Draft the carryover manifest — the organ-by-organ behavioral contract V3
rebuilds from. Output path: `../../spec-pack/carryover-manifest.md`.

## Definition of Done

- One section per kept organ, imported from
  `research/02-scoring-behavior-spec.md` and
  `research/04-node-graph-data-model.md`, scoped by ticket 26's rulings
  (trusted-run mapping, Model B fate, flag baseline, D1-scope, candidate D5,
  Proposal B invariants).
- The defect register D1–D4 (GLOSSARY) restated as MUST-NOT-REPRODUCE
  contract clauses with V2 evidence citations.
- The golden-vector manifest: families, MUST-MATCH / MUST-DIFFER(D1–D4) /
  UNPINNED marks per `research/03-golden-vector-plan.md`; ZERO UNPINNED rows
  is this artifact's readiness gate. (The recorder that captures vectors is
  ticket [27](27-golden-vector-recorder.md) — execution-gated, NOT a blocker
  for authoring the manifest.)
- Review gate: three lenses, orchestrator merges, V accepts.

## Comments

- Orchestrator note (2026-08-04, post-DR-047): the manifest's §12.1/§12.3
  still carry pre-retirement race language ("control arm at race time") —
  known repair for the consolidated rework after the three-lens review; the
  charter's contradiction sweep flagged it (its items 3–5).
