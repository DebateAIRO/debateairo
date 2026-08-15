# 09 — Consumer reader: the one LLM that uses the data

Type: task
Status: done
Blocked by: 07

Tier-6A release: ticket 07 is Hermes-stage approved. This lane may proceed in
parallel with ticket 10.

Hermes stage approval: PROG-09 is approved after round-1 REWORK and round-2
dual PASS. Follow-up (non-blocking): the shared blind-sample helper's new
4096-byte excerpt cap also truncates lane-06 add-on grading material. Add an
explicit truncation marker so grading-adjacent prompts do not present a clipped
excerpt as complete text.

## Question

All LLMs write; ONE reads (charting ruling 3): the dev-menu-chosen local vLLM model.
Deterministic code computes the numbers (rankings, intervals — ticket 07); the local
model interprets on top: names bias patterns in plain language ("lenient but
eloquent"), writes per-model capability summaries per domain, flags adjacent-domain
judgments. Build the reader: its prompt contract (it sees aggregates and blinded
samples, never authorship during grading-adjacent tasks), where its interpretations
persist (evaluator-owned table, versioned), and its refresh cadence (on-demand +
post-harvest). SELF_ROUTING_FORBIDDEN applies: the consumer model's own rows are
computed by code, not by itself.
