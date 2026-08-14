# 09 — Consumer reader: the one LLM that uses the data

Type: task
Status: open
Blocked by: 07

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
