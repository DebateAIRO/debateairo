# 04 — Node-graph & reasoning data-model inventory

Type: research
Status: resolved
Blocked by: none

## Question

What are the node/edge/typed-state shapes of V2's argument graph — node types,
per-node fields, children/defeaters/residuals, lifecycle state machines — as a
behavioral data model the battery stages SPLIT/WEIGH/COMPOSE would operate over
in V3?

## Why

V's preservation steer keeps node-by-node reasoning unreservedly; clean-room
carryover means its shapes must be re-specified, not copied. The whole-graph
stranger test (every node individually restatable by a stranger) adds per-node
readability obligations — annotate which existing fields serve it and what is
missing.

## Inputs (read-only)

- `apps/dialectical-engine/coordinator/` graph/node models, migrations, and the
  debate-tree structures — follow the code.
- Battery stage definitions: mission 2026-08-02 `upstream/human-plan.md`
  (stages SPLIT, WEIGH, COMPOSE).

## Deliverable

`../../research/04-node-graph-data-model.md` — shape inventory + battery-stage
mapping + stranger-test field gap list, marker `RESEARCH HANDOFF COMPLETE` at top.

## Answer

Resolved by Opus research seat — full model at
[../../research/04-node-graph-data-model.md](../../research/04-node-graph-data-model.md).

Gist: V2 has THREE disjoint graph models, not one. Model A (production,
persisted): 8 node-type literals in 5 roles, ZERO edge rows — relations
re-derived per read from `(node_type, parent_id)`; three orthogonal lifecycle
machines + 10 satellite record types. Model B (`app/qbaf/`, in-memory only,
never persisted): real first-class Edge with polarity/weight, per-node
base_score/final_strength/uncertainty. Model C: the flat DF-QuAD kernel both
project into. Battery fit: SPLIT reuses spawn plumbing but has no fields for
its epistemic outputs; WEIGH is the closest fit (rubric + measured dispersion
transfer) but lacks admissibility/source-interest/bias fields; COMPOSE is the
worst fit — one fixed aggregation, assumed sibling independence, single-verdict
output make Q45/Q47–Q49 unanswerable IN PRINCIPLE. Top stranger-test gaps: no
plain-language node restatement; no node-level provenance; no revision-trigger
or stranger-status field to gate serving. Bonus: judge panel already computes
`why_it_matters` + typed relation-to-root and DISCARDS them (ready-made
stranger field on the floor); an invariant gap exists between the
terminal-failure `stopping_status` value and the decision-record validator.

## Comments
