# 01 — V2-UI boundary contract map

Type: research
Status: resolved
Blocked by: none

## Question

What, exactly, does the V2 UI consume from the V2 backend — every endpoint,
socket/stream, request/response shape, polling pattern, and implied state
machine — and which UI component consumes each?

## Why

V ruled the UI is kept but MAY FLEX (charting Q2). Negotiating the V3 boundary
contract (ticket [16](16-ui-flex-negotiation.md)) needs the factual inventory of
the current contract first. Special attention: where would battery outputs
(provenance tags, five typed abstentions, defeaters, ways-of-knowing labels,
per-node readability) have no place to land in the current shapes?

## Inputs (read-only)

- UI source under `/Users/vladmihaimiron/Documents/DebateAIRO` (locate it)
- Backend API surface: `apps/dialectical-engine/coordinator/`

## Deliverable

`../../research/01-ui-boundary-contract.md` — inventory (surface → shape →
consuming component → battery-output fit notes), marker
`RESEARCH HANDOFF COMPLETE` at top.

## Answer

Resolved by Opus research seat — full inventory at
[../../research/01-ui-boundary-contract.md](../../research/01-ui-boundary-contract.md).

Gist: 14 consumed surfaces (12 HTTP + 1 SSE + 1 export link) over TWO mutually
exclusive transport seams (Next catch-all vs `scripts/web_proxy.py`, which
bypasses the suspicious-scoring hook). 10 backend surfaces are never called —
including all of `/api/qbaf/*`. Load-bearing shapes: `DebateDetail`,
`DebateScoringResponse` (fetched once per debate, never re-polled), the SSE
channel (UI listens to 12 events, ignores 18+ incl. `artifact_token`), and the
flag-gated `VerdictSummary`. Battery-output landing: five typed abstentions —
NONE (three incompatible closed status vocabularies + free-text reason the UI
string-sniffs); defeaters — NONE as a relation (only node-local flag lists; the
real attack/support graph is never served); value-weight markers — NONE.
Partial: `score_provenance` already on the wire but read by nothing;
ways-of-knowing has `node_type`/`label`/never-emitted `lens`; stranger-readable
text is healthiest (`stopping_reason_human`, `rationale.short`). Friction: 35
source-text guard tests in `web/`.

## Comments
