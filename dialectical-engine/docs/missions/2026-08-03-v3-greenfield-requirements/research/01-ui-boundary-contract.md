RESEARCH HANDOFF COMPLETE

# 01 — V2-UI boundary contract map

Ticket: `wayfinder/issues/01-ui-boundary-contract-map.md`
Scope: read-only inventory of what the V2 UI consumes from the V2 backend.
Reports facts only; no UI-change recommendations (that is ticket 16).

---

## Method

1. Located the UI at `/Users/vladmihaimiron/Documents/DebateAIRO/apps/dialectical-engine/web/` (Next.js App Router, TypeScript, React client components).
2. Traced **from the UI side**: grepped every `fetch(`, `apiFetch`, `EventSource`, and `/api/` literal across `web/app`, `web/components`, `web/lib` (excluding `*.test.mjs` / `*.source-test.mjs`). Every hit resolves to one of three call sites: `web/lib/api.ts` (browser), `web/lib/serverApi.ts` (SSR), and one raw `new EventSource(...)` in `DebatePageClient.tsx`. Two non-`fetch` consumptions exist: an `<a href>` export link and an `EventSource` stream.
3. Cross-checked each against the backend routers in `coordinator/app/api/` (`debates.py`, `nodes.py`, `scoring.py`, `settings.py`, `workers.py`, `jobs.py`, `qbaf.py`, `ops.py`) plus `coordinator/app/main.py` for router mounting, CORS, and the public rate-limit middleware.
4. Resolved response shapes field-by-field against `coordinator/app/services/serialization.py` (`debate_to_dict`, `node_to_dict`), `coordinator/app/argument_claim/model.py`, `coordinator/app/scoring/models.py` (Pydantic response models), `coordinator/app/scoring/verdict.py`, `coordinator/app/scoring/lean.py` — and against the UI's own mirror in `web/lib/types.ts`.
5. Enumerated the SSE event vocabulary by grepping every `event_bus.publish*` / `publish_event` call site in the coordinator, then diffed against the listener list in `DebatePageClient.tsx`.
6. Traced the transport seam: `web/app/api/[...path]/route.ts` (Next catch-all proxy) and `scripts/web_proxy.py` (launchd front door, `deploy/launchd/web.plist`).
7. Confirmed which components are actually mounted by grepping import edges from `DebatePageClient.tsx` outward.

Nothing was executed; no servers were started; no files outside this artifact were written.

---

## Surface inventory

### A. Surfaces the UI actually consumes (14)

| # | Surface | Auth | Request | Response (top level) | Consuming UI file | Cadence |
|---|---|---|---|---|---|---|
| 1 | `GET /api/debates` | none (public read, rate-limited) | `?limit=50&offset=0` defaults; UI sends **no** query params | `{items: DebateSummary[], limit, offset}` — UI reads `items` only | `web/lib/serverApi.ts::listDebatesServer` → `web/app/page.tsx` (SSR, `force-dynamic`) | on-load, every request; 5 s abort timeout (`DIALECTICAL_SERVER_FETCH_TIMEOUT_MS`) |
| 2 | `GET /api/debates/{id}` | none (public read) | — | `DebateDetail` (see §Shapes) | SSR: `serverApi.ts::getDebateServer` → `web/app/debate/[id]/page.tsx`. Client: `lib/api.ts::getDebate` → `DebatePageClient.tsx:439` (`refresh()`) | SSR on-load + client on mount + on **every** stream event that calls `refresh()` (see §C). No timer poll. |
| 3 | `POST /api/debates` | **Bearer user token** | `{topic: string, config: Record<string,unknown>}` | `DebateDetail` (UI reads only `.id`, then routes) | `web/app/new/page.tsx:71`, `web/components/LibraryComposer.tsx:23` | user action |
| 4 | `GET /api/debates/{id}/events` **(SSE)** | none (public read) | `EventSource`, no headers, `replay_history=true` default | `text/event-stream`; see §C | `DebatePageClient.tsx:558` | stream; reconnect backoff `min(30000, 1000 * 2**attempt)`; **not opened at all when the debate is terminal** (`debateTerminal`, line 457/539) |
| 5 | `GET /api/debates/{id}/export.md` | none (public read) | — | `text/plain` + `Content-Disposition: attachment` | `DebatePageClient.tsx:658` (`exportUrl`), rendered as `<a href>` at line 1080 | user action (browser navigation, not `fetch`) |
| 6 | `GET /api/debates/{id}/scoring` | optional Bearer (sent only if present) — UI sends **none** | UI never sends `?force_refresh` | `DebateScoringWithFeedbackResponse` (see §Shapes) | `lib/api.ts::getDebateScoring` → `DebatePageClient.tsx:476` | **on-load, exactly once per debate id.** No poll, no refetch, no invalidation on SSE. |
| 7 | `GET /api/debates/{id}/scoring/adaptive-depth/dry-run` | none | — | `{debate_id, status, reason?, plan{policy, candidate_count, expansion_count, items[]}}` | `DebatePageClient.tsx:501` and `:939` | on-load once per id, plus one refetch after a successful approval |
| 8 | `POST /api/debates/{id}/scoring/adaptive-depth/approvals` | **Bearer** | `{debate_id, selected_node_ids[], approval_reason?}` | `{debate_id, status, selected_node_ids[], queued_node_ids[], unavailable_node_ids[], jobs[], outcomes[]?, audit_record_id, reason?}` | `AdaptiveDepthDryRunPanel` in `DebatePageClient.tsx:912` | user action |
| 9 | `POST /api/debates/{id}/scoring/nodes/{node_id}/feedback` | **Bearer** | `{vote: "up"\|"down"}` | `{debate_id, node_id, vote, current_user_vote, feedback_summary{node_id,up,down}}` | `components/NodeDetailDrawer.tsx` (control) → `DebatePageClient.tsx:960` (call) | user action; response merged into the in-memory scoring payload (`applyFeedbackResponse`, line 316) |
| 10 | `POST /api/nodes/{node_id}/regenerate` | **Bearer** | `{model_id: string \| null}` | `{job_id, status:"queued"}` — UI reads `job_id` type only, uses neither value | `components/NodeDetailDrawer.tsx:150` (mounted); `components/DebateTree.tsx:96` (dormant) | user action |
| 11 | `GET /api/nodes/{node_id}/generations` | **Bearer** | — | `{node_id, items: Generation[]}` | `components/NodeDetailDrawer.tsx:130` (mounted); `components/DebateTree.tsx:111` (dormant) | on drawer open, keyed `[node.id, token]`; silently `[]` on error |
| 12 | `GET /api/settings` | **Bearer** | — | settings payload (see §Shapes) | `web/app/settings/page.tsx:78` (load) **and** `lib/api.ts::validateUserToken` — used as the token-validation probe by `AuthGate.tsx`, `LibraryComposer.tsx`, `DebatePageClient.tsx:525/867` | on-load + on every token unlock attempt |
| 13 | `PUT /api/settings` | **Bearer** | `{routing, model_monthly_caps_usd, grok_monthly_cap_usd?, enabled_models[]}` | same settings payload | `web/app/settings/page.tsx:140` | user action |
| 14 | `GET /api/backends/status` | **none sent** (page is behind `AuthGate`, but the call carries no token) | — | `{v2_generation_readiness{...}, workers: WorkerStatus[]}` — UI reads `workers` only | `lib/api.ts::backendStatus` → `web/app/admin/workers/page.tsx:22` | **`setInterval` poll every 5000 ms** — the only timer poll in the UI |

### B. Backend surfaces the UI never calls

Verified by grepping every `/api/` literal in `web/`.

| Surface | Defined at | Note |
|---|---|---|
| `DELETE /api/debates/{id}` (archive) | `coordinator/app/api/debates.py:114` | no UI affordance at all |
| `POST /api/debates/{id}/scoring/jobs` | `coordinator/app/api/scoring.py:128` | the *only* way to force a fresh judge pass; UI has dead state (`scoringRefreshState`) but no call |
| `GET /api/debates/{id}/scoring/jobs/{job_id}` | `scoring.py:89` | job-status polling exists server-side; UI never polls it |
| `GET /api/debates/{id}/scoring?force_refresh=true` | `scoring.py:210` | query param never sent by the UI |
| `POST /api/debates/{id}/scoring/manual-investigations` | `scoring.py:289` | fully implemented server-side; UI hard-disables the button via `manualInvestigationActionState(action, {runFlowWired: false})` (`NodeDetailDrawer.tsx:441`, `lib/recommendation.ts:63`) |
| `POST /api/qbaf/runs`, `GET /api/qbaf/runs/{id}` | `coordinator/app/api/qbaf.py` | the QBAF attack/support engine is never surfaced to the UI |
| `GET /api/ops/jobs`, `/api/ops/verdict-shadow`, `/api/ops/expansion` | `coordinator/app/api/ops.py` | operator telemetry only |
| `POST /api/workers/register`, `/api/workers/{id}/heartbeat`, `/api/workers/{id}/poll` | `coordinator/app/api/workers.py` | worker-plane |
| `POST /api/jobs/{id}/stream`, `/complete`, `/fail` | `coordinator/app/api/jobs.py` | worker-plane |
| `GET /healthz` | `coordinator/app/main.py:156` | not consumed by UI |

### C. SSE channel — event vocabulary (emitted vs consumed)

One channel: `GET /api/debates/{id}/events`. Frame format `event: <name>\ndata: <json>\n\n` (`coordinator/app/services/events.py:17`). Bus is **in-memory**, `maxlen=200` per debate, replays history on subscribe, `: heartbeat` comment every 15 s idle.

**Consumed by `DebatePageClient.tsx` (12 named + 2 lifecycle handlers):**

| Event | Payload the UI reads | UI effect |
|---|---|---|
| `onopen` (implicit `connected` frame) | — | `attempt=0`, `streamState="live"`, `setError(null)`, `refresh()` |
| `snapshot` | ignored (payload discarded) | `refresh()` — W5b restart recovery |
| `tree_ready` | ignored (carries the **whole serialized debate**, thrown away) | `refresh()` |
| `node_started` | `node_id, model_id, worker_id, role` | seeds a synthetic streaming `active_generation` on that node |
| `node_token` | `node_id, delta` | appends `delta` onto that node's `active_generation.argument` |
| `node_complete` | ignored | `refresh()` |
| `node_failed` | `terminal?: boolean` | `setError("Claim generation failed")`; if `terminal===true`, `refresh()` |
| `node_retrying` | ignored | `setError(null)` + `refresh()` |
| `synthesis_started` | `model_id, worker_id` | opens a synthesis draft |
| `synthesis_token` | `delta` | appends onto `synthesisDraft.raw` |
| `synthesis_complete` | ignored | clears draft + `refresh()` |
| `debate_complete` | ignored | clears draft, `setError(null)`, `refresh()` |
| `debate_failed` | `terminal?: boolean` | `setError("Debate generation failed")` only when terminal |
| `onerror` | — | `close()`, `refresh()`, schedule reconnect |

**Emitted by the coordinator but ignored by the UI (18+):**
`artifact_started`, `artifact_token` (all `v2_*` job streaming — `orchestrator.py:1319/1378`), `dialectical_exploration` (lifecycle decision provenance — `orchestrator.py:1515`, `scoring_completion_lifecycle.py:356`), `evidence_unavailable` (`orchestrator.py:1758`), `cross_exam_unavailable` (`orchestrator.py:1793`), `expand_completed` (`dialectical_v2.py:3235`), `synthesis_completed` (v2 variant, `dialectical_v2.py:2639` — note the UI listens for `synthesis_complete`, singular-past, which only the v1 path emits), `analyzer_started`, `analyzer_completed`, `agent_run_created`, `agent_output_completed`, `skill_created`, `agent_created`, `skill_reused`, `agent_reused`, `skill_{reason}`, `agent_{reason}`, `{job_type}_queued`.

Consequence of note: for **v2 debates the token-level stream is `artifact_token`, which the UI does not listen to** — live per-node prose streaming only lands via the v1 `node_token` path.

### D. Transport seams (two, mutually exclusive)

- **Next catch-all proxy** — `web/app/api/[...path]/route.ts`. `API_BASE = process.env.NEXT_PUBLIC_API_BASE || ""` (`lib/api.ts:14`), and `NEXT_PUBLIC_API_BASE` is set nowhere in `deploy/` or `web/package.json`, so browser calls are same-origin `/api/...`. If Next is the front door, this handler forwards to `DIALECTICAL_COORDINATOR_URL` (default `http://127.0.0.1:8000`), streams the body back verbatim, and adds one side effect: `recordSuspiciousScoringProxyResponse` (line 110) clones and inspects `GET /api/debates/{id}/scoring` responses.
- **`scripts/web_proxy.py`** — the launchd front door (`deploy/launchd/web.plist:17`). `DEFAULT_COORDINATOR_PREFIXES = ("/api/", "/healthz", "/openapi.json", "/docs", "/redoc")` routes `/api/*` **straight to the coordinator**, bypassing the Next route handler (and therefore its suspicious-scoring hook) entirely.
- SSR (`serverApi.ts`) always calls the coordinator directly at `DIALECTICAL_COORDINATOR_URL`, never through either proxy.
- CORS on the coordinator allows `settings.web_origin`, `http://localhost:3000`, `http://127.0.0.1:3000` (`main.py:88`).
- **Rate limit**: public GET paths (`/api/debates`, `/api/backends/status`, `/api/debates/{id}`, `.../events`, `.../export.md`, `.../scoring`) are IP-bucketed per 60 s window; over-limit returns `429 {"detail":"Rate limit exceeded"}` (`main.py:121-153`). Every one of those is a UI-consumed surface, and the UI has **no** 429-specific handling — `apiFetch` throws the body text as a generic `Error`.

---

## Shapes in detail

### 1. `DebateDetail` — `GET /api/debates/{id}` (the load-bearing shape)

Server truth: `coordinator/app/services/serialization.py::debate_to_dict` (line 753). UI mirror: `web/lib/types.ts:686`.

```
id, topic, status, config, direct_answer(null), root_node_id, synthesis_id,
created_at, completed_at,
tree: DebateNode | null,
synthesis: {id, debate_id, strongest_pro, strongest_con, verdict,
            verdict_gate{state, reason, verdictBand},
            upstream_agent_output_ids[], upstream_agent_run_ids[],
            analyzer_findings{}, provenance{}, model_id, worker_id,
            worker_name, created_at} | null,
active_synthesis: {id:"stream:<job>", job_id, debate_id, model_id, worker_id,
                   worker_name, created_at, raw, is_streaming} | null,
branch_lineage: DebateBranch[],
analyzer_runs: AnalyzerRun[],
verdict: VerdictSummary,
lean: {source:"dialectical"|"structural", pct, label} | null,
selected_skills[], selected_agents[], agent_outputs[], agent_runs[],
skills_used: string[], provenance_records: ProvenanceRecord[],
workers: string[], models: string[], node_count: int,
evidencePresence: string,            # served, NOT in the FE type
lifecycleDecisions: LifecycleDecision[],
completion: {state, reasonCode, humanReason},
derivation?: {claimType, markers[], lensSet[], source?}   # only for dynamic-perspective debates
```

Wire/type mismatches found:
- **`evidencePresence`** is served (`serialization.py:924`) and is absent from `DebateDetail` in `types.ts`. Not read anywhere.
- **`derivation.source`** is served (`serialization.py:944`) and absent from the FE `DebateDerivation` type.
- **`DebateDetail.scoring?: DebateScoreSummary | null`** exists in `types.ts:697` but `debate_to_dict` **never emits a `scoring` key**. Dead FE slot.
- `analyzer_findings`, `provenance_records`, `branch_lineage`, `skills_used`, `agent_outputs`, `selected_skills`/`selected_agents` (only `.length` is read, as a boolean for the Workspace button) are typed and served but **rendered nowhere**.

### 2. `DebateNode` (the `tree`)

Server truth: `serialization.py::node_to_dict` (line 310) = `ArgumentClaim.to_node_payload` (`argument_claim/model.py:32`) plus additive keys.

```
id, debate_id, parent_id, node_type, depth, position, claim, status,
materialized_path, active_generation_id,
label: string|null,                 # only for node_type ending "_POV", and only
                                    # when the claim text differs from the legacy
                                    # curated POV label (serialization.py:263)
argument_claim: {…same fields, "claim" renamed to "text"},   # served, NOT in FE type
path_status, stopping_status, stopping_reason,
stopping_reason_human: string|null,
active_generation: Generation | null,
children: DebateNode[],
evidence_state: "extracted"          # only when node_type === "EVIDENCE"; NOT in FE type
evidence_independence?: {distinct_source_count:int, pairs:[[domain|null, method|null], …]}
```

Wire/type mismatches:
- **`DebateNode.lens?: string|null`** is declared in `types.ts:61` and preferred by `branchLabelOf` — but the backend **never emits `lens`**. Dead slot.
- **`DebateNode.score?: NodeScore|null`** (`types.ts:80`) is likewise never emitted; scoring is a separate endpoint joined client-side by `node_id` (`indexScoringResponse`, `lib/scoringResponse.ts:192`).
- `argument_claim` and `evidence_state` are served but undeclared and unread.

Node status vocabulary on the wire: `pending | generating | complete | failed | stale` (`stale` nodes are filtered out of the tree query, `serialization.py:757`). Independently: `path_status` (`active | abandoned`), `stopping_status` (`active | stop | abandon`). The UI's `renderStateOf` (`lib/debatePresentation.ts:109`) collapses these to `root | failed | abandoned | pending | streaming | empty | done`.

### 3. `DebateScoringResponse` — `GET /api/debates/{id}/scoring`

Server truth: `coordinator/app/scoring/models.py:429` + `DebateScoringWithFeedbackResponse` (`api/scoring.py:70`), served with `response_model_exclude_none=True` (so null-valued optionals vanish from the wire). UI mirror: `types.ts:320`.

```
debate_id, status: "available"|"partial"|"unavailable",
node_ids: string[], items: NodeScoringPayload[],
errors?: [{node_id, status:"unavailable"|"no_independent_judge", reason}],
pending?: [{node_id, status:"pending", reason}],
max_nodes?, scored_node_count?, skipped_node_count?, truncated?,
generated_at?, reason?, producer?,
model_metadata?: {provider, model, checked_at, status},
cache?: {hit: bool, stale?: {reason:"input_hash_mismatch", refresh_available}},
active_scoring_job_id?, active_scoring_job_status?: "queued"|"running"|"complete"|"failed",
feedback_summary?: [{node_id, up, down}],
current_user_votes?: [{node_id, vote}]
```

`NodeScoringPayload` (`models.py:392`):

```
node_id,
claim: {node_id, raw_text, core_claim, claim_type(8-member enum), scope{population,
        timeframe, geography, domain}, implied_assumptions[], evidence_refs[],
        ambiguity_flags[], key_terms[]},
scores: {strength, uncertainty, impact, evidence_quality, relevance,
         logical_validity, assumption_risk, counter_resilience}   # 8 floats, 0..1 validated
labels: {strength_label, uncertainty_label, impact_label},
holes: [{type, severity, description, source}],
fatal_flags: [{type, severity, description}],
score_caps: [{score, cap_value, reason, triggered_by}],
judge_disagreements: [{judges[], type, severity, description}],
recommended_investigations: [{action(5-member enum), reason, priority 1..5, target_node_id?}],
rationale: {short, why_not_higher, why_not_lower, weakest_link},
score_provenance: {raw_judge_output_kind, raw_judge_output_included:false,
                   final_score_source, reducer_version, rubric_version}   # extra="allow"
debug?: {reducer_version, rubric_version, judge_outputs?},
uncertainty_drivers: [{code(7-member enum), label}],
uncertainty_source: "dispersion"|"heuristic",
strength_kind: "argument_only"|"evidence_weighted"
```

**`score_provenance` is served on every item and is entirely absent from the FE type and from every component.** It is the only wire field with `extra="allow"` (i.e. an open, additive schema) already flowing to the browser.

Rendered vs. served, per item:
- Rendered: `scores.{strength,uncertainty,impact}` + `labels.*` (canvas badges, `DebateCanvas.tsx:470-501`), `uncertainty_drivers`/`uncertainty_source`/`strength_kind` (pill copy, `:474-475`), `holes` + `fatal_flags` (drawer list + debate-level issue strip), `rationale.short` (drawer), `recommended_investigations` (top + additional, drawer & `RecommendedInvestigations`).
- **Served but never rendered by any mounted component:** `score_caps`, `judge_disagreements`, `debug`/`judge_outputs`, `score_provenance`, `claim.{implied_assumptions, evidence_refs, ambiguity_flags, key_terms, scope, claim_type, raw_text}`, `rationale.{why_not_higher, why_not_lower, weakest_link}`, `pending[]` (indexed into a map that nothing consumes), `max_nodes`.

### 4. `VerdictSummary` — `DebateDetail.verdict`

Server truth: `coordinator/app/scoring/verdict.py::verdict_summary`. Consumer: `components/VerdictBanner.tsx`, **flag-gated behind `NEXT_PUBLIC_VERDICT_FIRST_UI === "true"`** (`DebatePageClient.tsx:1093`).

```
verdictBand: "supported"|"contested"|"unsupported"|"unavailable"|"insufficient_scoring"|"suppressed",
claimLanguage: string,
basis: {dialecticalStrength: number|null, verificationStatus: string|null,
        convergence: object|null, preGateVerdictBand?, semanticsVersion?,
        tauCoverage?, tauSourceMajority?: "judge_strength"|"default"},
verdictThresholdsVersion: string,
verdictState?: "endorsed"|"endorsed_with_caveat"|"suppressed_no_evidence",
evidencePresence?: "none"|"extracted_unresolved",
suppressionReason?: {code:"no_evidence", claimType:"empirical",
                     claimTypeSource, detail, unlock: string[]} | null,
caveats?: [{code:"evidence_unverified"|"claim_type_unknown", detail}],
evidenceGateShadow?: {wouldSuppress, reason, claimType, claimTypeSource}
```

The banner maps `verdictBand` through a hardcoded 6-entry label table and **falls back to rendering the raw band string verbatim** for unknown values (`VerdictBanner.tsx:34`). `caveats` are rendered through a hardcoded two-branch `if` on `caveat.code` — an unknown code renders **nothing** (line 76). `suppressionReason.detail` and `caveats[].detail` are served but never displayed (the UI substitutes its own constant copy).

### 5. Adaptive-depth dry-run and approval

Dry-run response (`api/scoring.py:358`, item model `models.py:129`):
```
{debate_id, status, reason?, plan: {policy{mode, target_depth?, reason?},
 candidate_count, expansion_count,
 items: [{node_id, pressure:"low"|"medium"|"high", score(0..1),
          recommended_action: 5-member enum|null,
          expansion_hint: "expand"|"review_for_expansion",
          reasons: string[], hole_count, recommended_investigation_count}]}}
```
Approval response has three distinct honest shapes depending on the `DIALECTICAL_ADAPTIVE_EXPANSION` flag: `status:"recorded"` (flag off — HTTP 200, nothing queued), `"queued"`/`"partial"` (flag on — HTTP 202, real `v2_expand` jobs), `"unavailable"` (HTTP 200). The UI switches on all three (`DebatePageClient.tsx:921-936`) and caps at `MAX_ADAPTIVE_DEPTH_APPROVAL_EXPANSIONS = 3` server-side. `outcomes[].reason_human` is served on the flag-on refusal path (`api/scoring.py:500`) and is not in the FE type.

### 6. Settings and workers

`GET/PUT /api/settings` → `{routing, configured_models[], enabled_models[], grok_monthly_cap_usd, grok_monthly_spend_usd, grok_pricing_usd_per_million_tokens{}, model_monthly_caps_usd{}, model_monthly_spend_usd{}, model_pricing_usd_per_million_tokens{}}`. The UI's local `SettingsPayload` type (`app/settings/page.tsx:8`) declares only 6 of those 9 keys; the two pricing tables are served and ignored.

`GET /api/backends/status` → `{v2_generation_readiness: {...}, workers: [{id, name, capabilities[], last_seen, status, current_job_id}]}`. `v2_generation_readiness` is served and **discarded by `lib/api.ts:123`** before any component sees it. Note this endpoint has a write side effect: it marks stale workers offline and requeues their jobs.

### 7. Implied state machine

**Debate level.** Wire statuses: `generating | complete | failed | archived`. `archived` is never observed by the UI (all debate reads 404 on it). `effective_debate_status` (`serialization.py:129`) derives `failed` from "a non-scoring job terminally failed and none remain active", and `complete` from "synthesis exists AND no node is pending/generating AND no active non-scoring job".

UI-side derivation:
- `complete = isComplete(status)` → `complete|completed|done` (`lib/format.ts:29`).
- `generating = !complete && status !== "failed"`.
- `debateTerminal = complete || status === "failed"` → **gates the entire SSE effect**: once terminal, no stream is opened and no further refresh ever happens without a reload.
- SSR outcome is a three-way discriminated result (`serverApi.ts:82`): `ok` → render; `not_found` (HTTP 404 only) → terminal error screen; **everything else, including timeouts and 5xx → `pending`**, which renders "Connecting to the coordinator…" and relies on the client to recover. The fatal dead-end gate is `error && !debate` (`DebatePageClient.tsx:981`), seeded only by a definitive error.
- Stream state machine: `connecting → live` on open; `→ reconnecting(retryInMs)` on error with exponential backoff capped at 30 s; any successful open resets `attempt` and clears the error banner.

**Scoring level.** Two overlapping state machines that never talk to each other:
- Client async state: `idle → loading → loaded | unavailable | error` (fetched once).
- Server job state on the payload: `active_scoring_job_status ∈ queued|running|complete|failed`. `formatScoringVisibilityState` (`lib/scoringResponse.ts:220`) folds both plus free-text `reason` sniffing into 6 buckets: `off | empty | provider_required | unavailable | refreshing | scores`. Because the UI never re-fetches scoring, a payload observed with `active_scoring_job_status:"running"` stays in the "Scoring in progress" bucket **permanently** for that page view.
- `ScoringRefreshState` (`idle | starting | error`) is declared, threaded through visibility copy and the diagnostics drawer, and **never leaves `idle`** — no code path calls the scoring-job endpoints.

**Node level.** `pending → generating → complete | failed`, with `stale` as the invisible-abandoned marker (filtered server-side) and `path_status: abandoned` / `stopping_status: stop|abandon` as the preserved-but-set-aside marker the drawer renders as "Stopped path".

**Auth.** A single opaque user token in `localStorage["dialectical:userToken"]`, validated by probing `GET /api/settings`. Two independent gates: `AuthGate` (blocking, for `/new`, `/settings`, `/admin/workers`) and the non-blocking "Unlock actions" dock on the debate page. A 401/403 in a mutation is detected by **substring-matching the error message** for `"401"`, `"403"`, `"invalid user token"` (`DebatePageClient.tsx:353`, `NodeDetailDrawer.tsx:28`), which then clears the stored token.

---

## Battery-output landing map

For each battery output family: where it could land in today's shapes, or plainly no place.

### Provenance tags
**Partial landing places exist; none reach a pixel.**
- `items[].score_provenance` (`models.py:346`) is the single **open-schema** field on the wire (`extra="allow"`) and already ships on every scored node. It is absent from `types.ts` and read by nothing.
- `items[].debug.judge_outputs` (`Record<string,unknown>|null`) — typed on both sides, rendered nowhere.
- `DebateDetail.provenance_records[]` with `metadata: Record<string,unknown>` — typed, served, rendered nowhere.
- `synthesis.provenance`, `analyzer_runs[].provenance`, `agent_runs[].provenance` are free-form maps; only `model_id`/`worker_id`/`prompt_id` are read, by `provenanceLabel` (`DebateWorkspaceDrawer.tsx:5`).
- **Per-node in the tree there is no provenance slot at all.** A `DebateNode` carries only `active_generation.{model_id, worker_id, worker_name}` — who generated the prose, not where the claim's warrant came from.
- The one existing provenance *display* is the Scoring Diagnostics drawer, whose rows are a hardcoded 16-entry array (`DebatePageClient.tsx:1553`); it already renders two literal `"Not exposed by scoring API"` placeholders.

### Five typed abstentions
**No landing place for a five-member typed abstention.** Absence is expressed today by three incompatible closed vocabularies, none of which is extensible without a type change on both sides:
- Per node: `errors[].status ∈ {"unavailable","no_independent_judge"}` (2 members, pinned in `models.py:419` **and** `types.ts:285`) and `pending[].status ∈ {"pending"}` (1 member). Reason text is free-form but is only ever displayed as a raw string in the drawer's "Scoring unavailable" section.
- Per debate: `DebateScoringResponse.status ∈ {available, partial, unavailable}` plus free-text `reason`, which the UI **string-sniffs** (`looksProviderOrTokenRequired` matches on "provider"/"model"/"token"/"credential"/"auth"/"api key"; `isMissingJudgeOutputReason` compares against one exact lowercase sentence — `lib/scoringResponse.ts:164-178`).
- Per verdict: `verdictBand` already contains three abstention-shaped members (`unavailable`, `insufficient_scoring`, `suppressed`) and `verdictState` contains `suppressed_no_evidence`. This is the **only** place a new abstention kind degrades gracefully: `VerdictBanner` renders an unknown band's raw string rather than crashing. But it is debate-scoped, not per-node.
- Everything ultimately funnels into `ScoringVisibilityKind`, a 6-member closed union in `lib/scoringResponse.ts:77`.

### Defeaters
**No place to land as a first-class relation.** The nearest carriers are all node-local lists with no target pointer:
- `fatal_flags[] {type, severity, description}` — `type` is a free string, rendered.
- `holes[] {type, severity, description, source}` — rendered.
- `judge_disagreements[] {judges[], type, severity, description}` — served, **never rendered**.
- `score_caps[] {score, cap_value, reason, triggered_by}` — served, **never rendered**; `triggered_by` is the only free-string "what caused this" field on the wire.
- The **only** cross-node pointer anywhere in a scoring payload is `recommended_investigations[].target_node_id` (`models.py:313`), which the UI does resolve and focus (`focusRecommendationNode`, `DebatePageClient.tsx:849`).
- The tree itself carries only hierarchy: `parent_id`, `children[]`, `materialized_path`. "Attack" is expressed structurally as a `CON` child, not as a labeled defeat edge. The coordinator's actual attack/support graph lives in `coordinator/app/qbaf/` and is **never served to the UI** — `/api/qbaf/*` is uncalled, and `debate_to_dict` emits no edges.

### Ways-of-knowing labels
**Partial landing places, all repurposed from something else.**
- `DebateNode.node_type` is an **open** union in the FE (`LegacyNodeType | (string & {})`, `types.ts:48`) — arbitrary backend strings render, via `lensLabelFromNodeType`'s de-underscore/title-case fallback. But the backend deliberately keeps emitting legacy `*_POV` node_types even for dynamic lenses (`serialization.py:264`), so `node_type` is *not* a free label channel in practice.
- **`DebateNode.label` is the one open, backend-controlled, stranger-readable per-branch naming slot that exists and is honored today** (`branchLabelOf`, `debatePresentation.ts:88`). Constraint: the backend only emits it for node_types ending in `_POV`, i.e. lens/branch nodes — never for `PRO`/`CON`/`EVIDENCE`/`ROOT_CLAIM`.
- `DebateNode.lens` is declared in the FE type and preferred over `label` — but is **never emitted**. A dead slot the backend could start filling with zero FE change.
- `DebateDetail.derivation {claimType, markers[], lensSet[], source?}` is a debate-level way-of-knowing record that is served and **rendered nowhere**.
- `items[].claim.claim_type` is a closed 8-member enum (`empirical|causal|normative|definitional|prediction|comparative|mixed|unknown`), served per scored node, rendered nowhere.
- `evidence_independence.pairs[] = [source_domain, method]` — `method` (e.g. `"model-claim"`) is the closest existing *method-of-knowing* tag on the wire. The canvas renders only a derived count pill from it (`formatIndependencePill`, `DebateCanvas.tsx:231`).

### Per-node stranger-readable text
**Room exists; three slots are already read.**
- Read today: `claim` (card + drawer title), `active_generation.argument` (drawer prose, canvas body), `stopping_reason_human` (drawer "set aside because:", `NodeDetailDrawer.tsx:116`), `items[].rationale.short` (drawer "Scoring rationale", `:470`), `lifecycleDecisions[].reason` (humanized server-side, rendered through `pathDecisionCopy`, `:64`).
- Served but unread: `rationale.why_not_higher`, `why_not_lower`, `weakest_link`; `claim.raw_text`; `holes[].description` and `fatal_flags[].description` are read but only ever surfaced in a `title=` tooltip at debate level.
- **The canvas card itself has no long-form text slot** — it shows role badge, `claim`, numeric badges, and pills. Per-node stranger-readable prose has exactly two homes: the node's own `claim`/`argument`, and the drawer (which the user must open).
- The humanization convention already exists server-side and is the model to follow: `coordinator/app/exploration/reason_copy.py::humanize_reason` produces `stopping_reason_human` and `lifecycleDecisions[].reason`, and the FE is instructed to fall back to the raw code when absent.

### Value-weight markers
**No place to land.**
- `NodeScores` is a **closed 8-key float record**, pinned identically in `models.py:242` (with 0..1 field validators) and `types.ts:145`. There is no companion structure naming *which value* a weight expresses, or why.
- `score_caps[] {score, cap_value, reason, triggered_by}` is the only field family that names *why a number moved* — served, never rendered.
- `ScoreProvenance`'s `extra="allow"` means a weight-provenance blob could ride to the browser without any Pydantic change, but the FE type does not declare it and no component reads it.
- `DebateLean {source: "dialectical"|"structural", pct, label}` is the only debate-level "which way and by how much" marker; `source` is a closed 2-member union and the UI has a hardcoded 2-entry tooltip table (`SynthesisPanel.tsx:20`).
- `SynthesisPanel` renders exactly four `provenance` sections by hardcoded key (`agreements`, `tensions`, `evidence_gaps`, `key_takeaways` — `DebatePageClient.tsx:667-672`); any other key in `synthesis.provenance` is silently dropped.

### Summary of the landing map

| Battery output | Landing place today |
|---|---|
| Provenance tags | `items[].score_provenance` (open schema, on the wire, unread) + `provenance_records[].metadata`; **nothing per tree node** |
| Five typed abstentions | **None** — three incompatible closed vocabularies (2/1/3 members) + free-text string-sniffing |
| Defeaters | **None as a relation** — only node-local `fatal_flags`/`holes`/`judge_disagreements`; the QBAF attack graph is never served |
| Ways-of-knowing labels | Partial: `node_type` (open union), `label` (POV nodes only), dead `lens` slot, unrendered `derivation`/`claim_type`, `evidence_independence.pairs[].method` |
| Per-node stranger-readable text | Yes: `stopping_reason_human`, `rationale.short`, `lifecycleDecisions[].reason` are already read; card has no long-form slot |
| Value-weight markers | **None** — `NodeScores` is a closed 8-float record; only `score_caps` names causation and it is unrendered |

---

## Gaps and uncertainties

**Files/questions I could not fully resolve:**

1. **Which transport is live on V's machine.** Both `web/app/api/[...path]/route.ts` and `scripts/web_proxy.py` are wired and mutually exclusive for `/api/*`. `deploy/launchd/web.plist:17` runs `web_proxy.py`, which would bypass the Next handler's `recordSuspiciousScoringProxyResponse` hook. I did not run either process, so I cannot confirm which path is exercised in practice.

2. **`NEXT_PUBLIC_VERDICT_FIRST_UI` default.** `VerdictBanner`, the synthesis `verdictGate` line, and the low-strength canvas dimming are all gated on this string being `"true"`. I found no default set in `deploy/`, `web/package.json`, `web/next.config.mjs`, or any launchd plist. The verdict banner may be dark in the current deployment. Unresolved.

3. **Dormant components.** `web/components/DebateTree.tsx` is imported only by `web/components/ArgumentFocusView.tsx`, which nothing imports; `web/components/DebateOutline.tsx` is imported by nothing. Both still contain live calls (`regenerateNode`, `nodeGenerations`) and both still have `.source-test.mjs` guards. I verified this by static import grep only — a dynamic `import()` would not appear, though I found none. Treat as dormant, not proven dead.

4. **`web/lib/api.ts::listDebates`** (client-side debate list) is exported with **no consumer**. The library page uses the SSR variant. Unclear whether it is vestigial or a deliberate spare.

5. **`v2_generation_readiness`** is returned by `GET /api/backends/status` and thrown away inside `lib/api.ts:123` before any component can see it. I read `coordinator/app/api/workers.py` for the call site but did not chase `v2_generation_readiness`'s own dataclass shape, since no UI code can reach it.

6. **`GET /api/debates` pagination.** The backend accepts `limit` (1..100, default 50) and `offset`; the UI sends neither and reads neither from the response. A debate library beyond 50 entries is silently truncated. I did not verify runtime behaviour.

7. **Scoring liveness.** The code path shows scoring is fetched exactly once per debate id with no SSE invalidation and no timer. I read this statically and did not observe a live run, so I cannot rule out an incidental refetch via React remount that I did not trace.

8. **`/api/ops/*` and `/api/qbaf/*` response shapes** were not enumerated field-by-field — the UI provably never calls them (verified by grepping every `/api/` literal under `web/`), so they are outside the consumed contract.

9. **Contract guards.** `web/` contains **50** `.mjs` test files, **35** of them `*.source-test.mjs` that assert against UI *source text* (e.g. `sseFailureSafety`, `scoringTreePrimary`, `manualInvestigationDisabled`, `VerdictBanner.suppression`). Any flex of the UI contract will trip a substantial subset. I inventoried them by filename only; I did not read their assertions, so I cannot yet say which specific ones pin which wire fields.

10. **`worker/`** was not traced. No UI code reaches it; the worker-plane endpoints in the inventory come from the coordinator routers alone.
