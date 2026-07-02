# PRD: OBS-PR1 — Codex API Boundary Failure Observability

## Status

Draft PRD for Codex-owned PR1. Do not treat this as approval to touch PR2 or PR3.

## Owner and routing

- Primary coding owner: Codex.
- Reviewer / Done gate: Hermes.
- Manual QA before V: Hermes.
- Parallel peer: Claude owns PR2 only.
- Parked scope: PR3 is out of scope for Codex.

## One-line product goal

Build the minimal developer recorder path for API/fetch/frontend-backend boundary failures so V can see, in local redacted JSONL logs, when the frontend is not showing expected data because an API/proxy/backend boundary broke.

## Developer pain

When DebateAI breaks today, V can lose time answering basic questions:

- Did the frontend fail to render data, or did the backend/API never provide it?
- Did the proxy/fetch boundary throw, return a non-2xx, or return a malformed body?
- Was there a warning/degraded path before the visible failure?
- Was the backend operation failed-but-survivable, or did the process/config become unable to continue?
- Can we inspect enough evidence without leaking tokens, prompts, cookies, secrets, auth headers, or private payloads?

PR1 exists to make these answers visible during local/dev debugging.

## Scope summary

### In scope now

- One thin developer logging/event API entry point for PR1-owned web/API surfaces.
- Local JSONL sink, one structured event per line.
- Configurable sink path, defaulting to `logs/developer-events.jsonl` unless existing implementation chooses an equivalent documented default.
- Dev/local gating: enabled in development or with an explicit dev observability flag; off or safely quiet in production.
- Redaction of secrets/tokens/cookies/keys/auth headers plus payload truncation.
- Correlation fields where available: `trace_id`, `request_id`, `debate_id`, and/or current camelCase equivalents if preserving existing code style.
- API/proxy/fetch boundary logging for:
  - upstream fetch exceptions;
  - upstream non-2xx responses;
  - degraded/recovered boundary warnings;
  - backend/server failures where the app survives.
- Logger safety: logging failures must never interrupt the product path.
- Focused tests/checks covering redaction, JSONL writing, non-throwing behavior, and proxy/boundary failure event behavior.

### Explicitly out of scope for PR1

- PR2 files, PR2 worktree, Claude-owned files.
- PR3 work.
- DB log persistence, migrations, log tables.
- User-facing observability UI.
- Swagger/admin dashboard for logs.
- OpenTelemetry SDK, trace backend, Prometheus `/metrics`, Grafana, Sentry, Loki/Datadog/Elasticsearch.
- Broad scoring/provider architecture changes.
- Fake runtime product data.
- Pushes or data deletion.

## File/worktree contract

Codex may only work in the PR1 worktree and PR1-owned files.

Likely PR1-owned surfaces, to be verified by Codex against the actual PR1 diff/worktree before editing:

- `web/lib/observability/logger.ts`
- `web/lib/observability/index.ts`
- `web/lib/observability/logger.test.mjs`
- `web/lib/observability/logger.contract.test.mjs`
- `web/lib/observability/README.md`
- `web/app/api/[...path]/route.ts`
- `web/app/api/[...path]/route.test.mjs`

Forbidden unless Hermes explicitly reroutes:

- PR2 worktree/files.
- PR3 worktree/files.
- Claude-owned suspicious-output implementation files if they are not part of PR1.
- Coordinator/worker/database schema or migrations.
- Any shared file where Codex cannot prove non-overlap with Claude.

If a forbidden file appears necessary, Codex must stop and post `CODEX BLOCKED` instead of crossing scope.

## Shared observability event contract

PR1 must align with the project-wide observability contract.

### Required shape

Events should be structured JSON objects. Use existing project field names where already established, but the semantic fields must exist or be intentionally mapped.

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
operation
route/path/action
status/statusText
upstream/upstreamPath when proxying
duration_ms / durationMs when measured
error
context
rootHint / suspectedLayer when useful
```

Do not add fields that force private payload dumps. Prefer compact summaries and counts.

### Level convention

```text
debug — verbose dev tracing, payload shapes, branch/path taken; off in production.
info — normal lifecycle facts: request received, debate started, round completed.
warn — recovered/degraded but not failed: retry succeeded, fallback used, slow response, deprecated path.
error — operation failed but app survives: LLM call failed, DB write rejected, upstream 5xx.
fatal — process cannot continue: config missing at boot, DB unreachable on startup.
```

### Suspicious convention

Do not lose suspicious events as ordinary warning noise.

Preferred representation:

```json
{
  "level": "warn",
  "category": "suspicious"
}
```

Reason: `level` remains severity-compatible, while `category` lets developers query product-truth weirdness directly:

```sh
jq 'select(.category=="suspicious")' logs/developer-events.jsonl
jq 'select(.level=="warn" and .category!="suspicious")' logs/developer-events.jsonl
```

A distinct `level:"suspicious"` is allowed only if V/Hermes explicitly choose it later. PR1 should not collapse suspicious output into plain `warn` with no category.

PR1 primarily owns API/boundary failures. It may emit `category:"suspicious"` only when a boundary technically succeeds but returns a shape that makes frontend output suspicious or empty. PR2 owns the dedicated suspicious-output/artifact-chain slice.

## Privacy and redaction requirements

PR1 cannot pass review unless Hermes can verify secrets/private data are redacted or omitted.

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

- Sensitive keys redact to a stable marker such as `[REDACTED]`.
- Sensitive values embedded in strings are redacted when detected.
- Long strings are truncated.
- Large arrays/objects are truncated or summarized.
- Circular/deep structures are safe.
- Error messages/stacks are truncated and redacted.
- Query parameters containing token/secret/key/password/auth/session-like names are redacted before logging.

## Functional requirements

### FR1 — Developer logger API

Codex must maintain or create a single thin logger/event API that modules call instead of raw `console.log`/`print` for developer observability.

Acceptance:

- Provides level methods for debug/info/warn/error/fatal.
- Provides a way to record suspicious category events without losing category information.
- Exposes a server-only boundary if Node file APIs are used.
- Is safe to import only from server contexts unless an injected interface is used.

### FR2 — Local JSONL sink

The logger writes one JSON object per line to a local developer log path.

Acceptance:

- Default path is documented.
- Path can be overridden by environment variable/config.
- Parent directory is created if missing.
- Logging can be disabled/enabled by dev environment flag.
- Event write failures are swallowed and never break product flow.

### FR3 — API/proxy non-OK logging

When the API proxy/fetch boundary receives a non-OK upstream response, PR1 records a redacted event.

Acceptance:

- 4xx/degraded behavior is `warn` unless the semantics require otherwise.
- 5xx/server failure is `error`.
- Event includes method, safe path, redacted upstream path, status/statusText, and safe response snippet/summary.
- Proxied response status/body/header behavior remains preserved for the product path.

### FR4 — API/proxy thrown fetch logging

When upstream fetch throws, PR1 records an `error` event before preserving the original failure behavior.

Acceptance:

- Event includes method, safe path/upstream path, normalized error message/code/stack where safe.
- Logger failure does not hide or replace the original exception.
- Product behavior remains equivalent except for the added developer log.

### FR5 — Correlation fields

PR1 should include correlation identifiers where available.

Acceptance:

- `request_id`/`requestId` is generated or passed when practical for API boundary events.
- `debate_id`/`debateId` is included when the route or payload safely identifies a debate.
- `trace_id`/`traceId` is included if existing infrastructure already provides it; full distributed tracing is PR3/future scope.
- Missing correlation fields should not block logging if they are unavailable.

### FR6 — Boundary warnings without spam

PR1 may log warnings for recovered/degraded boundary behavior.

Acceptance:

- Normal successful responses should not produce noisy logs.
- Debug payload-shape tracing must be dev-only and off in production.
- Warn events should identify the degraded condition and recovery/fallback when applicable.

## Non-functional requirements

- Logging overhead must stay small for local/dev use.
- The logger must not throw into product flow.
- JSONL should be line-oriented and jq-friendly.
- PR1 must be testable without requiring live external providers.
- Tests must not depend on fake runtime product data; fixtures are allowed only for test-only contract validation.

## Verification expectations

Codex should run the narrowest relevant checks and report exact output.

Expected checks may include, depending on touched files:

```sh
# from web/
node --test lib/observability/logger.test.mjs lib/observability/logger.contract.test.mjs
node --input-type=module - <<'EOF'
await import('./app/api/[...path]/route.test.mjs');
EOF

# from app root
web/node_modules/.bin/tsc --noEmit --project web/tsconfig.dev-smoke.json --incremental false
git diff --check
git status --short --branch
```

Git-Bash bracket-route warning: do not count `node --test app/api/[...path]/route.test.mjs` as passing if it reports `tests 0`. Use the dynamic import smoke from `web/`.

## Hermes review checklist

Hermes should reject/block PR1 if any of these are true:

- Secrets/tokens/prompts/cookies/auth headers can appear in JSONL.
- Logger can throw into the product path.
- Proxy behavior changes beyond logging.
- Non-OK responses are swallowed or rewritten incorrectly.
- Normal success paths spam logs.
- Suspicious events collapse into plain warn without `category:"suspicious"` when suspicious semantics are present.
- PR1 touches PR2/PR3/Claude-owned files without explicit routing.
- No focused tests/checks were run.
- Handoff lacks commit SHA when implementation changed files.

## Handoff format required from Codex

```text
READY FOR HERMES REVIEW:
- agent: Codex
- PR/slice: OBS-PR1 API boundary failure observability
- worktree/path:
- files changed:
- tests/checks run with exact output:
- commit SHA if committed:
- privacy/redaction evidence:
- correlation fields implemented or intentionally unavailable:
- suspicious category handling:
- risks/blockers:
- overlap check result with Claude PR2:
- skellies/workstreams used:
- recommended Hermes action:
```

## Future/parked items for PR3, not PR1

- OpenTelemetry SDK and auto-instrumentation.
- Resource attributes across services: `service.name`, `service.version`, `env`, `host`, `git_sha`.
- Log rotation/retention.
- Prometheus metrics: RED/USE, domain metrics, worker queue metrics.
- Distributed traces across web → coordinator → worker → LLM.
- Trace context propagation across queue/worker boundaries.
- Sentry/centralized exception capture.
- Dashboards, alerting, SLOs.
- Langfuse/Phoenix/LangSmith or other LLM-native observability backend.
