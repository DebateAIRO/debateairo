# Scoring API Contract

## `GET /api/debates/{id}/scoring`

Returns the public node-scoring state for a non-archived debate.

`404` means the debate does not exist or is archived. Default public reads do
not require a bearer token.

For the scoring refactor currently in flight, Option B is authoritative:
`POST /api/debates/{id}/scoring/jobs` performs a synchronous transitional
refresh and returns a terminal `complete` or `failed` status. Real async worker
scoring is deferred to a later milestone; no runtime path should preserve fake
queued-job behavior for scoring refreshes.

By default this endpoint is a stored-output read path. Passing
`force_refresh=true` bypasses matching node-scoring cache entries and performs a
controlled provider-backed scoring check through the configured `judge`
provider. Because this path can trigger real model/provider work, requests with
`force_refresh=true` require a valid user bearer token. If no real scoring
provider is configured or the provider call fails, the response remains an
honest `unavailable` or `partial` payload; the API must not fabricate scores.

## Response Shape

```json
{
  "debate_id": "debate-123",
  "status": "available",
  "node_ids": ["node-1", "node-2"],
  "items": [],
  "max_nodes": 12,
  "scored_node_count": 2,
  "skipped_node_count": 0,
  "truncated": false,
  "producer": "node_scoring",
  "generated_at": "2026-06-18T10:15:30Z",
  "model_metadata": {
    "provider": "codex",
    "model": "gpt-5.4",
    "checked_at": "2026-06-18T10:15:30Z",
    "status": "available"
  },
  "cache": {
    "hit": false
  }
}
```

- `debate_id`: requested debate ID.
- `status`: one of `available`, `partial`, or `unavailable`.
- `node_ids`: current, non-stale node IDs that belong to the debate.
- `items`: public scoring payloads for scored nodes.
- `max_nodes`: optional model-check node limit applied by the scoring service.
- `scored_node_count`: optional count of nodes attempted within the limit.
- `skipped_node_count`: optional count of current nodes skipped by the limit.
- `truncated`: optional boolean indicating scoring was limited before all current
  nodes were checked.
- `producer`: optional producer metadata from the stored scoring run.
- `generated_at`: optional generation timestamp from the stored scoring run.
- `model_metadata`: optional public model-check metadata with `provider`,
  `model`, `checked_at`, and `status`.
- `cache`: optional response provenance metadata. `cache.hit` is `true` when the
  response was served from scoring cache and `false` when it came from a fresh
  model check. It does not indicate score quality, trust, freshness, or model
  availability.
- `reason`: present when scoring is unavailable and explains why.

Fields with no value are omitted from the public response.

`items` contain validated node scoring data, including `node_id`, `claim`,
`scores`, `labels`, `holes`, `fatal_flags`, `score_caps`,
`judge_disagreements`, `recommended_investigations`, `rationale`, and optional
`debug` metadata.

The public payload must not expose raw judge output blobs or arbitrary provider
metadata. If internal scoring data contains `debug.judge_outputs`, the API
strips that field before returning the response. Stored `model_metadata` is
validated and returned only in the public allowlisted shape.

## Truthiness Guardrail

Scoring values are model-assisted reasoning aids, not truth labels. They may
help readers compare claim support, uncertainty, impact, holes, and
disagreements, but they do not certify that a claim is true, false, proven, or
safe to act on.

Public scoring UI and API consumers must preserve uncertainty wherever the
scoring payload exposes it. Do not hide or collapse `labels`, `holes`,
`fatal_flags`, `score_caps`, `judge_disagreements`,
`recommended_investigations`, `rationale`, unavailable status, partial status,
or provider/cache provenance into a single confidence-looking truth verdict.

If scoring is incomplete, stale, capped, disputed, malformed, or unavailable,
surface that state plainly. A missing, partial, or low-confidence model check
must never be replaced with a fake score, a quiet default, or display copy that
implies authoritative fact-checking.

## No-Scaffolding Runtime Policy

Runtime product surfaces must never scaffold scoring with fake data. This
applies to API responses, web UI state, queued job/status surfaces, smoke-check
output that could be mistaken for runtime evidence, and any future scoring
worker or provider integration.

If real scoring data, provider output, or job state is unavailable, the product
must return or render an honest `unavailable`, `partial`, `queued`, `running`,
`failed`, or blocked state as appropriate. Runtime code must not fabricate,
default, infer, or pad any of these fields:

- scoring values or score caps;
- holes, fatal flags, labels, or judge disagreements;
- recommended investigations or recommendation counts;
- provider availability, provider identity, model identity, cache provenance, or
  sanitized model metadata;
- queued job IDs, progress, completion, failure, retry, or cancellation state;
- raw or summarized model output, rationales, explanations, or parser results.

Fixtures, mocks, canned provider responses, and placeholder scoring payloads are
test-only tools. They may be used in unit tests, contract validation, local
dry-run verification, and documentation examples only when they are clearly
separated from runtime code paths and cannot be returned to users as product
state. A missing fixture in a test should fail the test; missing runtime scoring
must surface an honest unavailable or blocked state.

## Honest Unavailable Behavior

The endpoint returns `status: "unavailable"` with an empty `items` array when no
usable public scoring output exists. This includes these stored-output failures:

- No completed scoring analyzer output exists.
- The stored output was not produced from judge outputs.
- The stored output is missing an `items` array.
- A stored scoring item is malformed.
- The stored output has an unknown scoring status.
- Any stored scoring item references a node ID that is not one of the current
  debate's non-stale `node_ids`, including unknown, stale, or cross-debate node
  IDs.

For the node-membership failure, the public reason is:

```text
Stored scoring output references nodes outside the current debate.
```

## Producer Path Status

GET /api/debates/{id}/scoring without `force_refresh` is a read API, not a
scoring producer. It reads the latest completed `AnalyzerRun` with
`analyzer_type: "node_scoring"` and `scoring_source: "judge_outputs"`, validates
the stored payload, strips private debug/provider data, and returns the public
response shape above.

With `force_refresh=true`, the route first requires a valid user bearer token,
then uses the existing `ProviderRegistry` configuration for the `judge` role,
adapts it to the `ScoringProvider` protocol, and calls
`score_nodes_with_provider(..., force_refresh=True)`. This path builds the public
payload in memory and uses the normal node-scoring cache write/update path for
successful or unavailable provider outputs.

Provider-backed producer helpers accept `force_refresh: true` to bypass existing
node scoring cache entries and call the configured real `ScoringProvider` again.
Fresh force-refresh results still use the normal cache write/update path and
single-node helper responses return `cache.hit: false`. Aggregate route
responses expose the scored `items` or per-node `errors` rather than a single
cache-hit value. The flag must not fabricate scores when no real provider is
available, and the endpoint must not silently convert `force_refresh` into fake
runtime scoring.

The Option B user refresh path,
`POST /api/debates/{id}/scoring/jobs`, validates the configured `judge`
provider, runs the scoring refresh inline, writes a completed scoring
`AnalyzerRun` when the provider succeeds, and returns a terminal `complete` or
`failed` job response. The authenticated `force_refresh=true` read-route
compatibility path remains a live provider-check response plus cache updates,
not durable completed
analyzer-run records and not the durable user refresh contract. Any future
queued job, worker adapter, or durable persistence wiring must preserve these
boundaries:

- Provider-specific details stay behind the provider adapter; scoring semantics
  continue to depend only on the `ScoringProvider` protocol.
- Persisted public scoring runs use `AnalyzerRun.analyzer_type == "node_scoring"`
  and `provenance.scoring_source == "judge_outputs"`; equivalently,
  scoring_source: "judge_outputs" must be present in run provenance.
- Public responses never expose raw judge outputs, provider command output,
  tokens, credentials, or arbitrary provider metadata.
- Partial producer failures are represented as `errors` beside successful
  `items`; failed nodes must not be converted into fake `NodeScoringPayload`
  entries.

Cache implementation may read or store validated payloads only for outputs that
can be traced back to a real provider-backed scoring path. It must not create or
cache fake runtime scores to fill unavailable gaps.

## Model Provider Handoff

Current scoring provider usage is intentionally narrow. The scoring service
does not call Codex directly; it consumes the `ScoringProvider` protocol in
`coordinator/app/scoring/judges.py`. That protocol accepts a
`ScoringProviderRequest` containing the normalized claim, optional argument
text, judge role, prompt version, timeout, and metadata, and returns a
`ScoringProviderResult` containing provider/model labels, raw model output,
latency/check metadata, and provider metadata.

The current Codex-backed adapter lives in
`coordinator/app/scoring/service.py` as `RegistryScoringProvider`. It is the
handoff point between scoring semantics and the general provider registry:

- `RegistryScoringProvider.__init__` calls `detect_codex_scoring_config(...)`
  for the `judge` role and records the selected provider/model labels.
- `RegistryScoringProvider.judge_node` renders the single-node scoring prompt
  and calls `ProviderRegistry.generate_for_role("judge", ..., response_format="json")`.
- `score_debate_with_provider_registry` creates that adapter, then delegates to
  `score_nodes_with_provider`, which owns cache lookup/write, bounded batch
  behavior, parser/reducer flow, partial errors, and public metadata shaping.

Codex is currently supplied through `coordinator/app/providers/registry.py`.
`ProviderRegistry` loads `config/agents.yaml`, resolves the `judge` role, and
defaults its provider map to `{"codex": CodexCliProvider()}`. The concrete
Codex CLI adapter is `coordinator/app/providers/codex_cli.py`; it shells out to
`codex exec`, asks for JSON when requested, and returns an `LLMResponse`.

For a senior replacing Codex with another real model provider, keep the scoring
contract stable and wire the replacement at the provider boundary:

- Add the real provider behind `ProviderRegistry.providers` using the existing
  `LLMProvider.generate(...)` contract, or replace `RegistryScoringProvider`
  with another adapter that still implements `ScoringProvider`.
- Generalize the Codex-specific availability gate in
  `detect_codex_scoring_config` and its callers so the `judge` role can accept
  the selected real provider instead of requiring `provider == "codex"`.
- Preserve `render_single_node_judge_prompt(...)`, `parse_judge_json(...)`,
  `reduce_assessments(...)`, cache identity, and the public
  `model_metadata` allowlist unless the scoring contract is intentionally
  revised in a separate architecture slice.
- Keep provider secrets, raw command output, credentials, and arbitrary
  provider metadata out of public API payloads and smoke-check output.
- Do not use fake providers, placeholder scores, or fallback constants to make
  scoring appear available. Missing configuration, provider errors, malformed
  output, and timeouts must continue to return honest `unavailable` or
  `partial` states.

The current API entrypoints that exercise this seam are:

- `POST /api/debates/{id}/scoring/jobs`, which requires a valid user bearer
  token, validates the configured judge provider/model, runs a synchronous
  transitional scoring refresh, persists completed scoring output when the
  provider succeeds, and returns `complete` or `failed`.
- `GET /api/debates/{id}/scoring?force_refresh=true`, which is an authenticated
  transitional/manual path that instantiates `ProviderRegistry` and runs the
  provider-backed scorer synchronously without replacing the stored-output read
  contract.
- `make real-codex-scoring-smoke`, which is dry-run by default and only calls
  the configured Codex provider when `--run-real-codex` is explicitly supplied.

After replacement, the senior handoff should include the new provider name,
the configured `judge` model, sanitized success and failure smoke output, and
evidence that public scoring responses still expose only the documented
metadata shape.

## Manual Codex Smoke Check

`make real-codex-scoring-smoke` runs the one-node smoke script in dry-run mode.
Dry-run mode reads the local debate/node target if available and prints a JSON
report, but it does not call Codex or any model provider.

To intentionally call the configured real Codex provider on one local node, pass
the explicit opt-in flag through `SCORING_SMOKE_FLAGS`:

```sh
make real-codex-scoring-smoke SCORING_SMOKE_FLAGS="--debate-id <debate-id> --node-id <node-id> --run-real-codex"
```

The script prints sanitized JSON only. Secret-like keys and values are redacted,
provider failures are reported as `unavailable`, and missing local data must not
be replaced with fabricated scores.

## Sync vs Async Decision

Option B is the active contract for this refactor. User-triggered scoring
refreshes go through `POST /api/debates/{id}/scoring/jobs`, but that route is a
synchronous transitional refresh rather than a real background worker job: it
runs the scoring refresh inline, persists the resulting scoring output when
available, and returns a terminal `complete` or `failed` response.

`GET /api/debates/{id}/scoring` remains a read path. It reads persisted scoring
output and returns either validated public scoring data or an honest
`unavailable` state with a reason. Normal page loads must not fabricate queued
job progress, placeholder scores, or scaffolded scoring output.

Real async worker scoring is explicitly deferred to a later milestone. That
future milestone may introduce durable queued/running job progress and polling,
but this refactor must not preserve fake async-job theater.
