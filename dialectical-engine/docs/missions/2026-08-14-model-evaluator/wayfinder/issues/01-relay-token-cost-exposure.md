# 01 — What token/cost data do the relays and vLLM actually expose today?

Type: research
Status: resolved

## Question

The evaluator's cost signal is token-ledger derived (charting ruling 7). Before the
metering ticket can be designed, surface the facts: for each model path in use —
claude relay (acceptance/claude-relay.ts), codex shim (acceptance/model-shim.ts),
grok relay (acceptance/grok-relay.ts, already parses `total_cost_usd`), the shared
relay-core (acceptance/relay-core.ts), and the vLLM OpenAI-compatible container —
what per-call token/cost fields does each actually return or log today? Where in the
response/stream do they appear, what units, what gaps (which paths report nothing)?
Also: what the manual TOKEN-LEDGER-2026-08-13-14.md captured and how (per-agent
accounting bases from loop reports). Deliverable: a findings markdown in the repo
listing per-path fields, gaps, and the smallest capture point for persisting per-call
tokens per model.

## Answer

Resolved 2026-08-14 by background research agent. Full findings:
../assets/01-relay-token-cost-exposure-findings.md

Gist:
- Every CLI path except codex already receives token/cost data on stdout and
  DISCARDS it at parse time; the single shared loss point is `parseCompletion`
  in acceptance/relay-core.ts:103, and the relay's rebuilt HTTP response
  (relay-core.ts:159-166) carries no `usage` at all.
- claude CLI emits `total_cost_usd` + per-model `modelUsage` (dropped,
  claude-relay.ts:47); grok parses `total_cost_usd` per call but relay-core
  drops it (only in-memory `handshakeCostUsd` survives, consumed by nothing);
  codex stdout usage unverified, but exact tokens live in `~/.codex/sessions`
  `token_count` events (verified live — the manual ledger's "footer" basis).
- vLLM responses carry standard `usage.prompt/completion/total_tokens`; the
  gateway never parses them but persists the whole body as
  `ledger.raw_artifact.raw_text` (providers/src/index.ts:253-269) —
  recoverable, never surfaced. The vLLM adapter is compiled but not
  production-selected.
- No token/cost column exists in any migration; `ledger.ledger_entry` counts
  calls only — hence the manual TOKEN-LEDGER's numbers all came from
  out-of-band surfaces (session files, harness notifications, consoles).
- Recommended smallest capture point (feeds ticket 08): ONE hook — widen
  `CliCompletion` with an optional usage block, emit standard `usage` from
  relay-core, parse it optionally in the one gateway into
  `raw_artifact.metadata_json` (no migration); unmetered paths stay explicitly
  `usage: null`, never estimated.
