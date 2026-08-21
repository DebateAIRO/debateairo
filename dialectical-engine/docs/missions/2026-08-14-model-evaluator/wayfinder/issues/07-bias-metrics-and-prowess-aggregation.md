# 07 — Bias metrics + prowess aggregation (deterministic derivation)

Type: task
Status: done
Blocked by: 05, 06

Hermes stage approval: `codex/eval-07-profiles` at `975ab60`; repository
typecheck and all 694 tests passed. Migration 0027, per-metric prowess ranks,
full-weight consensus evidence, REPLACE-not-pool semantics, and the unbound
selector were independently verified.

## Programming-stage handoff

- For a settlement observation with `supersedes_observation_id`, REPLACE the named
  consensus observation; never pool, average, or count both rows as independent
  evidence. The superseded consensus row remains append-only audit history but is
  treated as replaced by aggregation/profile derivation.

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
