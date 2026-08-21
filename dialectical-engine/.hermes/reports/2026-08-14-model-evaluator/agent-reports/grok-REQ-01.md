# Self-report — Grok REQ-01 (Requirements.md) — rework round 2

Mission: model-evaluator / REQUIREMENTS ENGINEERING  
Seat: sole requirements author; rework after REQ-02a round-2 REWORK (C1 only; B1–B5 already resolved). Reviewer B had PASS + NB2-2.

## Reproduce-first (C1)

Verified before edit:
- `packages/critique/src/index.ts` `readDeploymentMakerCapability` (~245–292): single register row `configuredProviderSet`; entries flat `{ providerRef, adapterKind, maker }` — no purpose field.
- `apps/api/src/main.ts` `resolveDiscoveredPanel` (~43–56): probes exactly `deploymentMakers.configuredProviders` providerRefs into HEALTHY panel members.
- `apps/runner/src/index.ts` `selectDifferentMakerReviewer` (~114–126): reviewers from configured makers ≠ author.
- `migrations/0022_dr181_discovery.sql`: `agent_count = jsonb_array_length(discovered_panel)`.
Log: goal scratch `rework-r2-reproduce.md`.

## What changed (narrow)

- FR-0.6: purpose-separated config note + **AC5** — evaluator vLLM MUST NOT enter panel-discovery set; same panel membership and `agent_count` when vLLM configured-and-healthy vs absent; no author/reviewer/structural-ceiling side effect.
- Open question **12**: FR-0.6 ticket ownership (new ticket vs fold into 02) for orchestrator (NB2-2).
- Document-control rework-round-2 line. Nothing else rewritten. Docs only.

## Token usage basis

Round-2 turn: C1 review + four source reproductions + two surgical Requirements edits + self-report + verification greps. Exact meter not exposed; small relative to prior full rewrite. No API keys (DR-179).
