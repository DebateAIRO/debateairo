# PRD: OBS-PR2 — Claude Suspicious Output and Artifact-Chain Observability

## Status

Draft PRD for Claude-owned PR2. Do not treat this as approval to touch PR1 or PR3.

## Owner and routing

- Primary coding owner: Claude.
- Claude internal workers: implementation skellies and test skellies.
- Reviewer / Done gate: Hermes.
- Manual QA before V: Hermes.
- Parallel peer: Codex owns PR1 only.
- Parked scope: PR3 is out of scope for Claude.

## One-line product goal

Build an isolated suspicious-output observability slice that records redacted, queryable `category:"suspicious"` JSONL events when a product path technically succeeds but returns empty, missing, incomplete, or unusable output.

## Developer pain

Some DebateAI failures are not clean errors. The operation may report success, the request may return 200, or the job may be complete, but the product result is still broken.

Examples V needs to catch quickly:

- frontend has nothing meaningful to show despite a successful response;
- scoring/analysis says available/complete but has no useful claims;
- required fields are missing;
- artifact-chain metadata is absent;
- model/provider output is present but incomplete or unusable;
- the system collapses fix-this-now product weirdness into generic warning noise;
- private data would leak if naive payload logging dumps full bodies/prompts/tokens.

PR2 exists to preserve the distinction between ordinary warnings and suspicious product-truth states.

## Scope summary

### In scope now

- Suspicious-output classifier(s) for PR2-owned product surface.
- Artifact-chain / required-field checks where PR2 owns the response helper or product contract.
- Queryable suspicious events using `level:"warn"` plus `category:"suspicious"` unless V/Hermes explicitly choose a distinct level later.
- Injected logger interface when shared helpers cannot import server-only file sinks.
- Redacted/truncated payload summaries: ids, counts, status, missing field names, reason codes, and safe context.
- Focused tests proving:
  - suspicious cases emit suspicious category events;
  - normal successful outputs do not false-positive;
  - ordinary warnings remain ordinary warnings;
  - secrets/private fields are not logged raw;
  - logger failures do not break product flow.
- Claude implementation skellies and test skellies, confined to PR2 file contract.

### Explicitly out of scope for PR2

- PR1 files, PR1 worktree, Codex-owned API/proxy boundary work.
- PR3 work.
- DB log persistence, migrations, log tables.
- User-facing observability UI.
- Swagger/admin dashboard for logs.
- OpenTelemetry SDK, Prometheus `/metrics`, Grafana, Sentry, production log shipping.
- Broad scoring/provider architecture changes.
- Data deletion.
- Fake runtime product data.
- Pushes.

## File/worktree contract

Claude may only work in the PR2 worktree and PR2-owned files.

Likely PR2-owned surfaces, to be verified by Claude against the actual PR2 diff/worktree before editing:

- `web/lib/observability/suspiciousScoring.ts`
- `web/lib/scoringResponse.ts`
- `web/lib/scoringResponse.test.mjs`
- PR2-owned tests around suspicious-output behavior
- PR2-owned docs/contracts describing suspicious events

PR2 may use an injected logger interface rather than importing a server-only JSONL sink directly from shared/client-safe helpers.

Forbidden unless Hermes explicitly reroutes:

- PR1 worktree/files.
- PR3 worktree/files.
- Codex-owned API/proxy route files.
- Shared files where Claude cannot prove non-overlap with Codex.
- Coordinator/worker/database schema or migrations.

If a forbidden file appears necessary, Claude must stop and post `CLAUDE BLOCKED` instead of crossing scope.

## Shared observability event contract

PR2 must align with the project-wide observability contract.

### Required shape

Suspicious-output events should be structured JSON objects. Use existing project field names where already established, but the semantic fields must exist or be intentionally mapped.

Preferred semantic fields:

```text
ts or timestamp
level
category
event
component or source
message
trace_id / traceId when available
request_id / requestId when available
debate_id / debateId when available
run_id / runId when available
artifact_id / artifactId when available
operation
status
reason
missingFields
claimCount
argumentClaimIds
errorCount
scoredClaimCount
artifactChainExpectation
context
rootHint / suspectedLayer when useful
```

Published developer observability payloads should use DebateAI ubiquitous-language
terms. Backend/API wire DTOs may still expose raw fields such as `node_id`,
`node_ids`, or `items`, but suspicious-output event payloads should translate
those wire names into claim-language fields such as `argumentClaimIds`,
`claimCount`, and `scoredClaimCount`.

Raw/wire/internal mapping note:

```text
wire node_id / node_ids -> published argument claim id / argumentClaimIds
wire items -> published claims / claimCount
wire scored node rows -> published scored claims / scoredClaimCount
```

Raw/wire terminology is acceptable only in a clearly labeled raw/wire/internal
mapping section like the note above, or when diagnosing the backend/API DTO
boundary itself. It must not be the published suspicious event contract.

Missing-field diagnostics should likewise use DDD field paths where they are
published to developers, for example `argumentClaims[0].id`,
`argumentClaims[0].score`, `argumentClaims[0].label`, or
`argumentClaims[0].rationale`. If a diagnostic comes directly from a backend/API
wire DTO, translate the public event field path while keeping the raw field name
only in redacted internal context when that is necessary for debugging.

Do not log full raw response bodies when counts, missing-field names, ids, and reason codes are enough.

### Level convention

```text
debug — verbose dev tracing, payload shapes, branch/path taken; off in production.
info — normal lifecycle facts: request received, debate started, round completed.
warn — recovered/degraded but not failed: retry succeeded, fallback used, slow response, deprecated path.
error — operation failed but app survives: LLM call failed, DB write rejected, upstream 5xx.
fatal — process cannot continue: config missing at boot, DB unreachable on startup.
```

### Suspicious convention — mandatory for PR2

PR2’s core requirement is that suspicious product-truth states must not disappear into plain `warn` noise.

Preferred representation:

```json
{
  "level": "warn",
  "category": "suspicious"
}
```

Required query:

```sh
jq 'select(.category=="suspicious")' logs/developer-events.jsonl
```

Useful companion query:

```sh
jq 'select(.level=="warn" and .category!="suspicious")' logs/developer-events.jsonl
```

A distinct `level:"suspicious"` is allowed only if V/Hermes explicitly choose it later. Default PR2 behavior should keep normal severity in `level` and product-truth classification in `category`.

## Privacy and redaction requirements

PR2 cannot pass review unless Hermes can verify secrets/private data are redacted or omitted.

Never log raw:

- bearer tokens;
- API keys;
- auth headers;
- cookies;
- session tokens;
- passwords/secrets;
- private keys;
- raw prompts;
- full private provider/model payloads;
- hidden/internal sensitive data;
- full user/debate content when a compact id/count/shape summary is enough.

Required behavior:

- Suspicious events should prefer safe summaries:
  - status;
  - counts;
  - missing field names;
  - reason codes;
  - ids already safe for local dev correlation;
  - artifact metadata presence/absence.
- Sensitive keys redact to `[REDACTED]` or equivalent.
- Long strings are truncated.
- Large arrays/objects are summarized or truncated.
- Error messages/stacks are redacted/truncated.
- Prompt/response capture is not part of PR2 unless behind an explicit flag and redacted/truncated; full black-box recorder belongs to PR3/future scope.

## Functional requirements

### FR1 — Suspicious classifier

Claude must maintain or create a classifier that detects successful-but-suspicious product output in PR2-owned response surfaces.

Acceptance:

- Returns no events for null/failed/unavailable responses that are not successful product-output states.
- Detects success responses with empty useful output.
- Detects missing required response fields.
- Detects missing artifact-chain metadata where the current product contract expects it.
- Produces stable event names and safe payload summaries.

### FR2 — Suspicious JSONL category

When suspicious output is recorded, the logger/event path must preserve suspicious as queryable category metadata.

Acceptance:

- Event has `level:"warn"` and `category:"suspicious"`, or another explicitly approved representation.
- Event is findable with `jq 'select(.category=="suspicious")'`.
- The same event does not become indistinguishable from ordinary warn-only JSONL.

### FR3 — Artifact-chain observability

PR2 should expose missing artifact-chain metadata when product contracts require it.

Acceptance:

- Missing model/cache/artifact metadata is represented as missing-field names or reason codes, not raw provider dumps.
- Event identifies the expectation, e.g. current producers should emit model metadata and cache/artifact metadata.
- The frontend/product path is not changed except for developer observability.

### FR4 — No false-positive spam

PR2 must avoid treating normal successful product output as suspicious.

Acceptance:

- Normal available/partial scoring output with required fields and expected metadata emits no suspicious events.
- Ordinary warnings not related to suspicious product truth stay as ordinary warnings.
- Debug trace details, if any, are dev-only and off in production.

### FR5 — Logger injection and server/client boundaries

Shared helpers must not import Node-only file sinks if they can be used from client/shared contexts.

Acceptance:

- Suspicious helper accepts an injected logger interface where needed.
- Server/proxy/API code can pass the concrete developer logger.
- Shared logic remains testable with fake loggers.

### FR6 — Logger failure safety

Suspicious recording must never break product behavior.

Acceptance:

- Exceptions thrown by logging are swallowed at the boundary where logging is optional developer observability.
- Proxied responses, UI formatting, and scoring helpers preserve existing product behavior.

## Suspicious cases PR2 should cover

Minimum cases:

```text
1. Empty successful output
   Success status but no useful scored claims when product expected output.

2. Missing required fields
   Success status but response lacks required structural fields such as debate id, status, claims, argument claim ids, scored claim scores/labels/rationale, etc. Adjust exact fields to current project types.

3. Missing artifact-chain metadata
   Success status and useful-looking output, but model/cache/artifact metadata required by current product-truth contract is missing.
```

Optional only if already cheap and PR2-owned:

```text
4. Suspicious scoring reason mismatch
   Product copy says scores are real/available but response reason/error state implies unavailable provider/model/token.

5. Suspicious completed-job empty result
   Wrapper/job says complete but payload result is empty/unusable.
```

Do not broaden into backend job orchestration fixes without Hermes/V routing.

## Non-functional requirements

- Suspicious detection must be deterministic and testable with fixtures.
- Test fixtures are allowed only for contract validation; they must not become runtime fake product data.
- Logging overhead must stay small.
- JSONL output must be line-oriented and jq-friendly.
- Suspicious event payloads must be compact enough to scan.
- PR2 must not require external providers to run focused tests.

## Claude skelly plan

Claude may create tiny internal skellies/workstreams.

### Implementation skelly

Scope:

- Implement or harden suspicious classifier and recording path in PR2-owned files.
- Add/keep injected logger interface.
- Ensure `category:"suspicious"` is present on suspicious events.

Forbidden:

- PR1 API/proxy route ownership unless Hermes explicitly reroutes.
- PR3/future observability stack.
- DB/schema/provider architecture changes.

### Test skelly

Scope:

- Tests for empty successful output.
- Tests for missing required fields.
- Tests for missing artifact-chain metadata.
- Tests for no false positives on normal output.
- Tests for redaction/category contract when using the concrete logger or a contract-level fake.

Forbidden:

- Broad unrelated frontend/scoring refactors.
- Tests that only pass with fake runtime product behavior.

## Verification expectations

Claude should run the narrowest relevant checks and report exact output.

Expected checks may include, depending on touched files:

```sh
# from web/
node --test lib/scoringResponse.test.mjs
node --test lib/observability/logger.test.mjs lib/observability/logger.contract.test.mjs
node --input-type=module - <<'EOF'
await import('./app/api/[...path]/route.test.mjs');
EOF

# from app root
web/node_modules/.bin/tsc --noEmit --project web/tsconfig.dev-smoke.json --incremental false
git diff --check
git status --short --branch
```

If Claude does not touch API/proxy route behavior, the route dynamic-import smoke can be omitted or left for Hermes final integration review.

Git-Bash bracket-route warning: do not count `node --test app/api/[...path]/route.test.mjs` as passing if it reports `tests 0`. Use dynamic import from `web/` when route tests are needed.

## Hermes review checklist

Hermes should reject/block PR2 if any of these are true:

- Suspicious events are plain `warn` with no `category:"suspicious"` or equivalent queryable marker.
- Normal successful outputs false-positive as suspicious.
- Suspicious output includes raw tokens/prompts/cookies/auth headers/private payloads.
- Shared helpers import server-only file APIs in client/shared contexts.
- Logging failure can break product behavior.
- PR2 touches PR1/PR3/Codex-owned files without explicit routing.
- No focused tests/checks were run.
- Handoff lacks commit SHA when implementation changed files.
- The implementation fixes product data by adding fake runtime data instead of observing real suspicious states.

## Handoff format required from Claude

```text
READY FOR HERMES REVIEW:
- agent: Claude
- PR/slice: OBS-PR2 suspicious output / artifact-chain observability
- worktree/path:
- files changed:
- tests/checks run with exact output:
- commit SHA if committed:
- suspicious category evidence:
- no-false-positive evidence:
- privacy/redaction evidence:
- skellies used:
- risks/blockers:
- overlap check result with Codex PR1:
- recommended Hermes action:
```

## Future/parked items for PR3, not PR2

- OpenTelemetry traces spanning web → coordinator → worker → LLM.
- Prompt/response black-box recorder beyond redacted/truncated flagged debugging.
- Cost aggregation dashboards.
- Prometheus metrics and RED/USE dashboards.
- Worker heartbeat metrics.
- Sentry/centralized exception capture.
- Production log shipping.
- Alerts/SLOs.
- LLM-native observability backends such as Langfuse, Phoenix/Arize, or LangSmith.
