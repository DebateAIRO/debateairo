# Assertion: integration-guardrails

## Statement
The DDD observability remediation remains bounded to developer observability and preserves DebateAI safety/project guardrails.

## Acceptance
- No wire/API DTO rename in backend or `web/lib/types.ts` except optional type additions that do not change the raw contract.
- No DB/schema migrations, no data deletion, no fake runtime product data.
- API proxy transport observability remains domain-neutral unless a scoring suspicious event is explicitly recorded.
- Codex and Claude lanes are sibling lanes; neither waits on the other. Coordination happens through Hermes/Zenith/Kanban gates and shared contracts.
- Agents use Heartbeat Protocol, report live progress, and include Zenith assertion IDs in handoffs.
- Hermes remains Done/Blocked authority; V approval required for final go-ahead/merge decisions.

## Evidence
- Final git diff review confirms scope boundaries.
- Focused tests for logger/scoring specification pass.
- Final Hermes gate documents any known assertion gaps before closure.
