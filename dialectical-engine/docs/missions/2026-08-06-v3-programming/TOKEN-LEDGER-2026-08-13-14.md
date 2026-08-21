# Per-agent token ledger — bug/resilience arc, 2026-08-13 → 08-14

Answering V's question ("Fable is drinking tokens while GPT does not even
consume anything — something is slipping"). The finding: NOTHING slipped in
who codes — Codex wrote all product code and its burn is receipted below;
what slipped was THIS LEDGER not existing (reporting law #6 / P7 lapse),
so the cross-house burn was invisible. Each row names its accounting basis
(the law); where a basis is unavailable locally, it says so rather than
estimating.

## OpenAI / Codex — ALL product coding (basis: codex session footers, exact)

| Ticket | Tokens |
|---|---|
| BUG-01 | 330,695 |
| BUG-02 (rev1+rev2+re-audit, session total) | 1,098,773 |
| BUG-03 | 304,299 |
| BUG-04 | 286,380 |
| RESIL-01 rev1 | 762,602 |
| RESIL-01 rev2 (session cumulative incl. rev1; footer basis) | see session log |
| **Receipted total (excl. rev2 delta)** | **≈ 2,782,749** |

Billed to V's OpenAI/ChatGPT account; visible only in codex logs and the
OpenAI console — never on any Anthropic surface, which produced the
"GPT consumes nothing" illusion.

## Anthropic / Opus subagents — review, architecture, confirmation ONLY
(basis: harness task-notification usage fields, exact; NO product coding —
three disclosed orchestrator small-ticket exceptions under V's grant)

| Seat | Tokens |
|---|---|
| PROV-01 finder confirmation | 121,492 |
| BUG-01 diamond lens | 179,909 |
| BUG-02 diamond lens (live) | 207,993 |
| BUG-02 finder confirmation | 162,206 |
| BUG-03 diamond lens (live) | 121,110 |
| BUG-04 diamond lens | 127,265 |
| DR-174 architect (plan) | 233,936 |
| DR-174 architect (revision) | 273,848 |
| RESIL-01 diamond lens (throwaway-stack live) | 324,712 |
| RESIL-01 finder confirmation | in flight |
| **Subtotal (completed seats)** | **≈ 1,752,471** |

## Anthropic / Fable (orchestrator — this session)
Basis: NOT self-measurable from inside the session; the Anthropic console
is authoritative. Qualitatively the largest single Anthropic line: a
two-day continuously-running orchestration context (routing, packets,
gates, ledger, V dialogue). No product code beyond the three V-granted
small tickets (tokenUnlock.ts; DR-172 seed swap; DR-172-A guard sync).

## Anthropic / claude relay (PRODUCT spend — debates themselves)
Basis: ledger.ledger_entry rows per run (exact per run in DB). Roughly
half of every debate's model calls (maker leg + judge/review calls
routed to claude-opus-5). Ceremony warm-ups ~20 calls each ×6 boots in
the window; V's runs additional.

## xAI / Grok — review lenses, authorizations, deliberative positions
Basis: 74 grok sessions in the window (local updates.jsonl carries no
parseable token totals); the xAI console is the authoritative source.
Seats: ~10 review/authorization/position engagements.

## The structural read
Verification outweighs coding BY DESIGN (two-plus lenses per writer), and
V's DR-153 roster placed the orchestrator AND the review lenses on
Anthropic — so Anthropic's share is roster law, not drift. Rebalancing
(larger Grok lens share, a GPT review seat) is a V roster ruling away.
This ledger is now a standing close-out artifact (P7).
