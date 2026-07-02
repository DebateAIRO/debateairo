# Assertion: suspicious-category-contract

## Statement
Developer observability preserves suspicious product-truth states as a distinct queryable top-level event classification.

## Acceptance
- `AppLogEvent` or the concrete serialized JSONL shape supports top-level `category`.
- `developerLogger.suspicious(...)` emits `level:"warn"` and `category:"suspicious"`.
- Ordinary warning events do not receive `category:"suspicious"`.
- The contracted query `jq 'select(.category=="suspicious")' logs/developer-events.jsonl` can find suspicious events.
- Logger failure safety and redaction behavior remain intact.

## Evidence
- Focused logger tests showing suspicious category is top-level and ordinary warns are not suspicious.
- Existing logger safety/redaction tests still pass.
- No backend/API DTO rename, no schema/data change, no fake runtime data.
