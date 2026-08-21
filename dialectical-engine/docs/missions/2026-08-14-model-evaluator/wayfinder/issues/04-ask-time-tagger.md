# 04 — Ask-time domain tagger via the local vLLM model

Type: task
Status: open
Blocked by: 02, 03

## Question

Build the tagger (charting rulings 6 + Q13): at ask time, the local vLLM model reads
the raw question, matches it against the DB domain registry, picks an existing domain
or proposes a new one to save (per ticket 03's guardrails). Persist tag + raw
question reference where ticket 03 decided. Decide failure behavior: vLLM container
down or classification refusal → run proceeds untagged (tag is enrichment, never a
gate on serving), backfill later or leave null? Deliverable: tagger code wired into
the admission/serve path behind the module's dark-launch switch (tagging itself is
collect-only data, so it can run from day one).
