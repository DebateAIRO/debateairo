# 05 — Harvest pipeline: run artifacts → per-model outcome rows

Type: task
Status: open
Blocked by: 04

## Question

Build the harvest (charting rulings 9 + 10): after each run, fold the artifacts runs
already produce — authored nodes (ledger.raw_artifact.maker), cross-maker reviews
(ledger.node_review), judgements (ledger.reduced_judgement), strengths, settlement
outcomes when they exist — into scorecard.answer_outcome rows per
(model, domain-from-tag, step ∈ {AUTHORING, JUDGING, REVIEWING}). Consensus counts
at full weight where nothing settles (ruling 4); mark on each row whether it was
consensus-fed or settlement-fed (resolver_is_external exists for this). Blinding:
any content an LLM re-reads during harvest is stripped of maker identity first.
Decide: harvest runs inline post-run vs. scheduler batch. Zero extra model calls —
harvest is deterministic code.
