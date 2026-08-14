# 08 — Token-ledger metering: per-call tokens per model, persisted

Type: task
Status: open
Blocked by: 01, 02

## Question

Cost is token-ledger derived (charting ruling 7). Using ticket 01's findings on what
each relay/vLLM path exposes, design and build persistent per-call token capture per
model: table shape (append-only), capture points (relay-core vs. per-relay), units
normalization, and the derived relative-cost signal the seat-share allocator (ticket
10) will read. Handle paths that report nothing (ticket 01 will name them): estimate,
or mark unmetered? No billing, no currency in the product — relative cost only.
