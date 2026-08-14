# 07 — Bias metrics + prowess aggregation (deterministic derivation)

Type: task
Status: open
Blocked by: 05, 06

## Question

Bias first, prowess second (charting ruling 5). Define and implement the
deterministic derivations into scorecard.scorecard_cell: per-judge BIAS — leniency
(judge's grades vs. panel median on the same items), settlement contradiction rate
(verdicts contradicted when answers settle; extend the existing disagreement-rate
monitor at packages/settlement/src/index.ts:281), lineage-favoritism residue as a
monitor; per-model PROWESS per (domain, step) with sample counts and intervals
(deriveScorecardCell exists). A repeatedly-biased judge simply ranks lower — no
weight multipliers, rank-and-select (ruling 5). All math is code, not LLM. Decide
metric names/versions (derivation_version) so future changes don't corrupt history.
