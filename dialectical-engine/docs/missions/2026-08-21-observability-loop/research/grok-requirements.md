# grok — Observability requirements (2026-08-21-observability-loop)

## Verdict summary

The current algorithm version has no production error store. Unhandled faults in `api`, `runner`, `scheduler`, `replay`, and `ui` die at process/framework defaults: Fastify logging is off, no Node `uncaughtException`/`unhandledRejection` handlers exist, and the UI has no `error.tsx`. `packages/liveness` covers question/node staleness, not process or queue failure. Capture must be process-wide, redacted, isolated from the hot path, and written to append-only Postgres with a local fallback when the database itself is the failing component. The listener must not be a standing LLM: a durable outbox plus LISTEN/NOTIFY wake plus poll fallback is the only missed-event-safe trigger on the existing Postgres; the model is spawned per event under DR-179 CLI-relay. QUICK-FIX is bounded first by the spine §9 high-risk floor (always escalate), then by files/lines and RED→GREEN proof; 2026 auto-fix products open PRs and require review — they do not auto-merge to main. Capture excluded-zone errors at the API boundary only; never instrument or auto-fix inside migrations `0030`–`0033`, `apps/api/src/registration.ts`, or the accounts-mission S-series.

## RQ-A

### A1. Failure-surface inventory (where errors go today)

No runtime registers `process.on("uncaughtException")` or `process.on("unhandledRejection")` (repo-wide grep of `apps/**` and `packages/**` returned no matches). Node's default for those events is therefore the current last resort: stderr plus process abort. That is the unhandled path for every long-lived process below.

| Runtime | Thrown / caught / swallowed today | Unhandled destination now | Evidence |
|---|---|---|---|
| `api` | Fastify `setErrorHandler` maps `MalformedRequestError`/`SyntaxError` → 400, `AuthFlowError` → its status, `AskRefusal` → 422, else 500 `{ error: "INTERNAL_ERROR" }`. Streaming responses already sent destroy the socket instead of writing a second envelope. `Fastify({ logger: false })`. | Handler if a route throws before headers; otherwise Node default. 5xx is returned to the client and not persisted. | `apps/api/src/index.ts:143`, `158-190`; start `apps/api/src/main.ts:120` (`api.listen`) |
| `runner` | Hatchet task wrapper records `core.work_item` `FAILED` then **rethrows**. Provider transport failures become `COOLDOWN_HOLD` / `ledger.could_not_do` rather than process death. Parse/schema failures become `TypedDomainError`. | If `recordTerminalFailure` itself fails → `RUNNER_FAILURE_STATE_NOT_RECORDED` thrown. Uncaught outside the task fn → Node default. Hatchet retries are register-supplied (`HATCHET_ENGINE_RETRIES`). | `apps/runner/src/index.ts:2488-2522`, `190-255`, `862-904`; start `apps/runner/src/main.ts:42-47` |
| `scheduler` | One-shot CLI jobs (`job:liveness-sweep`, `job:replay-self-test`, `job:settlement-watch`). Unknown command throws. `runReaper` is scaffold-only and always throws. | Uncaught throw aborts the CLI process (no handler). Not a daemon. | `apps/scheduler/src/cli.ts:6-23`; `apps/scheduler/src/index.ts:87-89`; `package.json` scripts `job:liveness-sweep` |
| `evaluator-worker` | Library of task functions, not a standing process (`package.json` exports `./src/index.ts` only). Receipt-store outage swallowed. Harvest per-run catch records `TERMINAL_HARVEST_FAILED` without the original error. Metering catch returns zeros. After `HARVEST_MAX_CONSECUTIVE_FAILURES = 3`, harvests are skipped. | Errors propagate to whoever invokes the functions (tests today; a future worker would see Node default). Consecutive-failure skip is a silent dead-letter. | `apps/evaluator-worker/src/index.ts:145-147`, `160-162`, `244-251`, `261-269`; `packages/evaluator/src/harvest-constants.ts:2` |
| `replay` | One-shot ceremony CLI. Attestation/shape errors throw `TypeError`. Non-exact replay sets `process.exitCode = 1`. | Uncaught throw aborts the CLI. | `apps/replay/src/cli.ts:6-18`; `apps/replay/src/index.ts:17-25` |
| `ui` server | Next.js 15 App Router. Proxy `fetch` rejection → 502 `API_UPSTREAM_UNREACHABLE` with the original error discarded. Missing `DIALECTICAL_API_BASE` throws. No `app/error.tsx` / `global-error.tsx`. | Next.js default error page / overlay. Unhandled server exceptions are not persisted. | `apps/ui/app/api/[...path]/route.ts:10-12`, `51-59`; `apps/ui/lib/serverApi.ts:16-21`, `62-96`; `apps/ui/app/layout.tsx:32-39` |
| `ui` client | `ScoringErrorBoundary` sets `hasError` and renders "Scoring UI unavailable" with **no `componentDidCatch` log**. Inspection failures become local React state. No `window.onerror` / `unhandledrejection` reporter. | React error boundary (scoring subtree only) or a white-screen for everything else. | `apps/ui/components/ScoringErrorBoundary.tsx:21-33`; `apps/ui/app/debate/[id]/DebatePageClient.tsx:699-701` |

**Packages (not processes):** `packages/db` wraps pool failures as `DATABASE_POOL_FAILED` and `console.error`s idle-client errors (`packages/db/src/index.ts:14-17`, `69-71`). `packages/providers` times out via `AbortSignal.timeout` and records `TIMED_OUT`/`FAILED` ledger rows (`packages/providers/src/index.ts:227`, `348-385`). `packages/kernel` `TypedDomainError` stores `code` + `message` and does **not** wrap `cause` (`packages/kernel/src/index.ts:283-288`). `packages/graph` converts DB errors to `EDGE_INTEGRITY_ERROR` with message only (`packages/graph/src/index.ts:328-331`). `packages/crypto` collapses decrypt/load failures to typed crypto errors without cause (`packages/crypto/src/index.ts:165-168`, `182-185`).

**Excluded-zone boundary (map only, no instrumentation, no fix):** `apps/api/src/registration.ts` contains multiple empty `.catch(() => { ... })` paths (e.g. `531-534`, `701`, `740`, `879`, `938`, `953`). `delivery_error` lives in `migrations/0031_registration_verification.sql:28` and `packages/db/src/schema.ts:67`. Commit `6e58adc` marks S3b/S3c/S3d KNOWN-DEFECTIVE. These paths are out of scope for capture-inside and for the loop agent.

**OBS-GROK-R01.** Every long-lived process (`api`, `runner`, and any future standing `evaluator-worker`/`scheduler` daemon) SHALL install process-level unhandled-error capture. One-shot CLIs (`scheduler` jobs, `replay` ceremony) SHALL capture before exit. Confidence: HIGH. Counter: a process handler that itself deadlocks the event loop is worse than today's crash-and-restart; isolation (R21) is mandatory.

**OBS-GROK-R02.** Route-, job-, and provider-level typed failures that today become HTTP 5xx, `work_item.FAILED`, or `ledger.could_not_do` SHALL also emit an error event. Returning a typed product envelope is not a substitute for capture. Confidence: HIGH. Counter: capturing every 4xx/AskRefusal will flood the store; client-fault classes are a different severity (A5) and MUST be rate-limited, not omitted.

### A2. What the rework dropped

Trail (do not rediscover): `docs/missions/2026-08-06-v3-programming/logs/LOAD-01-codex.log:1409-1410` and `:1494-1495` (repeat at `:6823-6824`, `:6908-6909`) record deletion of `apps/v2-ui/lib/observability/logger.contract.test.mjs` and `logger.test.mjs`, then untracked re-add as `.disabled`. The surviving tree is `apps/ui/lib/observability/` (`logger.ts`, `suspiciousScoring.ts`, `README.md`, disabled tests). `git ls-files '*observability*'` is empty and `git status` shows `?? apps/ui/lib/observability/` — the remnant is **on disk and untracked**, not in HEAD.

Signals that existed in the disabled tests / logger contract and are absent as a production capability now:

1. Forced JSONL event records with `timestamp`, `level`, `event`, `source`, `message`, `requestId`, `debateId` (`apps/ui/lib/observability/logger.test.mjs.disabled:65-87`).
2. `suspicious` category as a queryable warning (`logger.contract.test.mjs.disabled:65-89`).
3. `rootHint` (`suspectedLayer`, `upstreamEventId`, `notes`) for layered blame (`logger.ts:8-22`, contract test `:74-89`).
4. Capture-time redaction of keys/values (`token`, `prompt`, `providerPayload`, `api_key`, bearer) (`logger.ts:83-86`, `88-154`; contract test `:108-112`).
5. Fail-open isolation (`logger.ts:241-243`: empty `catch` so logging never interrupts product flow).
6. README prohibition on DB persistence / log tables / user-facing exposure for **those** diagnostics (`apps/ui/lib/observability/README.md:18`).

`recordSuspiciousScoringResponse` (`apps/ui/lib/scoringResponse.ts:213-218`) is exported and **never called** from any other file. `developerLogger` is not imported outside `apps/ui/lib/observability/`. The remnant is dead code plus a redaction library.

**OBS-GROK-R03.** The NEW layer SHALL restore the dropped signals (structured event, correlation ids, root hint, redaction, fail-open) as production requirements, not as a revival of the untracked JSONL file. V's order supersedes the README's DB prohibition for the new layer only. Confidence: HIGH. Counter: restoring the JSONL file as the production sink would recreate a machine-local, unqueryable, untracked diagnostic and block the listener.

### A3. "Something does not work" vs `packages/liveness`

`packages/liveness` is **domain freshness**, not process health. It projects `FRESH` / `UNDER_REVIEW` / `STALE` / `ARCHIVED_REVIVED` from review clocks, revision triggers, and query events (`packages/liveness/src/index.ts:5-6`, `24-63`). `sweep` archives unanswered questions after `retireAfterMs` (`344-394`). `detectProviderModelVersionTriggers` fires on `ledger.raw_artifact.model_version` change (`302-341`) — the version-skew class. Scheduler `job:liveness-sweep` is a one-shot (`apps/scheduler/src/cli.ts:11-19`). This does **not** detect hung workers, stalled Hatchet queues, or silent harvest skips.

| Failure mode | Detectable today? | Where | Invisible? |
|---|---|---|---|
| Hung / stuck CLAIMED work item | Partial. Expired `claim_deadline` is reclaimable (`packages/battery/src/index.ts:285-293`). Serve can surface `DEADLINE_EXPIRED` (`packages/serve/src/index.ts:640-647`). | Work-item claim, serve read | No standing reaper: `runReaper` always throws (`apps/scheduler/src/index.ts:87-89`). A worker that dies mid-claim waits until the deadline, then another claim — no error event. |
| Silent no-op | Partial. Evaluator harvest skip after 3 consecutive failures (`apps/evaluator-worker/src/index.ts:223-234`, `246-251`) leaves the run unharvested with no ops signal. Suspicious scoring logger is unwired (A2). | Evaluator pipeline receipts | UI scoring "suspicious" states never recorded. |
| Stalled queue | Partial. `core.work_item` states `READY`/`CLAIMED`/`DONE`/`FAILED` (`migrations/0000_s00.sql:103`). Hatchet is the dispatcher (`apps/api/src/index.ts:363-382`) with Postgres msgqueue (`compose.dev.yaml:23`). | Battery + Hatchet | No lag/age SLO, no alert on READY age, no capture when `runNoWait` itself throws (that would 500 via R02 once capture exists). |
| Budget stall | Detectable as typed domain error `RUN_COST_ENVELOPE_EXHAUSTED` / `CALL_BUDGET_EXHAUSTED` (`apps/runner/src/index.ts:1784-1788`, `2343-2347`) and `terminal_reason = 'CALL_BUDGET_EXHAUSTED'` (`packages/battery/src/index.ts:390`). | Runner + battery | Not in an error table. Honest product halt ≠ ops event. |
| Provider timeout / failure | Detectable. `AbortSignal.timeout`; outcomes `TIMED_OUT`/`FAILED`; cooldown + `ledger.could_not_do` (`packages/providers/src/index.ts:227`, `352`; `apps/runner/src/index.ts:149-157`, `202`; `migrations/0021_dr174_cooldown_prune.sql:9`). | Provider gateway + run_progress_event | Process-level provider outage (vLLM down at boot) is not an error event; claim-time probe records `ABSENT` (`apps/runner/src/index.ts:1342-1358`). |
| Parse / schema failure | Detectable. `ledger.raw_artifact.parse_error` pair constraint (`migrations/0004_s04.sql:12-21`); runner `classifyStructuredContent` (`apps/runner/src/index.ts:870-881`); ledger insert (`packages/ledger/src/index.ts:207-221`). | Artifact row | Not queryable as an ops error; mixed with successful-parse NULLs. |
| Dead-letter | Partial. Harvest consecutive-failure cap (above). Work-item `FAILED` is terminal (`packages/battery/src/index.ts:407-416`). | Battery / evaluator | No DLQ table, no operator replay of FAILED items. |
| Question/node staleness | Detectable by design of `packages/liveness`. | liveness sweep | Out of scope as "thrown error"; in scope as "does not work" only if a sweep job itself throws. |

**OBS-GROK-R04.** The new layer SHALL capture both thrown errors and the invisible classes in the table (expired-claim-without-progress, harvest skip-after-cap, READY-age stall, envelope exhaustion, provider TIMED_OUT/FAILED after retries, PARSE_FAILED/SCHEMA_FAILED, work_item FAILED without an ops event). `packages/liveness` SHALL NOT be reused as the error store; a liveness-sweep exception SHALL be captured as a scheduler error. Confidence: HIGH. Counter: treating every STALE badge as an error would page on intended TTL behaviour.

### A4. Reuse vs replace

| Mechanism | Verdict | Why |
|---|---|---|
| Dev JSONL remnant (`apps/ui/lib/observability/`) | **Reuse redaction + event field names; replace the sink and the README prohibition for the NEW layer.** Keep JSONL as a **fallback sink** when Postgres is down (B3), gated as today by fail-open (`logger.ts:241-243`). Do not import the untracked module as the production store. | Tests prove redaction and shape; README:18 forbids DB for *those* diagnostics — V's order supersedes for the new layer; boundary must be explicit (two sinks, one redaction policy). |
| `parse_error` / `parse_status` | **Reuse as a source signal; do not overload as the error table.** | Constraint pair is product-truth for artifacts (`migrations/0004_s04.sql:18-21`). Listener may *query* PARSE_FAILED rows; it must not write ops events into `ledger.raw_artifact`. |
| `ledger` / `register` append-only events | **Reuse correlation and sequencing; do not reuse as the ops error log.** | `run_progress_event` kinds are a closed product vocabulary (`migrations/0021_dr174_cooldown_prune.sql:7-10`). Mixing ops errors into it would break serve/UI contracts. Sequence allocator (`packages/db/src/index.ts:178-180`) is a model for causal order. |
| `acceptance/` harness | **Reuse as the RED→GREEN proof surface for QUICK-FIX/PR-FIX; not a production sink.** | Acceptance dispatcher already records terminal failure (`acceptance/main.ts:100-115`) and CLI-relay is the lawful model path (`acceptance/relay-core.ts:10-17`). Loop-agent proofs SHOULD be the same ceremonies the product already runs. |
| `packages/liveness` | **Do not reuse** as error detection (A3). | Different domain. |
| `delivery_error` | **Out of scope** (excluded zone). | `migrations/0031_registration_verification.sql:28`. |

**OBS-GROK-R05.** Reconciliation rule: the developer JSONL remains developer-only; the new Postgres error store is the production source of truth; both MUST share the same redaction function so a fallback write cannot leak what the primary would redact. Confidence: HIGH. Counter: two sinks drift; without a shared redaction contract the fallback becomes the leak.

### A5. Grounded error taxonomy

Derived from A1–A3, not invented.

**Categories**

| Category | Source in this repo | Always-escalate for the loop agent? |
|---|---|---|
| `process.unhandled` | Missing process handlers (A1) | No (capture + QUICK-FIX possible for missing handlers themselves, once tables exist) |
| `http.unhandled` / `http.5xx` | Fastify 500 `INTERNAL_ERROR` (`apps/api/src/index.ts:184-189`) | No, unless the handler touches auth/persistence semantics |
| `http.client_fault` | 400/401/422 | No auto-fix (not a defect) |
| `worker.terminal` | `recordTerminalFailure` (`packages/battery/src/index.ts:398-416`; `apps/runner/src/index.ts:2513-2522`) | Depends on `terminal_reason` |
| `provider.timeout` / `provider.failed` | `packages/providers/src/index.ts:352`; cooldown (`apps/runner/src/index.ts:202`) | External root possible (C4) |
| `parse.failed` / `schema.failed` | `migrations/0004_s04.sql:16-21` | Often contract/prompt; PR-FIX or escalate |
| `budget.exhausted` | runner envelope codes | Product halt; escalate if a bug caused premature exhaust |
| `queue.stall` / `claim.expired` | battery claim (`packages/battery/src/index.ts:285`) + scaffold reaper | Ops, not a one-line fix |
| `evaluator.dead_letter` | harvest cap (`HARVEST_MAX_CONSECUTIVE_FAILURES`) | Escalate (pipeline) |
| `ui.render` / `ui.proxy` | ScoringErrorBoundary; 502 proxy | QUICK-FIX possible for missing reporter; not for scoring semantics |
| `db.pool` | `DATABASE_POOL_FAILED` (`packages/db/src/index.ts:9-17`, `69-71`) | Escalate; fallback sink |
| `liveness.job` | sweep/CLI throw | Scheduler job |
| `security.boundary` | errors escaping registration.ts into Fastify | Capture at boundary only (B6); never auto-fix |
| `crypto` / `auth` / `migration` / `scoring.semantics` / `spend` | high-risk floor | ALWAYS escalate |

**Severities:** `fatal` (process death, DB pool terminal), `error` (5xx, worker FAILED, provider FAILED after retries), `warning` (cooldown, harvest skip, READY-age), `info` (client_fault, expected AskRefusal). Aligns with Sentry's `fatal|error|warning|info|debug` ([Sentry event payloads](https://develop.sentry.dev/sdk/foundations/envelopes/event-payloads/)).

**Component attribution:** `api` | `runner` | `scheduler` | `evaluator-worker` | `replay` | `ui.server` | `ui.client` | package name (`db`, `providers`, …) | `boundary.excluded`. Build/version hash is mandatory (B2) because liveness already treats model-version skew as a first-class trigger (`packages/liveness/src/index.ts:302-341`).

**OBS-GROK-R06.** Every stored event SHALL carry `category`, `severity`, `component`, and `environment`. High-risk-floor categories are never QUICK-FIX or unflagged PR-FIX. Confidence: HIGH. Counter: over-tagging "scoring" will freeze legitimate UI-copy fixes; scoring *semantics* (τ, bands, served numbers) is the floor, not every file under `apps/ui/components`.

## RQ-B

### B1. Capture points

**OBS-GROK-R07.** Required capture points (requirements only):

1. **Process-level:** `uncaughtException`, `unhandledRejection`, and Fastify/Next on-unhandled, in `api`, `runner`, and any future standing workers. One-shot CLIs: `try/finally` around the command with capture on throw and on non-zero exit.
2. **Route middleware:** Fastify `setErrorHandler` (`apps/api/src/index.ts:158`) SHALL emit an event for 5xx and for unhandled 4xx that are not `MALFORMED_REQUEST`/`SESSION_REQUIRED`/`AskRefusal`. AskRefusal/4xx MAY emit at warning with sampling.
3. **Job/queue wrappers:** `declareHatchetWalkingSkeletonTask` (`apps/runner/src/index.ts:2504-2525`) SHALL emit on catch, including when `recordTerminalFailure` returns false. Scheduler CLI commands SHALL emit on throw. Evaluator-worker exported functions SHALL emit on their existing catch paths instead of swallowing the original error.
4. **Provider-call wrappers:** `packages/providers` terminal `ProviderCallFailedError` / `ProviderContentUnacceptedError` (`packages/providers/src/index.ts:371-385`) SHALL emit one event per *exhausted* call (not per attempt).
5. **DB-error paths:** `typedPoolFailure` / `pool.on("error")` (`packages/db/src/index.ts:69-71`) SHALL emit; if the emit target is Postgres, use the fallback sink (B3).
6. **Worker crash paths:** Hatchet worker process death is a process-level event. Claim expiry without a subsequent DONE/FAILED within a bound SHALL emit `queue.stall` / `claim.expired`.
7. **Client error reporting:** UI SHALL report `window` error / unhandledrejection and `ScoringErrorBoundary` (`componentDidCatch`) to a dedicated ingest route that authenticates the session and redacts at the edge. Proxy 502s (`apps/ui/app/api/[...path]/route.ts:53-59`) SHALL emit server-side.

Confidence: HIGH. Counter: wrapping every package call site is an architecture boil; process + route + job + provider + db + client-boundary is the minimum that makes "every throw" true without rewriting the kernel.

### B2. Error-event schema requirements (prior art + mandatory fields)

Production error trackers treat an **event** and an **issue** as distinct. Sentry's canonical event requires `event_id` (32-char lowercase uuid hex), `timestamp`, and `platform`; strongly encourages `level`, `release`, `environment`, `fingerprint`, `transaction`, `tags`, `extra`/`contexts`, plus Exception and Stack Trace interfaces. Size limits: stack traces capped at 50 frames; extra items 16 kB / 256 kB total; tag values 200 chars ([Sentry Event Payloads](https://develop.sentry.dev/sdk/foundations/envelopes/event-payloads/)). Grouping order is fingerprint → stack trace (in-app frames) → exception type/value → message ([Sentry Issue Grouping](https://docs.sentry.io/concepts/data-management/event-grouping/)). First-seen / last-seen and counts live on the **issue** (grouped fingerprint), not on every event.

The remnant logger already sketches a local subset: `timestamp`, `level`, `event`, `source`, `message`, `requestId`, `sessionId`, `userId`, `debateId`, `runId`, `artifactId`, `error.{name,message,stack,code,cause}`, `rootHint` (`apps/ui/lib/observability/logger.ts:32-51`).

For RQ-C's procedure to **terminate**, the following are **MANDATORY** on every event (issue-level rollups in parentheses):

| Field | Why mandatory | Prior art |
|---|---|---|
| `event_id` | Stable handle for ack/cursor | Sentry required |
| `occurred_at` | Order + retention | Sentry `timestamp` |
| `severity` / `level` | Listener triage | Sentry `level` |
| `environment` | Prod vs dev; Cursor cookbook warns not to auto-fix non-prod ([Cursor × Sentry cookbook](https://sentry.io/cookbook/regressed-issue-to-pr-cursor/)) | Sentry `environment` |
| `release` / build hash / git SHA | Version-skew class; liveness already watches model_version | Sentry `release`; `packages/liveness/src/index.ts:302-341` |
| `component` + `runtime` | Attribution (A5) | Sentry `transaction` / tags |
| `fingerprint` | Dedup so the listener does not thrash one bug | Sentry grouping |
| `exception.name` + `exception.code` + redacted `message` | Machine taxonomy | Sentry exception interface; repo `TypedDomainError.code` |
| `stack` (redacted, in-app frames) | Root location | Sentry stack grouping |
| `cause_chain[]` | Wrapping discipline (C1) | Sentry exception values list; remnant `error.cause` (`logger.ts:176-179`) |
| Correlation: `run_id`, `work_item_id`, `debate_id`/`answer_id`, `node_id`, `request_id`, `session_id` (hashed) when known | Lineage walk (C2) | Remnant fields; `core.run` / `core.work_item` |
| `ledger_entry_ref` / `raw_artifact_id` when the fault is a model call | Join to parse_error / provider outcome | `packages/ledger/src/index.ts:207-221` |
| `fingerprint` + issue `first_seen` / `last_seen` / `count` | Dedup + "still happening" | Sentry issue, not event |
| `redaction_verdict` | Prove capture-time redaction ran | Local requirement (B4) |

Optional but required when applicable: `provider_ref`, `model_version`, `hatchet_workflow`, `probe_failure_code`.

**OBS-GROK-R08.** An event missing any mandatory field is **invalid** and SHALL be rejected into the fallback sink with `schema_invalid`, never into the listener cursor. Confidence: HIGH. Counter: rejecting events during an outage loses the very faults you need; invalid events still go to the fallback, not into the durable cursor.

**OBS-GROK-R09.** Fingerprint SHALL prefer `component` + in-app stack + `TypedDomainError.code` (or exception name) over raw message, matching Sentry's stack-first grouping. Message-only fingerprints are last resort. Confidence: HIGH. Counter: two bugs on the same line will collapse; issue unmerge (Sentry's unmerge) is a later ops need, not a v1 blocker.

### B3. Storage, resilience, volume, indexes, retention

**OBS-GROK-R10.** Durable store is Postgres via Drizzle, in a new schema/table family **outside** `core` product tables and **outside** excluded identity migrations `0030`–`0033`. Writes are append-only (DR-188). No implementation is specified here.

**OBS-GROK-R11.** Write-path resilience: if the insert into Postgres fails (including `DATABASE_POOL_FAILED`), the capturer SHALL write the already-redacted event to the local JSONL fallback (`logs/` path, fail-open like `logger.ts:241-243`) and MUST NOT throw into the product. A later reconciler ships fallback files into Postgres when the pool is healthy. Confidence: HIGH. Counter: unbounded local disk fill; fallback MUST rotate by size/count, not delete product data — rotate means archive files, not unlink debate rows.

**OBS-GROK-R12.** Volume bound (initial): expected thrown-error rate on this deployment is far below Sentry-scale. Bound capture to **≤ 20 events/second/process** with shed-to-fallback (not drop-on-floor) after that. Provider-attempt storms MUST be aggregated to one event per exhausted call (B1.4). Confidence: MEDIUM (no production traffic numbers). Counter: a tight cap hides a storm; the cap must increment a `shed_count` so the listener still sees "we are drowning".

**OBS-GROK-R13.** Indexes the listener needs (requirements, not DDL): (fingerprint, last_seen desc); (occurred_at); (component, severity, occurred_at); (run_id) where not null; (ack_cursor / unprocessed) for the outbox (D1). Confidence: HIGH. Counter: over-indexing write path; start with these four.

**OBS-GROK-R14.** Retention under DR-188: error events are **ops metadata**, not user debates, but they may *reference* run/debate ids. They SHALL NOT be deleted by an automated job. Archival (move to cold storage / compacted issue rollup) is a V-gated policy (E4). Crypto-shred of any accidentally captured PII field is erasure of a secret, not deletion of a debate, and is required if B4 fails. Confidence: HIGH. Counter: infinite growth of stack text; compaction of *payloads* with issue rollups retained is the lawful pressure valve, still V-gated.

### B4. Privacy / redaction

Binding: private-by-default; never leak private debate content, secrets, tokens, cookies, private prompts, or raw provider payloads (intake; spine §11.1 summary at `docs/agent-protocols/debateai-heartbeat-protocol.md:1477-1482`). The remnant already redacts those key names and bearer/cookie/sk- patterns (`apps/ui/lib/observability/logger.ts:83-86`, `108-110`, `184-186`) and truncates strings/arrays/depth (`76-81`, `188-194`). `ledger.raw_artifact.raw_text` is product data and MUST NOT be copied into the ops event (`packages/db/src/schema.ts:256-259`).

**OBS-GROK-R15.** NEVER store: Authorization/cookie/token/password/secret/API-key material; raw prompts; raw provider payloads / `raw_text`; private debate statement bodies; session tokens in the clear; DEK/KEK material; mail-channel contents; registration verification tokens (excluded zone). Store hashed `session_id` / asker ids if needed (`apps/api/src/index.ts:130-138` already SHA-256s the dev token for `asker_id`). Confidence: HIGH. Counter: empty messages make RCA impossible; allow redacted exception `code` + in-app stack + hashed ids.

**OBS-GROK-R16.** Redaction is **capture-time, synchronous, before any sink** (Postgres or JSONL). A write that bypasses redaction is a defect of the observability layer itself and is always-escalate. Confidence: HIGH. Counter: a buggy redactor that redacts `TypedDomainError.code` will blind the listener; codes are a closed vocabulary and are allowed in the clear.

### B5. Overhead and failure-isolation

**OBS-GROK-R17.** Capture SHALL be asynchronous relative to the product hot path: enqueue in-process (bounded buffer) and return. The product request/job MUST NOT await Postgres insert except when the event *is* the DB failure, in which case only the fallback file write runs (already fail-open). Budget: **< 1 ms** added to the p99 of `/v1/asks` and runner claim under the 20 evt/s cap; if the buffer is full, shed to fallback and increment `shed_count`. Observability MUST NOT take the product down — same law as `logger.ts:241-243` and evaluator's "receipt-store outage must not affect the product run" (`apps/evaluator-worker/src/index.ts:146`). Confidence: HIGH. Counter: a full buffer plus a falling-over disk will silently lose events; `shed_count` and a heartbeat "capture process alive" event (once per minute, not per request) are the detection.

### B6. Security-zone boundary rule (feeds E5)

**OBS-GROK-R18.** Operational rule: **capture-at-boundary, never instrument-inside, never auto-fix-inside.**

- Errors thrown *by* excluded modules that **escape** into Fastify's `setErrorHandler` (`apps/api/src/index.ts:158`) or process-level handlers ARE captured, with `component = boundary.excluded`, `category = security.boundary`.
- Stack frames whose path is `apps/api/src/registration.ts`, `apps/api/src/mail-channel.ts`, or identity schema objects SHALL be stripped to a single frame `excluded-module:<filename>` so the listener cannot "see inside" enough to patch.
- `delivery_error` and identity tables are not sources for the listener.
- The loop agent MUST refuse any patch whose diff touches migrations `0030`–`0033`, `apps/api/src/registration.ts`, `packages/db/src/identity.ts`, or accounts-mission S-series paths. Commit `6e58adc` remains undisturbed.

Confidence: HIGH. Counter: stripping frames loses the only clue; the thrown `AuthFlowError.code` (`apps/api/src/index.ts:179-188`) is enough for ops without the body of registration.ts.

## RQ-C

### C1. Code-level requirements so a machine can trace

**OBS-GROK-R19.** `TypedDomainError` (and every wrapper that today copies only `message`, e.g. `EDGE_INTEGRITY_ERROR` at `packages/graph/src/index.ts:328-331`, `AskRefusal` at `apps/api/src/index.ts:97-104`) SHALL preserve `cause` (or an explicit `causes[]`) and a stable `code`. Bare `throw new Error(String(error))` and `throw new TypedDomainError(code, error.message)` without cause are tracing-breaking and are a remediation class (C3). Confidence: HIGH. Counter: Node `Error.cause` is not walked by all loggers; the capture layer MUST walk `cause` itself (`logger.ts:176-179` already does).

**OBS-GROK-R20.** Correlation ids SHALL propagate on the request/job: `request_id` (api), `run_id` + `work_item_id` (runner/Hatchet metadata already sends `v3RunId` / `v3WorkItemId` at `apps/api/src/index.ts:376-380`), `session_id` hashed. Provider calls already carry `runId`, `callSiteKey`, `subjectItemId` (`packages/providers/src/index.ts:219-232`). Capture MUST copy these onto the event. Confidence: HIGH. Counter: ids on Hatchet metadata are not in the error object today; the wrapper (B1.3) is the copy point.

**OBS-GROK-R21.** Run lineage for tracing is: error event → `run_id` → `core.run` / `core.work_item` / `ledger.raw_artifact` / `core.run_progress_event` → optional `apps/replay` **read-only** ceremony for arithmetic mismatch. The tracer MUST NOT write product tables. Confidence: HIGH. Counter: replay is operator-attested and read-only (`apps/replay/src/index.ts:10-31`); using it as an automatic step needs the same attestation policy, else skip replay and stop at ledger.

### C2. Mechanical trace procedure (must terminate)

Given one error event E:

1. Validate mandatory fields (R08). If invalid → verdict `UNTRACEABLE_SCHEMA`.
2. If `component = boundary.excluded` → verdict `EXTERNAL_OR_EXCLUDED` (stop; do not open excluded files).
3. Load issue by `fingerprint`. If `count` exceeds rate cap (D4) → verdict `ESCALATE_STORM`.
4. Walk `cause_chain[]` until a node with (a) in-app stack frame, or (b) a `TypedDomainError.code`, or (c) a provider/db terminal code.
5. If `run_id` present: read run state, latest `run_progress_event` kind, work_item `state`/`terminal_reason`, and — only if category is parse/provider — the referenced `raw_artifact.parse_status` (not `raw_text`).
6. If category is arithmetic/serve mismatch: optionally invoke `apps/replay` under existing operator attestation; else skip.
7. Classify C4 root. Emit verdict `{ root_class, root_code, evidence_refs[], fix_class }`.

**OBS-GROK-R22.** Termination guarantees the store MUST provide: every event has `event_id` and `occurred_at`; cause chains are finite (capture truncates at depth 8, matching remnant `maxDepth: 6` plus margin); fingerprints are stable; a missing `run_id` is an allowed terminal (`root = missing-correlation`, not a hang). The procedure is deterministic: no LLM in the walk. The LLM (D2) consumes the verdict, it does not search. Confidence: HIGH. Counter: a cycle in `cause` could loop; capture MUST cycle-break (remnant already uses `WeakSet` at `logger.ts:123-125`).

### C3. Where tracing is impossible today

Remediation classes: **WRAP** (preserve cause), **CAPTURE** (emit event), **UNSWALLOW** (do not empty-catch without capture), **WIRE** (dead code), **OUT-OF-SCOPE** (excluded zone).

| Location | What breaks tracing | Class |
|---|---|---|
| No process handlers (A1) | Unhandled rejections vanish to Node default | CAPTURE |
| `apps/api/src/index.ts:143` `logger: false` | No request log | CAPTURE (do not enable verbose Fastify logs of bodies) |
| `apps/api/src/index.ts:158-190` | 5xx returns `message` to client, stores nothing | CAPTURE |
| `apps/api/src/index.ts:159-175` | SSE destroy, no event | CAPTURE |
| `apps/api/src/index.ts:97-104` AskRefusal copies message, not cause | WRAP |
| `packages/kernel/src/index.ts:283-288` no `cause` | WRAP |
| `packages/graph/src/index.ts:328-331` message-only wrap | WRAP |
| `apps/runner/src/index.ts:1789-1792` replaces original error with `NODE_REVIEW_UNAVAILABLE` | WRAP |
| `apps/runner/src/index.ts:2488-2491` `UNEXPECTED_ERROR` drops the object | WRAP + CAPTURE |
| `apps/evaluator-worker/src/index.ts:145-147`, `160-162`, `246-251`, `261-269` empty/lossy catch | UNSWALLOW + CAPTURE |
| `apps/ui/lib/observability/suspiciousScoring.ts:137-141` swallow | CAPTURE (keep fail-open) |
| `apps/ui/lib/observability/logger.ts:241-243` empty catch | Keep isolation; CAPTURE of *logger* failure is optional heartbeat |
| `apps/ui/lib/scoringResponse.ts:213-218` never called | WIRE or replace by new layer |
| `apps/ui/components/ScoringErrorBoundary.tsx:21-23` no componentDidCatch | CAPTURE |
| `apps/ui/app/api/[...path]/route.ts:53-59` fetch catch discards error | WRAP + CAPTURE |
| `acceptance/main.ts:103-114` fire-and-forget `setImmediate` + empty persist catch | CAPTURE (acceptance-only; do not change 202 contract) |
| `apps/scheduler/src/index.ts:87-89` reaper scaffold | CAPTURE when it throws; do not implement the reaper in this mission |
| `apps/api/src/registration.ts` empty catches | OUT-OF-SCOPE (boundary capture only) |

**OBS-GROK-R23.** Programming loop SHALL treat WRAP/CAPTURE/UNSWALLOW as observability-mission work on allowed trees; WIRE of suspicious scoring is optional once the new store exists; registration.ts remains OUT-OF-SCOPE. Confidence: HIGH. Counter: "unswallow" without fail-open will violate R17; unswallow means "capture then continue", not "rethrow into the ask path".

### C4. Definition of "root"

**OBS-GROK-R24.** Tracing stops at the first cause that is either (1) a frame in this repo's allowed trees that introduced the defect, or (2) an **external-cause boundary**. External roots: provider HTTP/timeout after the configured `maxAttempts`; Postgres process death; Hatchet engine unavailability; operator-mis-set register values; excluded-zone modules. Proximate cause (the 500) is never the root if a cause-chain or `TypedDomainError.code` exists. A provider outage is a root **outside the repo**: fix-class `ESCALATE` / report-only, never a code QUICK-FIX. Version skew (`model_version` change) is a liveness trigger, not necessarily a code defect. Confidence: HIGH. Counter: "external" can hide our own timeout being too low; if `deadlineMs` is a register value, changing it is spend/register policy → always escalate.

## RQ-D

### D1. Trigger transport

Postgres 18 `NOTIFY` is transactional (delivered only on commit), folded for identical payloads in one transaction, payload capped (~8000 bytes), and queued in a server-side notify buffer that can fill if a listener sits in a long transaction ([PostgreSQL NOTIFY](https://www.postgresql.org/docs/current/sql-notify.html)). It does **not** replay to a listener that was disconnected. Independent 2026 engineering notes: LISTEN needs a **dedicated connection**; it is incompatible with PgBouncer transaction mode; pair NOTIFY with an outbox table and poll on reconnect ([MVP Factory, 2026-05-22](https://mvpfactory.io/blog/postgresql-listen-notify-for-real-time-features-without-adding-infrastructure/)). Hacker News 2025-07 discussion of production use: NOTIFY as a **latency reducer** over a table of record, not as the queue ([HN 44490510](https://news.ycombinator.com/item?id=44490510)). Transactional outbox is the industry pattern for at-least-once: write event in the same transaction as the state change; a relay publishes later ([Azure Architecture Center, 2026-02-26](https://learn.microsoft.com/en-us/azure/architecture/databases/guide/transactional-out-box-cosmos); [AWS Prescriptive Guidance](https://docs.aws.amazon.com/prescriptive-guidance/latest/cloud-design-patterns/transactional-outbox.html)).

Polling alone misses "the moment" (V's words) but does not miss events across restarts. NOTIFY alone misses events across restarts. Outbox alone is correct and slower (poll interval).

**OBS-GROK-R25.** Delivery-guarantee requirement: **at-least-once** with an explicit cursor/ack. The error row (or an outbox row written in the same transaction as the error row) is the source of truth. LISTEN/NOTIFY is an optional wake. A poll ≤ 5 s is the missed-event backstop. Ack is not issued until the listener has written its action audit (D4). Duplicate deliveries are expected; fingerprint + `listener_actions` uniqueness makes handling idempotent. Payload on NOTIFY is an `event_id` only (stay under 8 kB). Confidence: HIGH. Counter: outbox polling loads Postgres (the same box as the product; `compose.dev.yaml:3-12`). Keep poll cheap (indexed unacked) and skip NOTIFY if a pooler in transaction mode is later introduced.

**OBS-GROK-R26.** Do not use Hatchet as the error bus. Hatchet is the product work dispatcher (`apps/api/src/index.ts:363-382`) and its outage is itself an error class. Confidence: HIGH. Counter: "one queue for everything" looks simpler and would couple observability to the thing it must observe.

### D2. Runtime under DR-179

DR-179: model access exclusively through V's authenticated CLI subscriptions (claude / codex / grok CLIs wrapped as local relays); no API keys in repo, register, env, or config until V lifts the hold (`docs/missions/2026-08-06-v3-programming/decisions-ledger.md:1429-1439`). The acceptance CLI-relay already encodes timeout and loud failure (`acceptance/relay-core.ts:10-17`, `25-29`).

Lawful runners **today:** `~/.grok/bin/grok` (this seat's transport), Claude Code CLI, Codex CLI. Unlawful until V lifts DR-179: xAI HTTP API (`grok-4.6` at $2 / $6 per 1M input/output, cached $0.50, long-context surcharge above 200 k tokens — [xAI models](https://docs.x.ai/developers/models), [xAI API](https://x.ai/api)), OpenAI/Anthropic HTTP.

Grok Build/CLI access is bundled into consumer subscriptions, not sold per-token: SuperGrok **$30/month**, SuperGrok Plus **$100/month** ([xAI Pricing](https://x.ai/pricing)). Per-request CLI token burn is **UNVERIFIED** (rate limits, not published per-token CLI billing). Idle cost of a **non-LLM** poller is ~0 model tokens; idle cost of a standing LLM session is the subscription plus any keep-alive the CLI performs (UNVERIFIED).

Where it runs: V's machine now (intake). `dezbatere.ro` later is E6.

**OBS-GROK-R27.** The permanent loop is a **non-LLM** process: outbox poll + optional LISTEN (D1). On an unacked event it **spawns** a CLI-relay worker (prefer Grok CLI as the coding/investigation seat; Codex CLI as alternative if V so elects), with a timeout, then exits that child. One permanent *LLM* session is forbidden: it burns subscription quota while idle and cannot survive CLI disconnects. Confidence: HIGH. Counter: spawn-per-event pays cold-start and may hit CLI rate limits during a storm; rate caps (D4) and report-only shedding are the mitigation.

**OBS-GROK-R28.** If V lifts DR-179, the same spawn interface MAY call `grok-4.6` HTTP at the published rates, with a hard monthly USD cap (E3). Until then, monthly cost is the already-paid CLI subscription(s) plus operator time. Confidence: HIGH on the law; MEDIUM on dollar numbers (CLI quotas unpublished).

### D3. Fix-magnitude taxonomy (objective)

Industry 2026 practice: Sentry Autofix auto-runs only after ≥10 events, last 14 days, and a fixability score; orgs cap at "Stop after Root Cause / Plan / PR Drafted"; PR creation can be org-disabled ([Sentry Autofix](https://docs.sentry.io/product/ai-in-sentry/seer/autofix/)). Cursor's published regression recipe: fix only if root cause is clear, **1–3 files**, code-level (null check, missing await, type error); do **not** fix third-party/infra, **>5 files**, unclear root, or environment/secrets; open a PR, never silent main ([Cursor cookbook](https://sentry.io/cookbook/regressed-issue-to-pr-cursor/)). GitHub Copilot Autofix: suggestions require explicit developer review; may introduce new vulnerabilities, wrong locations, or fabricated dependencies ([GitHub responsible-use card](https://docs.github.com/en/code-security/responsible-use/security-and-quality-ai-features)). August 2026 incident: Copilot Autofix authored a GitHub Actions script-injection that a second agent exploited ([Enterprise DNA, 2026-08-17](https://enterprisedna.co/resources/ai-pulse/ai-pulse-2026-08-17-github-copilot-s-autofix-wrote-the-bug-an-ai-agent-then-expl/)).

**Proposed thresholds (objective, checkable):**

| Class | Criteria (ALL must hold) | Action |
|---|---|---|
| **QUICK-FIX** | (a) not in always-escalate set; (b) diff touches **exactly 1 file**; (c) **≤ 20 changed lines**; (d) file is not in forbidden paths (D4); (e) a RED test exists or is added in that same file's test sibling; (f) GREEN proof is the targeted test command exit 0; (g) root is in-repo (C4); (h) no migration, no register row, no protocol doc | Auto-apply via the E2 mechanic |
| **PR-FIX** | Not QUICK-FIX; not always-escalate; **≤ 5 files** and **≤ 200 lines**; no architecture/security/tamper; root in-repo; RED→GREEN described in PR body | Open PR, humans merge |
| **ESCALATE** | Anything else, including unclear root, external root, storm, excluded zone | Report only |

**Always-escalate (immutable, even if 1 line):** security/auth, persistence/migrations, provider spend, scoring semantics (τ, bands, served numbers, judgement selection), live/product data mutation, destructive git, architectural work, protocol docs, board/Kanban state, crypto, the listener's own guardrail config, excluded zone. Source: spine high-risk floor (`docs/agent-protocols/debateai-heartbeat-protocol.md:1195-1198`, `:812-815`) and intake.

**OBS-GROK-R29.** The taxonomy above is binding for the agent. Line/file caps are **secondary** to the floor: a 1-line change to scoring arithmetic is ESCALATE; a 40-line comment-only change is still not QUICK-FIX (fails the 20-line cap) and becomes PR-FIX only if it is not floor-listed. Confidence: MEDIUM (caps are judgement; floor is not). **Strongest counter-argument to this taxonomy:** line-count is a poor proxy for risk (a 1-line regex can RCE; a 30-line log-message fix is harmless). Mitigation: the floor and forbidden-path set dominate; the numeric caps exist to stop the agent "while we are here" rewriting. V may tighten caps to 0 (no QUICK-FIX) without changing the floor.

### D4. Guardrails

**OBS-GROK-R30.** Forbidden write set: excluded zone (B6); `apps/api/src/registration.ts`; `packages/crypto/**`; `packages/db/src/identity.ts`; any `migrations/**` including `pending/`; spend/register env and `packages/register/**` policy rows; scoring semantics in `packages/{judgement,propagation,published-arithmetic,serve,settlement,valuation}/**` and served-number writers; `docs/agent-protocols/**`; Hermes/Kanban board state; the listener's guardrail config / this requirements file once it becomes policy; secrets and `.env`; GitHub Actions / workflow files (the August 2026 Copilot Autofix failure class). The agent MAY add tests under `tests/**` that do not hit excluded schema. These forbidden writes follow the same human-in-the-loop and org-level “disable code generation / do not auto-apply” posture that Sentry Autofix and Copilot Autofix document as hard-won guardrails ([Sentry Autofix settings](https://docs.sentry.io/product/ai-in-sentry/seer/autofix/); [GitHub responsible-use: review required](https://docs.github.com/en/code-security/responsible-use/security-and-quality-ai-features)).

**OBS-GROK-R31.** Kill switch: a single register/env flag `OBSERVABILITY_LISTENER_MODE = off | report-only | pr-only | quick-fix` (names are requirements, not config). `off` acks nothing new and spawns no CLI. Default after tables exist is `report-only` (D6). Confidence: HIGH. Counter: an env flag on V's laptop can be forgotten on restart; persist the mode in the error-store itself (append-only mode-change events).

**OBS-GROK-R32.** Rate caps: max **3** CLI spawns/hour, max **8**/day, max **1** concurrent spawn, max **2** QUICK-FIX applies/day, max **5** PR-FIX opens/day. A fingerprint may be actioned at most once per 24 h unless it regressed after a QUICK-FIX (then ESCALATE, do not loop). Budget cap: E3. Confidence: MEDIUM (numbers). Counter: too-tight caps leave production burning; too-loose caps are the Snowflake-class incident.

**OBS-GROK-R33.** Audit trail: every listener action (wake, skip, verdict, spawn, apply, PR, revert, shed) is an event in the **same** error store with `component = observer.listener`. Who watches the watcher: a daily digest to V (report-only is still captured). The listener MUST NOT ack an error event until the audit event is written. Confidence: HIGH. Counter: recursive capture of listener errors could storm; listener-error fingerprints are rate-limited to 1/hour and never auto-fixed (no self-modification).

### D5. Git / PR mechanics

GitHub Copilot Autofix and Sentry Autofix both land **PRs for humans to merge**, not silent main. Copilot "Fix with Copilot" for failing Actions pushes to **the branch** and tags the user for review ([GitHub Changelog 2026-06-04](https://github.blog/changelog/2026-06-04-fix-with-copilot-for-failing-actions-now-in-pro-pro-and-max/)). Cursor cookbook branch: `fix/<id>-<slug>`. This mission's workers still never push without V approval; the loop agent's authority is a **product** grant whose mechanics we specify.

**OBS-GROK-R34.** Branch naming: `obs/quick/<fingerprint-short>-<yyyymmdd>` or `obs/pr/<fingerprint-short>-<slug>`. PR body (mandatory sections): root-cause verdict (C2), event_id(s), RED command + output path, GREEN command + output path, files, why this is not floor-listed, revert SHA. Reviewers of a loop-agent PR: a human (V or delegate) **always**; Hermes does not auto-Done. Revert path: `git revert` of the merge (or of the QUICK-FIX commit) creating `obs/revert/<sha>` and an audit event. Confidence: HIGH. Counter: requiring V on every PR-FIX recreates the queue V wanted to skip; that is the point of the PR-FIX vs QUICK-FIX split.

**OBS-GROK-R35.** QUICK-FIX lawful mechanic (see E2): **never a direct commit to `main`**. Open a PR on `obs/quick/*`, pass the RED→GREEN command, then auto-merge **only** if (1) mode is `quick-fix`, (2) all R29 predicates hold in a mechanical checker (not the LLM), (3) CI (or the targeted test command recorded in the audit event) is GREEN, (4) the mechanical checker diffs against the forbidden-path set. Auto-merge is a product capability with an audit event; it is not a license for mission seats. Confidence: MEDIUM (V owns E2). Counter: auto-merge is how the Snowflake-class CI injection ships; the mechanical checker + 1-file cap + no-workflows-path (GitHub Actions files are always-escalate) is the mitigation.

### D6. Activation gating

**OBS-GROK-R36.** Phase gates (V's order: listener only AFTER tables exist):

| Phase | Gate | Acceptance |
|---|---|---|
| P0 Capture library + fallback JSONL | Redaction tests ported from disabled logger tests; fail-open proven | A process crash still writes fallback; product tests green |
| P1 Error tables live | Migrations applied (programming loop); insert+index; DR-188 additive | A thrown 500 in `api` produces a row; DB-down produces fallback |
| P2 Listener report-only | Mode `report-only`; outbox+LISTEN+poll; CLI spawn **disabled** | Every new error gets a C2 verdict event within 5 s + poll bound; no git writes |
| P3 PR-FIX enabled | Mode `pr-only`; mechanical path checker | Agent can open `obs/pr/*` PRs; cannot merge; cannot touch forbidden paths |
| P4 QUICK-FIX enabled | Mode `quick-fix`; E1/E2 ruled by V | Mechanical checker + caps; revert drill documented and run once |

No phase is skipped. P4 is a V decision (E1/E2). Confidence: HIGH. Counter: shipping P4 with P1 will auto-patch noise; the 10-event / 14-day idea from Sentry Autofix SHOULD apply to P3/P4 as a fingerprint maturity rule (an issue needs ≥ N events or a `fatal` before PR/QUICK).

**OBS-GROK-R37.** Fingerprint maturity: PR-FIX/QUICK-FIX only if `count ≥ 3` or `severity = fatal`, and first_seen ≥ 1 minute ago (not a single fluke during deploy). Confidence: MEDIUM. Counter: a one-shot fatal on boot should still be reportable in P2 immediately; maturity applies to *fix* authority, not capture.

### D7. Governance

**OBS-GROK-R38.** The listener is a **product component of `dialectical-engine`** (it has tables, a runtime, and a V-granted git capability) **and** an ops agent under Graph Spine discipline: its *changes to the engine* still traverse review for PR-FIX; QUICK-FIX is the only spine exception V is granting, and it remains bounded by §9. If a PR (or a QUICK-FIX diff) touches architecture, persistence, spend, scoring semantics, or security, the mechanical checker rejects it to ESCALATE; Hermes routes that report into the V DECISIONS PACKET (`docs/agent-protocols/debateai-heartbeat-protocol.md:1229-1233`). The listener never self-Done, never pushes as a mission worker, never marks Kanban. Confidence: HIGH. Counter: calling it "just ops" would park it outside file contracts and skip review; calling it "just product" would imply it can change architecture through its own PRs.

## RQ-E

### E1. QUICK-FIX definition

Options: (A) 1 file / ≤20 lines / floor-clear / RED→GREEN as R29; (B) 0 QUICK-FIX (report + PR only, matching Copilot/Sentry default); (C) looser (3 files / 50 lines, matching Cursor's "fix" band).

**Pick: A.** Confidence: MEDIUM. Strongest counter: A is still auto-mergeable code and the August 2026 Copilot Autofix incident was a "small" CI-adjacent change; if V is uncomfortable, pick B.

### E2. QUICK-FIX landing mechanics

Options: (A) direct commit to `main`; (B) auto-merged PR on `obs/quick/*` after mechanical checker + tests (R35); (C) batched daily PR of all quick diffs.

**Pick: B.** Confidence: HIGH. Strongest counter: auto-merge is the incident class; A is worse (no PR trail); C delays the "very quick" grant. Audit: every merge SHA is an error-store event with revert SHA recipe.

### E3. Listener runtime + model + monthly budget

Options: (A) non-LLM loop + spawn Grok CLI per event, SuperGrok $30 already paid, cap 8 spawns/day (R27/R32); (B) standing Claude/Grok CLI session; (C) wait for DR-179 lift and use `grok-4.6` HTTP with a $50/month API cap.

**Pick: A.** Confidence: HIGH on architecture; MEDIUM on $30 being enough quota (CLI rate limits UNVERIFIED). Strongest counter: SuperGrok quotas may be too small for a storm; shedding to report-only is required. If V lifts DR-179, `grok-4.6` is $2/$6 per 1M ([xAI models](https://docs.x.ai/developers/models)) plus $5/1k tool calls UNVERIFIED-for-this-agent; do not budget from API prices until the hold lifts. Idle cost of A is ~$0 extra.

### E4. Error-data retention under DR-188

Options: (A) append-only forever, V-gated compaction of payloads after 90 days with issue rollups retained; (B) 30-day delete (conflicts with DR-188 if treated as product data); (C) treat as user data and crypto-shred on account erasure.

**Pick: A**, plus: error events are ops metadata; they are not debates; they still must not contain private debate bodies (B4). If an event illegally contains PII, crypto-shred that field. Never `DELETE FROM` as a retention job. Confidence: HIGH. Strongest counter: disk growth; compaction is the answer, deletion is not.

### E5. Security-zone boundary

Options: (A) capture-at-boundary, strip inner frames, never auto-fix (R18); (B) fully exclude even escaped errors; (C) instrument inside registration.ts.

**Pick: A.** Confidence: HIGH. Strongest counter: B leaves auth outages invisible; C violates V's excluded-zone order and disturbs `6e58adc` resume points.

### E6. Other V-only decisions this research surfaces

1. **DR-179 lift for this agent only?** Options: keep CLI-relay; lift for this agent; lift globally. Pick: keep. Confidence: HIGH. Counter: SuperGrok quotas may starve P3.
2. **Where the listener runs after laptop:** V's machine vs `dezbatere.ro`. Pick: V's machine until P2 has a week of truth. Confidence: MEDIUM. Counter: a laptop-only listener is asleep when V is away.
3. **May QUICK-FIX touch `apps/ui` copy/CSS?** Pick: yes if R29 holds and it is not scoring semantics. Confidence: MEDIUM. Counter: UI copy sits next to scoring widgets and is easy to mis-classify.
4. **Fingerprint maturity N=3** (R37) vs N=1 for fatal. Pick: N=3 except fatal. Confidence: MEDIUM. Counter: a single boot-fatal should still be reportable in P2 immediately (maturity is for *fix* authority).
5. **Who is the human reviewer of `obs/pr/*`?** Pick: V, unless a named delegate is granted. Confidence: HIGH. Counter: V-as-bottleneck is the queue this goal wanted to shrink; that is what QUICK-FIX is for, not PR-FIX.
6. **Hatchet/Postgres pooler in transaction mode** (docker-hatchet mission in flight). Pick: if PgBouncer transaction pooling appears, LISTEN must bypass it ([MVP Factory](https://mvpfactory.io/blog/postgresql-listen-notify-for-real-time-features-without-adding-infrastructure/)). Confidence: HIGH. Counter: a dedicated connection is one more ops object to forget.
7. **Whether evaluator-worker becomes a standing process.** Today it is a library (`apps/evaluator-worker/package.json:6`). Pick: capture at exported function boundary until a standing worker exists. Confidence: HIGH. Counter: a later Hatchet worker will need process-level handlers (R01) or the gap returns.

## Ranked recommendations

1. **Ship capture + tables before any listener git authority (P0→P1→P2).** Confidence: HIGH. Counter: V asked for a looping agent; sequencing is V's own "after the tables" clause.
2. **Outbox row + LISTEN wake + ≤5 s poll; at-least-once cursor/ack (R25).** Confidence: HIGH. Counter: extra writes on the product Postgres (`compose.dev.yaml` single postgres); keep the outbox tiny.
3. **Non-LLM permanent loop; CLI-relay spawn-per-event under DR-179 (R27).** Confidence: HIGH. Counter: cold start latency vs "the moment"; NOTIFY keeps wake fast, spawn is the slow/expensive part and is capped.
4. **Reuse remnant redaction; replace the JSONL as source of truth (R05).** Confidence: HIGH. Counter: untracked files will bit-rot; port tests into the new layer in programming.
5. **Preserve `Error.cause` / wrap codes (R19) as a capture prerequisite.** Confidence: HIGH. Counter: touching `TypedDomainError` is kernel-wide; can be additive (`cause?` optional) without breaking constructors.
6. **QUICK-FIX = 1 file / ≤20 lines / floor-clear / mechanical checker / auto-merged PR, never direct main (E1 A, E2 B).** Confidence: MEDIUM. Counter: industry default is "no auto-merge"; V can pick E1-B.
7. **Always-escalate = spine §9 + crypto + excluded zone + guardrail config + GitHub Actions/workflows (D3/D4).** Confidence: HIGH. Counter: may over-escalate UI-adjacent files; define scoring-semantics as arithmetic/served-number writers, not every badge.
8. **Capture excluded-zone errors at Fastify/process boundary with stripped frames (R18).** Confidence: HIGH. Counter: security-sensitive 500s become opaque; `AuthFlowError.code` remains.
9. **Do not overload `parse_error`, `run_progress_event`, or liveness tables as the ops store (A4).** Confidence: HIGH. Counter: extra schema (high-risk floor) — that cost is already accepted by this mission's classification.
10. **Fallback JSONL when DB is down; never block the product (R11, R17).** Confidence: HIGH. Counter: two sinks; shared redaction and a reconciler are mandatory.

## Contested decisions for V

| id | options | pick | why |
|---|---|---|---|
| E1 | A 1-file/≤20 + floor; B no QUICK-FIX; C 3-files/50 | **A** | Honours "very quick, no approval" without Cursor's 5-file band. Floor dominates lines. |
| E2 | A direct main; B auto-merged PR; C daily batch | **B** | PR body is the audit; auto-merge is the grant; main-direct is un-revertable without SHA discipline. |
| E3 | A spawn Grok CLI + $30 sub; B standing session; C wait + HTTP API | **A** | Only lawful spend under DR-179; idle ≈ 0; lift later. |
| E4 | A append-only + V-gated compaction; B timed delete; C treat as user data | **A** | DR-188 forbids deletion of product data; ops payloads compact, they do not delete debates. |
| E5 | A boundary capture; B fully exclude; C instrument inside | **A** | Observes auth outages without touching W.I.P. security or `6e58adc`. |
| E6.1 | Lift DR-179 for this agent? | **No for now** | CLI-relay works; API prices are a different grant. |
| E6.2 | Listener host | **V's machine until P2 is proven** | LISTEN needs a dedicated connection; hosting is a later ops move. |

## UNVERIFIED / gaps

- Exact Node.js version's default `uncaughtException` behaviour on the deployment image (repo has no pin cited here) — UNVERIFIED beyond "no process handlers in tree".
- Production error rate / Hatchet backlog SLOs — no traffic; volume bound in R12 is a guess (MEDIUM).
- CLI (Grok Build / Claude Code / Codex) **per-request token billing and rate limits** — UNVERIFIED. Subscription list prices: SuperGrok $30 / SuperGrok Plus $100 ([xAI Pricing](https://x.ai/pricing)). Do not treat API $2/$6 as CLI cost.
- Whether `compose.dev.yaml` Postgres will sit behind PgBouncer in transaction mode after the docker-hatchet mission — UNVERIFIED; if yes, LISTEN must bypass the pooler.
- Whether `evaluator-worker` will become a Hatchet-standing process — today it is a library (`apps/evaluator-worker/package.json`).
- `recordSuspiciousScoringResponse` callers: grep shows only the definition (`apps/ui/lib/scoringResponse.ts:213`) — treated as unwired; a dynamic import could exist and was not found.
- Copilot Autofix / Snowflake incident details beyond the 2026-08-17 report — treat as "AI auto-fix can introduce CI injection"; do not claim a CVE number not in that report.
- Sentry envelope on-wire vs issue API first_seen field names — used issue-level first/last seen as a requirement, not a copied schema.
- `apps/ui` package name still says `dialectical-engine-v2ui` (`apps/ui/package.json:2`) — naming leftover; product name remains `dialectical-engine` / current algorithm version.
- Hermes session id for this seat is the Grok CLI session recorded at handoff; Kanban ticket `REQ-OBS-GROK` was not opened in this workspace (comments: not ticketed).
)
