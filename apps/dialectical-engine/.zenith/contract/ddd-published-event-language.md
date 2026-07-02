# Assertion: ddd-published-event-language

## Statement
Published suspicious scoring observability events use DebateAI DDD ubiquitous language while legacy wire names remain internal or explicitly nested under raw/wire context only.

## Acceptance
- Top-level suspicious scoring event fields use DDD names: `argumentClaimId` / `argumentClaimIds` when available, `claimCount`, `scoredClaimCount`, `errorCount`.
- Top-level suspicious scoring event fields do not include `node_id`, `node_ids`, `nodeIdCount`, `scoredNodeCount`, or `items[].node_id`.
- If raw wire field names are retained for debugging, they are nested under an explicit `wire` or `raw` object, not top-level.
- Missing-field diagnostics are domain-named at top level with optional nested `wire.missingFields`.
- Current backend/web DTO files may continue to expose `node_id`, `node_ids`, and `scored_node_count` as raw wire/input fields.

## Evidence
- Contract tests assert emitted suspicious scoring JSON has `category:"suspicious"`, DDD top-level fields, and no forbidden top-level node/wire keys.
- Focused tests still prove no false positives and redaction/logger safety.
- Git diff shows no backend/API DTO rename and no schema/data change.
