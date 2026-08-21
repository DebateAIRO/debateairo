# Claude Opus — Observability requirements (2026-08-21-observability-loop)

- **Seat:** claude-opus, blind seat 1 of 3, REQUIREMENTS loop
- **Evidence convention:** every `path:line` is relative to the working root
  `dialectical-engine/` and reflects the working tree at 2026-08-21. Anything I
  could not verify against the tree is marked `UNVERIFIED`.
- **Scope discipline:** the excluded W.I.P. security zone was read only far
  enough to map its import/type boundary. No fix, no instrumentation and no
  design inside it is proposed anywhere below.

---

## Verdict summary (10 lines max)

1. There is **no observability layer**. The single surviving module
   (`apps/ui/lib/observability/`) is dead code: nothing in the product calls it.
2. Exactly **one** `console.error` exists in product runtime code
   (`packages/db/src/index.ts:71`). Fastify's logger is explicitly off
   (`apps/api/src/index.ts:143`). There are **zero** telemetry deps, health
   endpoints, `uncaughtException`/`unhandledRejection` handlers, and **zero**
   build/commit version identifiers anywhere in the tree.
3. An unhandled API error is sent to the *client* and recorded *nowhere*; a
   runner error is compressed to one `terminal_reason` text column and its
   stack, message and cause are destroyed.
4. `TypedDomainError` has no `cause` field (`packages/kernel/src/index.ts:283-288`),
   so all 49 catch-and-rethrow wraps (of 492 throw sites in `apps/`+`packages/`)
   sever the causal chain. Root-tracing is impossible by construction.
5. **19 of the 29 declared wire event types have no producer at all** — the DDL
   CHECK forbids them (`migrations/0021_dr174_cooldown_prune.sql:6-11`). The
   UI's `node.failed` branch is unreachable code.
6. `packages/liveness` is a *content-freshness* subsystem, not a health
   subsystem. It detects nothing about processes, queues, stalls or errors.
7. A known, test-enforced silent-hang class already ships: `PROCESS_DEATH_STALL`
   (`tests/unit/exec01-rework-contract.test.ts:22-27`); the reaper is a stub.
8. The production runner entrypoint is mis-wired and would fail every work item
   before claiming it (`apps/runner/src/main.ts:27-41` vs `apps/runner/src/index.ts:1227-1232`)
   — the exact class of defect this mission exists to surface.
9. **Blocking finding for the loop agent:** the product source tree is
   effectively *untracked in git*. Only 30 product files are tracked, all inside
   the excluded security zone. The agent cannot open a PR against code git does
   not know about. This gates RQ-D5/E2 absolutely.
10. Every append-only write serialises on one row (`ledger.allocate_sequence()`,
    `migrations/0000_s00.sql:9-29`). The error store must not join that path.

---

## RQ-A — Failure-surface ground truth

### A1. Where errors are thrown, caught, logged, swallowed — and where an unhandled error goes

#### A1.1 Per-runtime unhandled-error destination

| Runtime | Process entry | Handler in place | Where an unhandled error actually goes |
|---|---|---|---|
| `api` (HTTP) | `apps/api/src/main.ts:112-120` (`buildApi` → `api.listen`) | `api.setErrorHandler` at `apps/api/src/index.ts:158-191`; **Fastify logger disabled** at `apps/api/src/index.ts:143` (`Fastify({ logger: false })`) | HTTP 500 `{error:"INTERNAL_ERROR", message: knownError.message}` returned **to the caller** (`apps/api/src/index.ts:185-190`). **Nothing is written to any file, table, or stream.** The internal message crosses the trust boundary; the operator sees nothing. |
| `api` (SSE) | `apps/api/src/index.ts:333-344` | `reply.sent` branch, `apps/api/src/index.ts:159-176` | Socket destroyed (`reply.raw.destroy()` at `:165`, socket fallback at `:169`). Deliberately no terminal SSE event (DR-115 comment at `:160-162`). **No record of the aborted stream anywhere.** |
| `api` (boot) | top-level `await` chain, `apps/api/src/main.ts:30-120` | none (`process.on` grep across `apps/`,`packages/`: no `uncaughtException`/`unhandledRejection` anywhere) | Node default: message to stderr, non-zero exit. No structured record. |
| `runner` | `apps/runner/src/main.ts:42-47` (Hatchet worker) | `declareHatchetWalkingSkeletonTask`, `apps/runner/src/index.ts:2504-2526` | `try/catch` at `:2508-2523` → `WorkItemRepository.recordTerminalFailure` (`packages/battery/src/index.ts:398-417`) writes **one text column** `core.work_item.terminal_reason`; the value comes from `runnerTerminalFailureReason` (`apps/runner/src/index.ts:2488-2492`) and is either `RUNNER_EXECUTION_FAILED:<code>` or `RUNNER_EXECUTION_FAILED:UNEXPECTED_ERROR`. Message, stack and cause are **discarded**. The error is then rethrown into the Hatchet engine (retries = `HATCHET_ENGINE_RETRIES`, `packages/register/src/runtime-environment.ts:91`) whose own failure state lives outside our database (`UNVERIFIED` what Hatchet retains). |
| `runner` (record-failed path) | same | `apps/runner/src/index.ts:2519-2521` | If `recordTerminalFailure` returns `false` (item already `DONE`/settled — `packages/battery/src/index.ts:411-412`), the **original error is thrown away** and replaced by `TypedDomainError("RUNNER_FAILURE_STATE_NOT_RECORDED", workItemId)`. Total evidence loss. |
| `scheduler` | `apps/scheduler/src/cli.ts:1-24` | none; `try/finally` only, `:15-24` | Top-level `await` rejection → Node default → stderr + non-zero exit. Success prints JSON to stdout (`:21`). |
| `evaluator-worker` | **no entry point exists** — `apps/evaluator-worker/package.json` declares `"exports": "./src/index.ts"` and no `scripts.start`, and there is no `main.ts` | n/a | Never runs in production. Its dispatch binding is permanently `UNBOUND` (`packages/evaluator/src/dispatch-binding.ts:6-45`). The only importers are `tests/` (7 files). Errors here reach a test runner, never an operator. |
| `replay` | `apps/replay/src/cli.ts:1-19` | none; `try/finally` `:12-19`; `process.exitCode = 1` on mismatch `:16` | Top-level rejection → stderr + non-zero exit. |
| `ui` (server / RSC / route handlers) | Next.js 15 app router, `apps/ui/app/**` | **no `error.tsx`, no `global-error.tsx`, no `not-found.tsx` anywhere** in `apps/ui/app` or `web/app` (verified by `find`) | Next's built-in 500 page. Nothing captured. Individual pages catch to a local string: `apps/ui/app/page.tsx:33-35`, `apps/ui/app/debate/[id]/page.tsx:33-45`. |
| `ui` (proxy route) | `apps/ui/app/api/[...path]/route.ts:37-70` | bare `catch` at `:53` | Returns `502 API_UPSTREAM_UNREACHABLE` (`:56-59`). The underlying `fetch` rejection reason is **discarded entirely** — no code, no message, no record. |
| `ui` (client) | React 19 | `apps/ui/components/ScoringErrorBoundary.tsx:15-38` — the **only** error boundary; it implements `getDerivedStateFromError` only, has **no `componentDidCatch`**, and reports nowhere | Renders `Scoring UI unavailable.` badge (`:29-31`). Every other client error hits React's default handling: unmount to blank in production, no report. |

#### A1.2 The complete logging inventory (product runtime)

Exhaustive `console.*` grep over `apps/`, `packages/`, `web/`, `tools/`,
`acceptance/` (excluding `node_modules`, `.next*`):

| Site | Kind | Note |
|---|---|---|
| `packages/db/src/index.ts:71` | `console.error("[DATABASE_POOL_FAILED] …")` | **The only structured error log in product runtime.** Fires once per pool, on the `pool.on("error")` handler (`:69-72`). |
| `apps/scheduler/src/cli.ts:21` | `console.log(JSON.stringify(report))` | Job success report, not an error path. |
| `tools/orphan-audit/src/cli.ts:13` | `console.log` | Lint tool. |
| `acceptance/standing-db.ts:70-71` | `console.info` / `console.error` | Embedded-Postgres lifecycle, acceptance-only. |
| `acceptance/dual-maker-proof.ts:181-185`, `acceptance/run-acceptance.ts:331-379`, `acceptance/panel01-depth1-proof.ts:32`, `acceptance/pro01-depth2-proof.ts:24`, `acceptance/xrev01-depth1-proof.ts:32-38` | `console.info` | Acceptance proof output. |
| `apps/api/src/registration.ts:532, 604, 702, 742, 746, 850, 870, 880, 946, 954` | `console.error` | **Excluded security zone** — listed for boundary mapping only, not for change. |

**No telemetry dependency of any kind** exists: a grep for
`opentelemetry|@sentry|pino|winston|prom-client|datadog|newrelic|bugsnag|rollbar`
across every `package.json` and source file returns nothing.
**No health/readiness/metrics endpoint** exists: a grep for
`"/health|/healthz|/readyz|/metrics|/livez"` across `apps/`, `packages/`,
`web/` returns nothing.

#### A1.3 Throw-site density (product code; sites per file)

| Count | File |
|---|---|
| 58 | `packages/evaluator/src/index.ts` |
| 49 | `packages/serve/src/index.ts` |
| 45 | `apps/runner/src/index.ts` |
| 29 | `packages/register/src/index.ts` |
| 24 | `packages/crypto/src/index.ts` |
| 22 | `packages/valuation/src/index.ts` |
| 14 each | `packages/settlement/src/index.ts`, `packages/propagation/src/index.ts`, `apps/ui/lib/api.ts` |
| 13 | `packages/db/src/index.ts` |
| 12 | `packages/graph/src/index.ts` |
| 11 each | `packages/memory/src/index.ts`, `packages/judgement/src/index.ts`, `apps/api/src/registration.ts` *(zone)* |
| 10 each | `packages/evidence/src/index.ts`, `apps/replay/src/index.ts` |
| 9 each | `packages/critique/src/index.ts`, `packages/battery/src/index.ts` |
| 8 each | `packages/ledger/src/index.ts`, `packages/judgement/src/s04.ts`, `packages/battery/decision/src/index.ts`, `apps/api/src/index.ts` |
| 7 each | `packages/liveness/src/index.ts`, `packages/db/src/identity.ts` *(zone)*, `packages/contract/src/client.ts`, `packages/budget/src/index.ts`, `packages/battery/src/terminal.ts` |
| 6 each | `packages/register/src/auth-policy.ts` *(zone)*, `packages/providers/src/index.ts`, `packages/evaluator/src/consumer.ts` |
| ≤5 | 15 further files (`packages/evaluator/src/dev-menu.ts`, `apps/evaluator-worker/src/index.ts`, `apps/scheduler/src/index.ts`, `apps/ui/app/api/[...path]/route.ts`, `apps/ui/lib/v3/adapter.ts`, `apps/api/src/mail-channel.ts` *(zone)*, …) |

**Totals across `apps/` + `packages/`: 492 throw sites**, of which **49 are
catch-and-rethrow wraps** (a `throw` within six lines of a `catch (`). Those 49
are the sites where the causal chain is currently severed (RQ-C1/C3).

Distinct **statically-literal** `TypedDomainError` codes: **173**
(`ABSENT_SIGNAL_HAS_FRESHNESS` … `WORK_ITEM_WITHOUT_RUN`). Additional codes are
constructed dynamically and are **not** statically enumerable — e.g.
`parseContent(content, schema, code)` at `apps/runner/src/index.ts:862-868`
takes the code as a parameter, and `packages/serve/src/index.ts:209` takes a
`code` argument. **OBS-OPUS finding: there is no closed, machine-readable
registry of error codes anywhere in the tree.**

#### A1.4 Requirements from A1

- **OBS-OPUS-R01** — Every runtime process (`api`, `runner`, `scheduler`,
  `replay`, and any future `evaluator-worker` host) MUST install
  process-level `uncaughtException` and `unhandledRejection` capture that
  records an error event before the process is allowed to exit. Today none
  exists in any process.
- **OBS-OPUS-R02** — The API MUST record every 4xx-with-cause and every 5xx as
  an error event **server-side**, and MUST stop returning
  `knownError.message` for 500-class responses (`apps/api/src/index.ts:189`).
  The client receives a correlation id; the message goes to the store.
- **OBS-OPUS-R03** — The runner's terminal-failure path MUST persist the full
  error identity (code, message, stack, cause chain, call-site key, attempt id)
  **in addition to** the existing `core.work_item.terminal_reason` string, and
  MUST NOT lose the original error when the state write loses a race
  (`apps/runner/src/index.ts:2519-2521`).
- **OBS-OPUS-R04** — The observability layer MUST NOT depend on `console.*`
  as its transport. Console output today is unreadable as a signal: one line
  in the whole product.
- **OBS-OPUS-R05** — Every error code produced anywhere MUST come from, or be
  registered into, a single machine-readable code registry, so the listener
  agent can pattern-match on a closed vocabulary rather than free text.
  Dynamically-parameterised codes (`apps/runner/src/index.ts:862`,
  `packages/serve/src/index.ts:209`) MUST resolve to registry members.

---

### A2. What the rework dropped

#### A2.1 What survives

`apps/ui/lib/observability/` contains exactly five files plus two quarantined
tests:

| File | Lines | State |
|---|---|---|
| `apps/ui/lib/observability/logger.ts` | 258 | Live source; a complete JSONL developer sink with 5 levels + `suspicious`, structured `AppLogEvent` (`:32-51`), `AppLogRootHint` (`:18-22`), depth/length-bounded redaction (`:88-202`), enable gate (`:204-218`), path resolution (`:220-222`), total write with a bare catch (`:226-244`). |
| `apps/ui/lib/observability/suspiciousScoring.ts` | 143 | Live source; product-truth "suspicious output" detectors. |
| `apps/ui/lib/observability/index.ts` | 16 | Barrel export. |
| `apps/ui/lib/observability/README.md` | 18 | Carries the prohibition at `:18`. |
| `apps/ui/lib/observability/logger.test.mjs.disabled` | — | **Quarantined** (renamed, not deleted). |
| `apps/ui/lib/observability/logger.contract.test.mjs.disabled` | — | **Quarantined**. Contains the pre-rework behavioural contract: `suspicious` ⇒ `level:"warn"` + `category:"suspicious"` + `rootHint{suspectedLayer,upstreamEventId,notes}`; ordinary `warn` ⇒ no category; `redactForLog("api_key=sk-live-…") === "[REDACTED]"`. |

#### A2.2 The module is dead code

Exhaustive import graph (grep for `observability|developerLogger|suspiciousScoring`
across `apps/`, `packages/`, `web/`, `tools/`, `acceptance/`):

- `apps/ui/lib/observability/index.ts:3` imports from `./logger` (self).
- `apps/ui/lib/scoringResponse.ts:14-18` imports `recordSuspiciousScoringEvents`
  and re-exports it as `recordSuspiciousScoringResponse`
  (`apps/ui/lib/scoringResponse.ts:213-219`).
- **`recordSuspiciousScoringResponse` is never called.** The only consumer of
  `@/lib/scoringResponse` is `apps/ui/app/debate/[id]/DebatePageClient.tsx:82-93`,
  which imports `formatScoringVisibilityState` and `ScoringVisibilityState`
  only (used at `:917`, `:1211`, `:1567`).
- **`developerLogger` has zero importers outside its own barrel.**

So the layer is not "reduced" — it is **detached**. The rework removed the call
sites and left the sink standing.

#### A2.3 The dismantling trail and what git can still tell us

- `docs/missions/2026-08-06-v3-programming/logs/LOAD-01-codex.log:1409-1410`
  shows ` D apps/v2-ui/lib/observability/logger.contract.test.mjs` and
  ` D apps/v2-ui/lib/observability/logger.test.mjs`; `:1494-1495` shows the
  same two files reappearing as `?? …mjs.disabled`. The pair repeats at
  `:6823-6824` and `:6908-6909`.
- `apps/ui/scripts/node-test-manifest.json` lists exactly one active test
  (`lib/scoringResponse.test.mjs`); `apps/ui/scripts/run-node-tests.mjs:6-12`
  states the manifest is the gate that keeps "quarantined legacy source-contract
  files" from looking active. The observability tests are therefore
  *structurally* excluded, not accidentally missing.
- **Git archaeology is unavailable.** The git root is
  `/Users/vladmihaimiron/Documents/DebateAIRO` (not `dialectical-engine/`).
  Walking `git ls-tree -r` over **every** commit reachable from `--all`
  produced **zero** paths matching `observability`. The historical tree used
  the prefixes `DebateAI-V3/` and `apps/dialectical-engine/`, and the
  observability files were never committed under any prefix. The LOAD-01 log
  and the two `.disabled` files are the *only* surviving record.

#### A2.4 Signals that existed then but not now

Grounded strictly in the quarantined contract test plus the live module surface:

| Signal | Then | Now |
|---|---|---|
| Levelled application events (`debug/info/warn/error/fatal`) | `logger.ts:62-69`, exercised by the quarantined tests | Sink exists, **no producer** |
| `category:"suspicious"` product-truth events with `rootHint` | `logger.contract.test.mjs.disabled` (`scoring.empty_output` + `rootHint`) | Detectors exist (`suspiciousScoring.ts:82-129`), **no producer** |
| Correlated fields on every event (`requestId`, `sessionId`, `debateId`, `runId`, `artifactId`) | `logger.ts:38-44` | Type survives, **never populated** |
| `expected`/`actual` divergence fields | `logger.ts:46-47` | Type survives, **never populated** |
| Structured error shape (`name/message/stack/code/cause`) | `logger.ts:24-30`, `redactError` `:157-182` | Type survives, **never populated** |
| Root-layer hint vocabulary (`ui/api/service/db/worker/model/artifact/unknown`) | `logger.ts:8-16` | Type survives, **never populated** |
| Enforced redaction at write time | `logger.ts:83-86`, `:88-202` | Live and correct; **unused** |

- **OBS-OPUS-R06** — The reconstruction of the pre-rework surface is
  *documentary only*; the new layer MUST NOT be specified as "restore what was
  there". `AppLogEvent` (`logger.ts:32-51`) and `AppLogRootHint` (`:18-22`) are
  the best surviving statement of intent and SHOULD be treated as prior art for
  the event schema, not as a target to reproduce.
- **OBS-OPUS-R07** — The two `.disabled` tests MUST be re-enabled or explicitly
  superseded by the new layer's own tests; leaving quarantined tests beside a
  live module is exactly the state that let the layer rot unnoticed.

---

### A3. "Something does not work" — failure modes beyond thrown errors

| # | Failure mode | Detectable today? | Evidence |
|---|---|---|---|
| 1 | **Process-death stall** — a process dies after claiming a work item; the item stays `CLAIMED` past its deadline forever and the UI waits indefinitely | **NO — known, documented, test-enforced** | `tests/unit/exec01-rework-contract.test.ts:9-29` asserts the deferral text verbatim; `docs/missions/2026-08-06-v3-programming/handoffs/EXEC-01-codex-handoff.md:195-197`. The reaper that would close it is a stub: `apps/scheduler/src/index.ts:87-89` throws `S00_SCAFFOLD_ONLY`. `claimNext` (the reclaim path, `packages/battery/src/index.ts:283-289`, `WHERE state='READY' OR (state='CLAIMED' AND claim_deadline <= clock_timestamp())`) **is never called by any production code** — only `apps/runner/src/index.ts:1252` behind `workItemId === undefined`, and dispatch always supplies an id (`apps/api/src/index.ts:371-382` → `apps/runner/src/index.ts:2509`). |
| 2 | **Mis-wired production runner** — `apps/runner/src/main.ts:27-41` omits `judgementPolicy` and `servePolicy`, so `apps/runner/src/index.ts:1227-1232` throws `JUDGEMENT_POLICY_UNRESOLVED` on *every* work item, **before** the claim at `:1251-1253` | Only as `terminal_reason='RUNNER_EXECUTION_FAILED:JUDGEMENT_POLICY_UNRESOLVED'` on the work item; **no alert, no count, no timestamp** | Compare the fully-wired construction at `acceptance/main.ts:224-296` (supplies `runDeathPolicy`, `holdRecorder`, `servePolicy`, `judgementPolicy`, `hiddenNodeScoreThreshold`, `claimTimeProbe`, `critique`, `additionalMakers`). Also `apps/runner/src/index.ts:1240-1249` (`SCORING_OPERATOR_UNRESOLVED`), `:1219-1225`, `:1233-1239`, `:1276-1279`, `:2362-2368`. |
| 3 | **Provider timeout** | Partially — ledgered | `packages/providers/src/index.ts:227` (`AbortSignal.timeout(deadlineMs)`), classified at `:352` (`error instanceof DOMException && error.name === "TimeoutError"`), ledgered `outcome:"TIMED_OUT"` at `:353-367`. Reaches `ledger.ledger_entry.outcome` (`migrations/0000_s00.sql:164`). |
| 4 | **Provider transport failure** | Partially — ledgered as `FAILED` | same path, `:348-368`; surfaced as `ProviderCallFailedError` (`packages/providers/src/index.ts:46-60`, thrown `:380-385`). This is the **only** error class in the tree that carries `cause` (`:48, :58`). |
| 5 | **Provider content contract failure** (`PARSE_FAILED`/`SCHEMA_FAILED`) | **Yes, well covered** | Classified `apps/runner/src/index.ts:870-881`; repaired `:883-890`; persisted to `ledger.raw_artifact.parse_status/parse_error` (`packages/ledger/src/index.ts:207-225`), constrained by the pair CHECK at `migrations/0004_s04.sql:15-22`; escalated as `ProviderContentUnacceptedError` (`packages/providers/src/index.ts:62-75`). |
| 6 | **Cooldown holds / halted expansion** | Yes, **but only in acceptance** | `withCooldownRetry` `apps/runner/src/index.ts:179-267`; `HoldRecorder` interface `:161-165`; writes `node.retrying` / `ledger.could_not_do` progress events via `RunRepository.recordRunLifecycleEvent` (`packages/db/src/index.ts:326-338`). The production entrypoint supplies **no** `holdRecorder`, so `apps/runner/src/index.ts:1276-1279` would throw `RUN_HOLD_RECORDER_UNRESOLVED` if `runDeathPolicy` were set — and neither is set, so the whole cooldown machinery is inert in production. |
| 7 | **Budget / envelope stall** | Yes, as run-progress events | `packages/budget/src/index.ts:327-347` writes `ENVELOPE_CONSUMED` and `ENVELOPE_STATE` (`ENRICHMENT_SKIPPED`, `EXHAUSTED`); `RUN_COST_ENVELOPE_EXHAUSTED` handling at `apps/runner/src/index.ts:2343-2356`; `CALL_BUDGET_EXHAUSTED` at `:2550-2552`. |
| 8 | **Silent no-op — declared events with no producer** | **NO** | `packages/contract/src/index.ts:17-47` declares **29** event types. `core.run_progress_event.kind` accepts only 7 (`migrations/0021_dr174_cooldown_prune.sql:6-11`: `ENVELOPE_CONSUMED, ENVELOPE_STATE, PHASE, TERMINAL, honesty.staleness_trigger_fired, node.retrying, ledger.could_not_do`). Every writer is enumerated: `packages/db/src/index.ts:333, 378`, `packages/liveness/src/index.ts:186`, `packages/serve/src/index.ts:1178`, `packages/budget/src/index.ts:329, 335, 342`, `packages/valuation/src/index.ts:548`. **Exactly 10 types are deliverable**: `run.running` / `run.terminal` / `honesty.budget_skip_marked` (mapped from `PHASE`/`TERMINAL`/`ENVELOPE_STATE` at `apps/api/src/index.ts:646-650`), `honesty.staleness_trigger_fired`, `node.retrying`, `ledger.could_not_do` (direct), and `node.spawned` / `node.generating` / `node.being_judged` / `node.scored` (synthesised by the projection at `packages/graph/src/index.ts:428-535`, types declared at `:113-120`, reached through `SplitLifecycleProjection` `packages/battery/src/split.ts:80-90` and merged into the stream at `apps/api/src/index.ts:642, 673-681`). **The other 19 can never be produced:** `run.accepted`, `run.planning`, `node.text_delta`, `node.complete`, `node.failed`, `graph.edge_added`, `graph.cycle_refused`, `serve.bundle_frozen`, `serve.composition_started`, `serve.composition_delta`, `serve.conformance_verdict`, `serve.recompose_or_defect`, `honesty.abstention_typed`, `honesty.fallback_labeled`, `honesty.investigation_gap_opened`, `honesty.memory_link_decided`, `honesty.under_explored_marked`, `ledger.attempt`, `ledger.failure`. Note that the three most error-relevant members — `node.failed`, `ledger.failure`, `ledger.attempt` — are all in the dead set. The UI branch that renders "Claim generation failed" on `node.failed` (`apps/ui/app/debate/[id]/DebatePageClient.tsx:143-144`, translator `apps/ui/lib/v3/liveEvents.ts:159`) is **unreachable code**. |
| 9 | **Event-type drop on read** | **NO** | `apps/api/src/index.ts:643-663`: any stored `kind` that does not map returns `[]` at `:651` — silently dropped with no counter. This is not hypothetical: `ENVELOPE_CONSUMED` rows are written on every budget decision (`packages/budget/src/index.ts:329-332`) and the mapper at `:646-650` has no branch for them, so **every one is silently discarded on read**. |
| 10 | **Empty event stream for a fresh run** | **NO** | `apps/api/src/index.ts:641` returns immediately when a run has no events and no failed work; the SSE connection closes with zero bytes of payload. |
| 11 | **SSE is a snapshot, not a stream** | n/a (design fact) | `apps/api/src/index.ts:617-683` `events()` runs two queries once (`:618-640`) and yields; `:343` then calls `reply.raw.end()`. The client therefore reconnects on a backoff that resets to 1 s on every successful open (`apps/ui/app/debate/[id]/DebatePageClient.tsx:612-618, 629-637, 642-652`). Intent `UNVERIFIED`; the *effect* is 1 s polling, and a failure to reconnect is indistinguishable from a quiet run. |
| 12 | **Discarded subprocess stderr** | **NO** | `acceptance/relay-core.ts:100` — `child.stderr.resume()` drains and discards CLI stderr. A relay failure yields only `CliRelayFailure(kind, code)` (`:25-30`, `:106-122`) with no diagnostic text. |
| 13 | **DB pool death** | **Partially — best in tree** | `packages/db/src/index.ts:65-121`: terminal-failure latch (`:67, 77, 98`), typed classification of connection-class SQLSTATEs and errno strings (`:20-28`), one `console.error` (`:71`). Proven by `tests/integration/pol03-pool-resilience.test.ts:21-40`. **This is the only mechanism in the repo that behaves like observability.** |
| 14 | **Migration failure** | No | `packages/db/src/index.ts:123-152`: rollback and rethrow; `apps/runner/src/migrate-cli.ts:1-7` has no handler. |
| 15 | **Scheduler jobs never scheduled** | **NO** | `package.json:24-26` defines `job:replay-self-test`, `job:liveness-sweep`, `job:settlement-watch` as one-shot CLIs. A grep for cron/systemd/scheduled config across `*.yaml`, `*.yml`, `*.json`, `Makefile`, `*.sh` (excluding docs) returns **nothing**. `Makefile` is empty (0 lines). Nothing runs them. |
| 16 | **Evaluator pipeline failures** | Yes, into `evaluator.pipeline_event` | `migrations/0023_evaluator_foundation.sql:86-99`; writers at `packages/evaluator/src/index.ts:428-430, 491-493, 1421-1423, 1957-1962`, `apps/evaluator-worker/src/index.ts:144`. **But the worker never runs** (A1.1). |
| 17 | **Settlement / replay drift** | Yes, on demand | `apps/replay/src/index.ts:126-129` mismatch list; `apps/scheduler/src/index.ts:18-72` eviction. Not scheduled (row 15). |

#### A3.1 Mapping against `packages/liveness`

`packages/liveness/src/index.ts` (395 lines) covers, precisely:

- **Answer/node content staleness**: `foldStaleness` `:24-63`; states
  `FRESH | UNDER_REVIEW | STALE | ARCHIVED_REVIVED` `:5-6`.
- **Review clocks (TTL)**: `ensureReviewClocks` `:269-300`, table `core.review_clock`
  (`migrations/0014_s11.sql:19`).
- **Revision triggers**: `recordTriggerFired` `:164-194`, `watchRevisionTrigger`
  `:196-212`, `resolveRevisionTrigger` `:214-234`; kinds
  `WATCHED_CONDITION | PROVIDER_MODEL_VERSION | CONTRADICTS_PRIOR`
  (`migrations/0014_s11.sql:11`).
- **Provider model-version drift** (the closest thing to a health signal):
  `detectProviderModelVersionTriggers` `:302-342` — a window function over
  `ledger.raw_artifact.model_version` detecting a changed model id per run.
- **Retirement/archival sweep**: `decideRetirement` `:100-116`, `sweep` `:344-394`.
- **Query recency**: `recordQuery` `:121-162`.

It does **not** cover, and must not be extended to cover: process liveness,
queue depth, stuck claims, error rate, exception capture, provider reachability
at call time (that is `core.provider_probe` via `ProviderProbeRepository`, used
at `apps/runner/src/index.ts:1350-1372`), or budget exhaustion.

- **OBS-OPUS-R08** — The new layer MUST treat `packages/liveness` as
  **out of scope and non-overlapping**: it answers "is this *answer* still
  true?", not "is this *system* working?". Extending it would conflate content
  freshness with system health and would drag error data into the
  answer-staleness projection that reaches users.
- **OBS-OPUS-R09** — A **reclaim/reaper** capability MUST exist before the
  listener is armed, or the listener's largest input class (stalled runs) is
  permanently invisible. The stall is already declared law
  (`docs/missions/2026-08-06-v3-programming/handoffs/EXEC-01-codex-handoff.md:195-197`).
- **OBS-OPUS-R10** — The layer MUST detect **absence**: a run in `QUEUED`/
  `CLAIMED` past a bounded deadline, a work item `CLAIMED` past
  `claim_deadline`, and a scheduled job that has not reported within its
  period, are all first-class error events with no thrown exception behind them.
- **OBS-OPUS-R11** — Declared-but-unproducible signals MUST be reconciled: for
  every member of `packages/contract/src/index.ts:19-47`, either a producer
  exists and the DDL permits it, or the member is removed. An observability
  layer built on a vocabulary that half the system cannot emit is a lie.
- **OBS-OPUS-R12** — Silent drops MUST be counted: `apps/api/src/index.ts:651`
  and every analogous "unmappable → skip" path MUST emit a low-severity error
  event rather than returning `[]`.
- **OBS-OPUS-R13** — Subprocess stderr MUST be captured (bounded and redacted),
  not drained (`acceptance/relay-core.ts:100`). This becomes load-bearing the
  moment the listener agent itself runs a CLI relay (RQ-D2).

---

### A4. Existing mechanisms — reuse vs replace

| # | Mechanism | Evidence | Verdict | Rationale |
|---|---|---|---|---|
| 1 | **Dev-JSONL logger** (`apps/ui/lib/observability/logger.ts`) | dead code, A2.2 | **PARTIAL REUSE — extract, do not extend** | Its *sink* (append-only file, `:239-240`) and its *gate* (`:204-218`) belong to the developer diagnostic contract and must stay under the README prohibition. Its **redaction kernel** (`redactForLog` `:88-202`, `SENSITIVE_KEY_PATTERN` `:83-84`, `SENSITIVE_VALUE_PATTERN` `:85-86`, `redactError` `:157-182`, `truncateString` `:188-194`, circular/depth guards `:123-131`) is the only working redactor in the tree and SHOULD be lifted into a shared package for the new capture path. |
| 2 | **README prohibition** (`apps/ui/lib/observability/README.md:18`) | "These logs are developer-only diagnostics. Do not persist them to the database, add migrations or log tables for them, or expose them through user-facing pages, components, or API surfaces." | **RECONCILE, DO NOT REPEAL** | The prohibition is scoped by "These logs" / "them" — the JSONL developer diagnostics. V's order creates a *different* artefact class. Proposed reconciliation: amend the README to state (a) the dev-JSONL sink remains file-only and never DB-persisted; (b) the new operational error store is a separate, explicitly V-ordered class with its own privacy rules; (c) neither may import the other's transport. Repealing the sentence would erase a live guarantee for the diagnostics that still exist. Confidence **HIGH**. Counter-argument: two adjacent redaction implementations will drift — mitigated by R14 (one shared kernel, two sinks). |
| 3 | **`raw_artifact.parse_error` pattern** (`migrations/0004_s04.sql:12-22`) | CHECK pair binding `parse_status` to `parse_error` presence | **REUSE the discipline** | The constraint pair — "a failure status *requires* a non-blank explanation, a success status *forbids* one" — is exactly the invariant the error store needs so that no event can be recorded without its cause. |
| 4 | **`ledger.ledger_entry`** (`migrations/0000_s00.sql:155-173`) | `outcome ∈ {OK,FAILED,BLOCKED,TIMED_OUT,REFUSED,SKIPPED_BY_BUDGET}` `:164`; `call_site_key` `:161`; `input_hash`/`contract_hash` `:166-167`; `started_at`/`finished_at` `:169-170`; `raw_artifact_ref` `:168` | **REUSE as a JOIN target; do NOT extend** | It is a near-miss error store: it has outcome, actor, call site, timing and artifact linkage, but **no message, no stack, no cause, no severity, no fingerprint, no component**. It is also append-only under `core.reject_mutation` (`migrations/0000_s00.sql:317-330`) and rides `ledger.allocate_sequence()`. Adding error columns would (a) mutate an immutable, replay-load-bearing table and (b) put error volume on the global sequence. **Replace with a new table that references it.** |
| 5 | **`evaluator.pipeline_event`** (`migrations/0023_evaluator_foundation.sql:86-99`) | `pipeline`, `pipeline_version`, `attempt_id`, `state ∈ STARTED/SUCCEEDED/FAILED/SKIPPED`, `reason` (non-blank CHECK `:93`), `input_hash` (hex CHECK `:94`), `at_seq`; partial unique index `:97-99` | **REUSE as the schema template** | This is the closest existing shape to what the error store needs, and its "receipt is best-effort, never changes product behaviour" discipline (`packages/evaluator/src/index.ts:431-433`, `1424-1426`, `1963-1965`) is the right isolation posture (RQ-B5). Its gap: no severity, no fingerprint, no cause chain, and `run_id NOT NULL` (`:88`) — the error store must accept run-less errors. |
| 6 | **`core.work_item.terminal_reason`** (`migrations/0000_s00.sql:108, 112`) | `CHECK (state <> 'FAILED' OR terminal_reason IS NOT NULL)` | **KEEP as product state; SUPERSEDE as diagnostics** | It is a lifecycle field, not an error record. It must keep working (the UI reads it via `apps/api/src/index.ts:629-640`), but the error event becomes the authoritative diagnostic. |
| 7 | **`core.provider_probe`** (`migrations/0022_dr181_discovery.sql:1`) + `ProviderProbeRepository` | written `apps/runner/src/index.ts:1350-1358` (ABSENT) and `:1363-1371` (HEALTHY); read `apps/api/src/main.ts:72-85` | **REUSE** | Already an availability-event table with `state`, `failure_code`, `probed_at`. It is the model for how a health signal is stored. The error store should reference probe evidence rather than duplicate it. |
| 8 | **`register` policy-read pattern** | `packages/register/src/runtime-environment.ts:3-7` (`z.object(shape).strict().parse`), `readLivenessPolicy`, `readAuthPolicy` etc. | **REUSE** | Retention windows, severity thresholds and rate caps for the listener must be **register rows with provenance**, matching how every other threshold in this system is ruled (AC-76/DR-039 discipline visible at `apps/runner/src/index.ts:1245-1248`). |
| 9 | **`acceptance/` harness** | `acceptance/README.md:1-9` ("no product package imports it"; outside the reachability walk with roots `apps/api/src/main.ts`, `apps/runner/src/main.ts`, `apps/scheduler/src/cli.ts`); embedded Postgres `acceptance/standing-db.ts:32-90`; CLI relays `acceptance/relay-core.ts` | **REUSE as the firing fixture; do NOT make product depend on it** | It is the only place a full run executes end-to-end (`acceptance/main.ts:224-300+`). It is therefore the natural home of the acceptance criteria for each rollout phase (RQ-D6). But it is *also* where the only lawful model access lives — see RQ-D2, which is a genuine architectural tension. |
| 10 | **`tools/orphan-audit`** (`tools/orphan-audit/src/index.ts`, 758 lines) | `auditSurfaceReachability` `:303`, `auditSourceRules` `:443`, `auditOrphans` `:528`, `auditMigrationReplaySafety` `:416` | **REUSE as a guard** | It already enforces "no orphaned modules". Extending it to assert "every declared error code has a producer and a registry entry" and "no new module is orphaned" is a cheap, existing lever — and it is the mechanism that *would have caught* the detached observability module. |

- **OBS-OPUS-R14** — One redaction kernel, two sinks. The redactor lifted from
  `apps/ui/lib/observability/logger.ts:88-202` MUST be the single
  implementation used by both the surviving developer JSONL and the new error
  store. Divergent redactors are how private content escapes.
- **OBS-OPUS-R15** — The error store MUST be a **new** table family, not a
  column set added to `ledger.ledger_entry`, `core.run_progress_event` or
  `core.work_item`. Those three are append-only, replay-load-bearing and on the
  global sequence.

---

### A5. A grounded error taxonomy

Derived from A1–A4 evidence, not invented. Each row cites where the class is
observable in the current tree.

#### A5.1 Categories

| Category | Definition | Present-tree instances |
|---|---|---|
| `CONFIG` | A required register row, environment value or wiring dependency is missing or invalid at composition time | `JUDGEMENT_POLICY_UNRESOLVED`, `SERVE_POLICY_UNRESOLVED`, `SCORING_OPERATOR_UNRESOLVED`, `CLAIM_TYPE_COMPOSITION_MAP_UNRESOLVED`, `RUN_HOLD_RECORDER_UNRESOLVED`, `TERMINAL_ACTIVATION_EVALUATOR_UNRESOLVED` (`apps/runner/src/index.ts:1219-1249, 1276-1279, 2362-2368`); `DIALECTICAL_API_BASE_REQUIRED` (`apps/ui/lib/serverApi.ts:18-20`, `apps/ui/app/api/[...path]/route.ts:11`); Zod env failures (`packages/register/src/runtime-environment.ts:3-7`) |
| `TRANSPORT` | A network/IPC call failed or timed out before a well-formed response existed | `PROVIDER_CALL_FAILED` (`packages/providers/src/index.ts:46-60`, `:380-385`); `API_UPSTREAM_UNREACHABLE` (`apps/ui/app/api/[...path]/route.ts:53-59`); `NETWORK_FAILURE` (`packages/contract/src/client.ts:94-96`); `CliRelayFailure` (`acceptance/relay-core.ts:25-30`) |
| `CONTRACT` | A response arrived but violated its declared shape | `PROVIDER_CONTENT_UNACCEPTED` (`packages/providers/src/index.ts:62-75`); `PARSE_FAILED`/`SCHEMA_FAILED` (`apps/runner/src/index.ts:870-881`); `COMPOSITION_CONTRACT_ERROR`, `CONFORMANCE_CONTRACT_ERROR`, `POST_COMPOSE_R9_CONTRACT_ERROR` (`apps/runner/src/index.ts:2260, 2311, 2333`); `INVALID_RESPONSE` (`packages/contract/src/client.ts:100-102`); `MALFORMED_REQUEST` (`apps/api/src/index.ts:107-123`) |
| `PERSISTENCE` | The database rejected, lost, or could not serve a write/read | `DATABASE_POOL_FAILED` (`packages/db/src/index.ts:14-18`); `SEQUENCE_ALLOCATION_FAILED` (`packages/db/src/index.ts:181`); `EDGE_INTEGRITY_ERROR` (`packages/graph/src/index.ts:328-331`); `core.reject_mutation` raises SQLSTATE `55000` (`migrations/0000_s00.sql:31-39`) |
| `DOMAIN_INVARIANT` | A ruled invariant of the algorithm was violated — the largest class | `STRENGTH_LINEAGE_UNRESOLVED`, `EMPTY_PROPAGATION`, `NO_USABLE_JUDGEMENTS`, `COMPOSITION_UNRESOLVED`, `FIXED_SINGLE_ROOT_SERVE_VIOLATED`, `GRAPH_CYCLE_WRITE_REJECTED`, `SETTLEMENT_RACE_WITHOUT_WINNER` (`apps/runner/src/index.ts:1987, 2361, 1471, 1463, 966, :2469`; `packages/graph/src/index.ts:299`) |
| `BUDGET` | A ruled spend or attempt ceiling was reached | `CALL_BUDGET_EXHAUSTED` (`apps/runner/src/index.ts:2551`), `RUN_COST_ENVELOPE_EXHAUSTED` (`apps/runner/src/index.ts:2344`), `MEMORY_PULL_CAP_EXCEEDED` (`packages/memory/src/index.ts:131`) |
| `AVAILABILITY` | A configured dependency was pinned but absent at use time | `RUN_DISCOVERED_PANEL_EMPTY_AT_CLAIM`, `MAKER_POSITION_UNAVAILABLE`, `NODE_REVIEW_UNAVAILABLE`, `DIFFERENT_MAKER_REVIEWER_UNAVAILABLE` (`apps/runner/src/index.ts:1376, 1451, 1790, 123`); `CLAIM_PROVIDER_ABSENT` / `CLAIM_MODEL_IDENTITY_CHANGED` / `CLAIM_PROVIDER_PROBE_FAILED` (`apps/runner/src/index.ts:1340, 1345, 1349`) |
| `STALL` | No error was thrown; expected progress did not occur within a bound | `PROCESS_DEATH_STALL` (A3 #1); an SSE stream that never reconnects (A3 #11); an unscheduled job (A3 #15) |
| `SILENT_LOSS` | An error existed and was discarded | every site in RQ-C3 |
| `SECURITY_ZONE_BOUNDARY` | An error crossed the boundary out of the excluded zone | `AuthFlowError` reaching the shared handler at `apps/api/src/index.ts:179` — see RQ-B6 |

#### A5.2 Severities (derived, not invented)

| Severity | Ruling test grounded in the tree |
|---|---|
| `FATAL` | The process cannot continue: boot-time `CONFIG` failures (`apps/api/src/main.ts:30-48`), `DATABASE_POOL_FAILED` terminal latch (`packages/db/src/index.ts:67, 77`) |
| `ERROR` | A user-visible unit of work failed and will not self-heal: any runner terminal failure (`apps/runner/src/index.ts:2514-2518`), any API 500 (`apps/api/src/index.ts:184`) |
| `DEGRADED` | Work completed but with a ruled honesty mark: the entire `CONDITION_MARKS` vocabulary (`packages/kernel/src/index.ts:69-111`) — notably `CRITIQUE-UNAVAILABLE`, `HIDDEN-UNJUDGEABLE`, `UNAUTHORED-BRANCH-HALTED`, `ENVELOPE_EXHAUSTED`, `OWED-CHECK-UNEXECUTED`. **This vocabulary is the system's own, already-ruled severity ladder for partial failure and MUST be reused rather than paralleled.** |
| `WARN` | A retryable attempt failed but the unit continued: `outcome IN ('FAILED','TIMED_OUT')` ledger entries that were followed by an `OK` at the same `call_site_key` (`packages/ledger/src/index.ts:517+` `countModelAttempts`) |
| `SUSPICIOUS` | Success-shaped output that violates a product-truth expectation: `apps/ui/lib/observability/suspiciousScoring.ts:86-116` (`empty_output`, `missing_required_fields`, `missing_artifact_chain`) |

#### A5.3 Component attribution

The attribution key must be **structural**, not free-text. The tree already
supplies the vocabulary:

- **process** ∈ {`api`, `runner`, `scheduler`, `replay`, `ui-server`,
  `ui-client`, `evaluator-worker`} — from the app directories.
- **package** — the workspace package name (`@debateai/*`) from
  `pnpm-workspace.yaml:1-6`.
- **call_site_key** — already a first-class, structured, stable string in the
  runner and provider layers: `"JUDGE"`, `"JUDGE:root:secondary"`,
  `"JUDGE:root:${n}"`, `"JUDGE:review:${nodeId}"`,
  `"JUDGE:${role}:root${r}:r${round}:p${parent}"`,
  `"JUDGE:cross-root:${a}->${b}"`, `"COMPOSER:${attempt}"`,
  `"CONFORMANCE:${attempt}:${index}"`, `"POST_COMPOSE_R9:${attempt}"`,
  `reviewCatchUpCallSiteKey()` (`apps/runner/src/index.ts:1435, 1697, 1722, 1752, 1840, 1877, 2251, 2302, 2324, 465-467`). It is stored on
  `ledger.ledger_entry.call_site_key` (`migrations/0000_s00.sql:161`).
- **organ/role** ∈ `MODEL_ROLES` (`packages/providers/src/index.ts:5`) and
  `Lane` (`:7`).

- **OBS-OPUS-R16** — Severity MUST reuse `CONDITION_MARKS`
  (`packages/kernel/src/index.ts:69-111`) for the DEGRADED band rather than
  minting a parallel vocabulary. The system already rules how partial failure
  is named; a second ladder would let the two disagree about the same run.
- **OBS-OPUS-R17** — Component attribution MUST be `(process, package,
  call_site_key, organ)` as structured columns, because `call_site_key` is
  already stable, already stored, and already the join key the listener needs
  to reach the ledger and the raw artifact.

---

## RQ-B — Error capture and the error store

### B1. Required capture points

| # | Capture point | Where it must attach (present-tree anchor) | Why it is required |
|---|---|---|---|
| B1.1 | **Process-level `uncaughtException` + `unhandledRejection`** | Each of `apps/api/src/main.ts`, `apps/runner/src/main.ts`, `apps/scheduler/src/cli.ts`, `apps/replay/src/cli.ts` | Zero exist today (A1.1). Without these, a crash is invisible. |
| B1.2 | **Process lifecycle** (start, ready, SIGTERM/SIGINT, exit code) | same entry points | Distinguishing "crashed" from "restarted" from "never started" is impossible today. Only `acceptance/run-acceptance.ts:386-387` handles signals. |
| B1.3 | **HTTP error handler** | `apps/api/src/index.ts:158-191` — the single existing `setErrorHandler` | The one funnel every API error already passes through. Must record before replying. Note the `reply.sent` branch (`:159-176`) currently returns without recording anything. |
| B1.4 | **HTTP request boundary** (status ≥ 400, plus duration) | a Fastify `onResponse` hook alongside the `preHandler` at `apps/api/src/index.ts:145-157` | 4xx patterns are the earliest signal of a broken client contract; Fastify's own logger is off (`:143`) so nothing observes them. |
| B1.5 | **SSE stream lifecycle** | `apps/api/src/index.ts:333-344` | Aborted, empty (`:641`) and dropped-event (`:651`) streams are all silent today. |
| B1.6 | **Job/queue wrapper** | `declareHatchetWalkingSkeletonTask` `apps/runner/src/index.ts:2504-2526` | The single runner funnel; must capture *before* `recordTerminalFailure` so the record survives the race at `:2519-2521`. |
| B1.7 | **Work-item lifecycle transitions** | `packages/battery/src/index.ts:269-311` (claim), `:358-369` (settle), `:379-396` / `:398-417` (fail) | The claim/settle/fail triple is the run's health signal; a claim with no matching settle within bound is the stall detector (R10). |
| B1.8 | **Provider-call wrapper** | `packages/providers/src/index.ts:195-386` (attempt loop) and the budget wrapper `apps/runner/src/index.ts:2540-2557` | Already ledgers outcome; must additionally emit an error event carrying the HTTP status (`:284`), the timeout classification (`:352`) and the attempt index. |
| B1.9 | **DB error path** | `packages/db/src/index.ts:14-28` (`typedPoolFailure`/`typedQueryFailure`), `:69-72` (pool error), `:154-170` (`withWriteTransaction` rollback) | The rollback at `:164-167` currently swallows any secondary failure from `ROLLBACK` itself and rethrows only the original. |
| B1.10 | **Migration path** | `packages/db/src/index.ts:123-152` | A partially-applied migration is a silent, high-blast-radius failure. |
| B1.11 | **Client (browser) error reporting** | `apps/ui/components/ScoringErrorBoundary.tsx` (needs `componentDidCatch`), plus a root `error.tsx`/`global-error.tsx` which do not exist, plus `window.onerror`/`unhandledrejection` | Every client failure today terminates in a React state string (`apps/ui/app/debate/[id]/DebatePageClient.tsx:479-486, 501-509, 521-528, 594-601, 653-662, 685-688`) and is never reported. |
| B1.12 | **UI proxy** | `apps/ui/app/api/[...path]/route.ts:50-60` | The bare catch at `:53` destroys the only evidence of why the upstream was unreachable. |
| B1.13 | **Subprocess wrapper** | `acceptance/relay-core.ts:80-130` | stderr discarded at `:100`; exit code known at `:110` but never recorded. |
| B1.14 | **Scheduled-job heartbeat** | `apps/scheduler/src/cli.ts:15-24` | A job must record start and end; absence of an end within its period is a `STALL` event (R10). |

- **OBS-OPUS-R18** — Capture MUST be implemented as **wrappers at existing
  seams** (B1.3, B1.6, B1.8, B1.9), never as call-site edits scattered through
  domain code. The tree already funnels almost every error through four places;
  a scattered instrumentation pass is what rotted last time (A2.2).
- **OBS-OPUS-R19** — Capture MUST be **idempotent and de-duplicating across
  layers**: one provider timeout currently produces a ledger entry
  (`packages/providers/src/index.ts:353`), a `ProviderCallFailedError`
  (`:380`), a hold record (`apps/runner/src/index.ts:201-214`), a condition
  mark (`:2147-2162`) and a terminal reason (`:2514-2518`). Without a shared
  incident id these become five unrelated "errors" for the listener to chase.

### B2. Error-event schema requirements for root traceability

**Mandatory on every event** (absence is itself a defect the store must reject):

| Field | Requirement | Why mandatory / present-tree gap |
|---|---|---|
| `event_id` | Unique, generated at capture | — |
| `occurred_at` | Wall-clock instant, capture-time | `core.run_progress_event` has **no timestamp column at all** (`migrations/0000_s00.sql:68-74`) — only `at_seq`. An error store without a clock cannot answer "when did this start". |
| `sequence` | Monotonic ordering | **Must NOT be `ledger.allocate_sequence()`** — see B3. |
| `severity` | From A5.2 | — |
| `category` | From A5.1 | — |
| `code` | From the registry (R05) | 173 static codes + an unbounded dynamic tail today |
| `message` | Redacted, length-bounded | — |
| `stack` | Redacted, frame-bounded | **Discarded everywhere today** — `runnerTerminalFailureReason` (`apps/runner/src/index.ts:2488-2492`) keeps only the code |
| `cause_chain` | Ordered list of `{code, message, stack}` | **Structurally impossible today**: `TypedDomainError` has no `cause` (`packages/kernel/src/index.ts:283-288`); only `ProviderCallFailedError` carries one (`packages/providers/src/index.ts:48, 58`) |
| `process` | `api|runner|scheduler|replay|ui-server|ui-client|listener` | — |
| `package` | `@debateai/*` | — |
| `call_site_key` | Nullable; the existing structured key | `migrations/0000_s00.sql:161` |
| `build_ref` | Commit SHA / build id of the running code | **ZERO support today.** A grep for `GIT_SHA|COMMIT_SHA|BUILD_ID|buildVersion|APP_VERSION|GIT_COMMIT` across `apps/`, `packages/`, `web/`, `tools/` returns **nothing**. The version-skew incident class named in the brief is currently undiagnosable — you cannot tell which code produced an error. |
| `register_version` | The sealed register version in force | Already threaded: `apps/api/src/main.ts:35, 44-48`, `apps/runner/src/main.ts:17` |
| `environment` | `development|acceptance|production` | Only `NODE_ENV` exists (`apps/ui/lib/observability/logger.ts:217`, `acceptance/relay-core.ts:72`) |
| `fingerprint` | Stable dedup hash over `(code, normalised stack head, component)` — **not** over the message | Messages carry ids (`apps/runner/src/index.ts:1567`, `:1820`) and would defeat grouping |
| `first_seen_at` / `last_seen_at` / `occurrence_count` | On the **group**, not the event | Required so the listener acts on a class once, not per occurrence (D4 rate caps) |

**Correlation ids — present availability, per runtime:**

| Id | Available where | Gap |
|---|---|---|
| `run_id` | Runner: `run.runId` throughout (`apps/runner/src/index.ts:1257+`). API: only inside handlers holding the id (`apps/api/src/index.ts:333, 345`). Provider: `request.runId` (nullable, `packages/providers/src/index.ts:33`) | Not ambient — there is **no async-context propagation**. The one `AsyncLocalStorage` in the tree carries a boolean (`packages/db/src/index.ts:8`), proving the mechanism is available and already imported. |
| `work_item_id` | `claimed.workItemId` (`apps/runner/src/index.ts:1253+`); `subjectItemId` on every provider call | — |
| `attempt_id` | `runnerAttemptId = randomUUID()` (`apps/runner/src/index.ts:1256`); per-call `attemptId` (`packages/providers/src/index.ts:215`) | Two different granularities share a name |
| `node_id` | Present at graph writes (`apps/runner/src/index.ts:1473-1495`) | — |
| `request_id` | Fastify `request.id` — used **only** inside the security zone (`apps/api/src/index.ts:203`); product routes never touch it | Must be adopted for product routes and returned to the client |
| `session_id` / `asker_id` | `request.session` (`apps/api/src/index.ts:152-156`); derived by SHA-256 of the dev token (`:130-140`) | These are **pseudonymous but user-linking** — see B4 |
| `propagation_run_id` | `apps/runner/src/index.ts:1965` | — |
| `raw_artifact_ref` / `ledger_entry_ref` | Returned by every provider call (`packages/providers/src/index.ts:77-85`) | The bridge from an error to the exact model exchange |

- **OBS-OPUS-R20** — A `build_ref` MUST be baked into every process at build
  time and stamped on every error event. Without it the version-skew class is
  undiagnosable and the listener agent cannot know whether an error came from
  code its own previous fix already changed. **This is the single highest-value
  missing field.**
- **OBS-OPUS-R21** — Correlation ids MUST propagate ambiently via
  `AsyncLocalStorage` (already a dependency, `packages/db/src/index.ts:2`),
  carrying at minimum `{request_id | run_id, work_item_id, attempt_id,
  build_ref}`. Threading them by hand through 40 files is how they rot.
- **OBS-OPUS-R22** — For RQ-C2's procedure to **terminate**, every event MUST
  carry: `code`, `component (process+package+call_site_key)`, `build_ref`,
  `cause_chain` (possibly length 1), and **at least one** of
  `{run_id, work_item_id, request_id}`. An event lacking all three correlation
  ids is admissible only with `category=CONFIG` at process scope; otherwise the
  store rejects it and records a meta-error.
- **OBS-OPUS-R23** — `fingerprint` MUST be computed at capture time from a
  normalised (id-stripped, path-relativised) projection, and MUST be stable
  across restarts and across `build_ref` changes that do not touch the frame.

### B3. Storage requirements

| # | Requirement | Evidence / rationale |
|---|---|---|
| B3.1 | **A new schema (`obs.` or equivalent) with its own tables.** Minimum three: an event table, a group/fingerprint table (first/last seen, count, state), and an agent-action audit table (D4). | A4 #4/#5: no existing table can absorb this without mutating immutable, replay-load-bearing structures. |
| B3.2 | **The error tables MUST NOT use `ledger.allocate_sequence()`.** | `migrations/0000_s00.sql:9-29`: the allocator is a **single-row table** (`singleton boolean PRIMARY KEY`) updated per call. Every append-only insert in the system takes a row lock on it. Error volume is unbounded and bursty by nature (one bad deploy = thousands of events); routing it through the global serialiser would make the observability layer a system-wide write bottleneck and would directly violate B5. Use a dedicated Postgres sequence or a time-ordered id. **Confidence HIGH.** Counter-argument: replay/ordering guarantees elsewhere depend on the global sequence — but error events are *not* replay inputs and need only per-stream ordering. |
| B3.3 | **The error tables MUST NOT carry `core.reject_mutation`.** | `migrations/0000_s00.sql:31-39, 314-331`: the trigger raises SQLSTATE `55000` on any `UPDATE`/`DELETE`. Group aggregation (`last_seen_at`, `occurrence_count`, triage state) requires `UPDATE`, and any retention policy (E4) requires `DELETE`. Deliberately excluding these tables from the trigger loop is the only way both are possible. |
| B3.4 | **Write-path resilience: the DB cannot be the only sink.** | The failing component *will* be the DB (`DATABASE_POOL_FAILED`, `packages/db/src/index.ts:14-18`; the terminal latch at `:67, 77, 98` makes every subsequent query reject immediately). A DB-only error store is blind exactly when it matters most. Required: a **local append-only fallback sink** (file, bounded, rotated) that the capture path writes to when the DB write fails or when the pool is latched, plus a drain that replays the fallback into the store on recovery. The dev logger already proves the fallback shape (`apps/ui/lib/observability/logger.ts:239-240`). |
| B3.5 | **Write path MUST be asynchronous and out-of-transaction.** | `assertNoOpenWriteTransaction` (`packages/db/src/index.ts:172-176`) already establishes that certain work may not run inside a write transaction. An error write inside a failing transaction would be rolled back with it — the exact case where the record is needed. Errors must be buffered and flushed on a separate connection. |
| B3.6 | **Bounded buffer with explicit drop accounting.** | When the buffer is full, the layer drops **and records the drop count** as a meta-event. Silent drop is the failure mode this whole mission exists to end. |
| B3.7 | **Volume and rate bounds must be register-ruled, not literal.** | Matching the AC-76/DR-039 discipline visible at `apps/runner/src/index.ts:1245-1248`. Concrete anchors for V's ruling: today's per-run model-attempt ceiling is register-derived (`computeStructuralCeilingBasis`, `apps/api/src/main.ts:87-95`), and a single acceptance run at depth 5 with 3 makers is already large (`acceptance/main.ts:221-222`). Absolute volume `UNVERIFIED` — no production traffic data exists in the repo. |
| B3.8 | **Indexes the listener needs.** | (a) `(state, severity, last_seen_at DESC)` on the group table — the listener's poll query; (b) unique on `fingerprint`; (c) `(occurred_at DESC)` on the event table for the trace window; (d) `(run_id)`, `(work_item_id)`, `(request_id)` partial-where-not-null for the lineage walk (C2); (e) `(build_ref, fingerprint)` for regression detection. Model the partial-unique-index pattern on `migrations/0023_evaluator_foundation.sql:97-99`. |
| B3.9 | **Retention under DR-188.** | See E4. The requirement here is structural: retention MUST be expressible as a policy row with provenance and MUST be *possible* — which is why B3.3 matters. Error events are **operational telemetry about the system, not product data**; but that classification is V's to make, not mine. |
| B3.10 | **Least-privilege roles.** | `migrations/0000_s00.sql:290-312` establishes `debateai_runtime` (SELECT/INSERT, narrow UPDATE) and `debateai_replay` (SELECT). The error store needs a third posture: runtime processes get INSERT-only; the listener agent gets SELECT + narrow UPDATE on group triage state; **nothing** gets DELETE except a V-gated retention role. |

### B4. Privacy and redaction requirements

Binding inputs: private-by-default, crypto-shredding erasure, and the
prohibition on leaking debate content, secrets, tokens, cookies, private
prompts or raw provider payloads into ops surfaces.

| # | Requirement | Present-tree evidence of the hazard |
|---|---|---|
| B4.1 | **NEVER store: raw provider payloads.** The store references `ledger.raw_artifact.raw_artifact_id` instead. | Raw text already lives in `ledger.raw_artifact.raw_text` (`migrations/0000_s00.sql:148`) under the existing access regime. Copying it into an ops surface would create a second, differently-governed copy of the same private content — and would break crypto-shredding, which can only erase what it knows about. |
| B4.2 | **NEVER store: `question_line`, node `statement_text`, composed segment text, memory sentences.** | These are the debate content itself. They are routinely embedded in error *messages* today: `apps/runner/src/index.ts:1693-1696, 1718-1721, 1824-1836, 1871-1876` build prompts from `run.questionLine` and `parent.statement`; `packages/memory/src/index.ts:234-241` throws with sentence context. Any capture that serialises `error.message` unmodified will exfiltrate debate content. |
| B4.3 | **NEVER store: tokens, cookies, authorization headers, KEK/DEK material, connection strings.** | `apps/api/src/index.ts:152` reads `x-user-dev-token`; `packages/providers/src/index.ts:221-222` sets an `authorization` header; `apps/api/src/main.ts:31-33` loads key material. The existing `SENSITIVE_KEY_PATTERN` (`apps/ui/lib/observability/logger.ts:84`) already covers `api_key|auth|bearer|cookie|password|private_key|provider_payload|prompt|token|secret` and `SENSITIVE_VALUE_PATTERN` (`:86`) covers inline `sk-…`/`bearer …` forms. |
| B4.4 | **Redaction MUST be enforced at capture time, in one place, before the value leaves the process** — not at read time and not at the sink. | A read-time redactor cannot un-write a leaked row, and DR-188 plus `core.reject_mutation` may make the row unremovable. |
| B4.5 | **Redaction MUST be default-deny for free-text fields.** `message` and `stack` are the two highest-risk fields; they MUST pass through the redactor with depth/length caps (`apps/ui/lib/observability/logger.ts:76-81`) and MUST be truncated. | — |
| B4.6 | **`asker_id`/`session_id` are pseudonymous but user-linking and MUST be treated as personal data.** | `apps/api/src/index.ts:130-140`: both are `sha256(token)`-derived and stable per token. They are a durable user identifier. Their presence in an error store creates a per-user error trail that the erasure regime must be able to reach. |
| B4.7 | **The store MUST be reachable by the erasure regime.** Every user-linking column MUST be enumerated in the error store's own schema documentation so a future erasure pass can find it. | Concretely this means the design must state, per column, whether it is user-linked; not doing so is how a "shredded" user leaves a readable trail in ops data. |
| B4.8 | **The API MUST stop returning internal messages to clients.** | `apps/api/src/index.ts:189` returns `message: knownError.message` on **every** status including 500 — a `DATABASE_POOL_FAILED` message contains the underlying PostgreSQL text (`packages/db/src/index.ts:17`). |
| B4.9 | **Client-side capture MUST redact before transmission**, and MUST NOT transmit DOM content, form values, or local storage. | `apps/ui/app/debate/[id]/DebatePageClient.tsx` holds the full answer, node statements and synthesis draft in component state. |
| B4.10 | **Zod validation errors are comparatively safe but not proven safe for all issue codes.** | Verified empirically against the pinned `zod@4.4.3`: `too_small`, `invalid_value` (enum) and `unrecognized_keys` echo the **path and the constraint**, not the value; `invalid_type` echoes a `received` **type descriptor** (`"NaN"`), not the value. `UNVERIFIED` for the remaining issue codes. Requirement: Zod messages MUST still pass through the redactor rather than being trusted. |

### B5. Overhead and failure isolation

| # | Requirement | Rationale / anchor |
|---|---|---|
| B5.1 | **The capture path MUST be total.** A throw inside capture MUST NOT propagate. | The pattern is already established and correct in three places: `apps/ui/lib/observability/logger.ts:226-244` ("Developer observability must never interrupt product flow"), `apps/ui/lib/observability/suspiciousScoring.ts:137-141` ("observability must never break product flow (FR6)"), `packages/evaluator/src/index.ts:431-433` / `1424-1426` / `1963-1965` ("receipts are best effort"). |
| B5.2 | **The capture path MUST NOT block the hot path.** Enqueue-and-return; flush on a timer or size threshold from a separate connection. | Both the API request path and the runner's provider path are latency-bearing (`packages/providers/src/index.ts:227` deadlines; `assertClaimCoversCall` at `apps/runner/src/index.ts:1210-1218` proves claim windows are tightly budgeted against deadlines — an added synchronous write could push a call past its claim). |
| B5.3 | **Bounded cost budget.** Capture MUST add no more than a small, register-ruled fraction of the enclosing operation's deadline, and MUST be measurable. | The exact fraction is V's to rule; I recommend ≤1 % of `JUDGE_DEADLINE_MS` per captured event as the ceiling, with the ceiling itself a register row. |
| B5.4 | **Backpressure: bounded queue, drop-oldest-lowest-severity, count the drops.** `FATAL`/`ERROR` events are never dropped while any lower-severity event remains in the buffer. | — |
| B5.5 | **Degradation ladder, explicitly ruled:** (1) DB store → (2) local fallback sink → (3) in-memory counters only → (4) drop with a counted meta-event. The product path behaves identically at every rung. | B3.4 |
| B5.6 | **The observability layer MUST NOT create new failure modes for the product.** Specifically: no new synchronous DB call on the request path, no new required environment variable that fails boot when absent, no new lock. | A required env var would convert "observability misconfigured" into "product down" — the exact inversion this mission must avoid. |
| B5.7 | **The layer MUST be independently disableable at runtime** without redeploying the product. | Mirrors the `DEV_OBSERVABILITY` gate (`apps/ui/lib/observability/logger.ts:209-217`), but as a register row rather than an env var, so it is auditable. |
| B5.8 | **Self-observation must not recurse.** An error thrown by the capture path itself is recorded as a bounded, rate-limited meta-event, never through the normal path. | `packages/db/src/index.ts:67-72` shows the latch idiom: record once, then suppress. |

### B6. The security-zone boundary rule

#### B6.1 The boundary, mapped precisely

**Inside the excluded zone:**

- `apps/api/src/registration.ts` (1084 lines) — `AuthFlowError` (`:42-58`),
  `InProcessAuthRateLimiter` (`:73-309`), `RegistrationService` (`:399-1084`).
- `apps/api/src/mail-channel.ts` — `MailDeliveryError`, `SendmailMailSender`.
- `packages/db/src/identity.ts` — `PostgresIdentityRepository` (`:71`), audit
  events (`:198, 238`).
- `packages/register/src/auth-policy.ts` — `readAuthPolicy`.
- `packages/crypto/src/index.ts` — KEK/DEK/argon2/blind-index (`:418-425`
  `verifyPassword`, `:304-312` audit-chain verify).
- `migrations/0030_identity_foundation.sql`, `0031_registration_verification.sql`,
  `0032_registration_audit_erasure_checks.sql`,
  `0033_verification_token_credentials.sql` — schema `identity.*` +
  `delivery_error`.

**The exact seams where zone errors cross into shared code:**

| Seam | Location | Nature |
|---|---|---|
| S1 | `apps/api/src/index.ts:42-45` | `import { AuthFlowError, type RegistrationApplication } from "./registration.js"` — the only type-level import |
| S2 | `apps/api/src/index.ts:179` | `const authFlow = knownError instanceof AuthFlowError;` — **the shared error handler branches on a zone error class**. Instrumenting `setErrorHandler` (B1.3) *necessarily* observes zone errors. |
| S3 | `apps/api/src/index.ts:184, 188` | The status/code selection consults `knownError.statusCode` and `knownError.code` from the zone class |
| S4 | `apps/api/src/index.ts:193-235` | The three `/v1/auth/*` routes, registered on the same Fastify instance as every product route |
| S5 | `apps/api/src/main.ts:26-27, 31-33, 36, 49-65` | Composition-root wiring; a boot failure here is indistinguishable from a product boot failure at the process level |
| S6 | `packages/db/src/index.ts:598-603` | `packages/db` **re-exports** `PostgresIdentityRepository` from `./identity.js`. The pool, transaction and error-classification code (B1.9) is shared by both zones; a `DATABASE_POOL_FAILED` raised during a registration query is produced by shared code |
| S7 | `apps/runner/src/main.ts:2, 13` | `loadKek` imported from `packages/crypto` **by relative deep path** (`"../../../packages/crypto/src/index.js"`, not the workspace alias) — crypto is shared with the runner |

**Consequence:** the zone is **not** cleanly separable at the capture layer.
Two of the highest-value capture points (S2, S6) are *inside shared code that
the zone flows through*.

#### B6.2 The proposed operational rule

- **OBS-OPUS-R24 — Capture at the boundary, minimise inside, never act.**
  Three tiers:
  1. **Shared-seam capture (ALLOWED).** Capture points that exist in shared
     code (`apps/api/src/index.ts:158-191`, `packages/db/src/index.ts:14-72`,
     the process-level handlers) capture *whatever reaches them*, including
     errors that originated in the zone. Adding a zone-specific exclusion
     branch would itself be a modification of the shared handler's semantics
     and would create a blind spot in the product's own error handling.
  2. **Zone-originated events are minimised at capture.** An event whose
     `package`/`call_site_key` resolves into the zone is stored with
     `zone=EXCLUDED` and with `message`, `stack` and `cause_chain` **reduced to
     the code alone** — no free text, no frames. Rationale: registration errors
     are precisely where credentials, emails and timing signals live, and
     `apps/api/src/registration.ts` deliberately uses uniform-response and
     constant-time patterns (`:429`, `:566`, `:594`, `:621`, `:657`) that a
     verbose error store would undo by publishing the discriminating detail.
  3. **No instrumentation inside the zone; no listener action on the zone.**
     No new capture call is added to any file in the zone list. The listener
     agent MUST treat `zone=EXCLUDED` events as **report-only, always**: no
     auto-fix, no PR, no trace beyond naming the boundary. This is bounded
     below by the spine §9 immutable high-risk floor
     (`docs/agent-protocols/debateai-heartbeat-protocol.md:374-377`), which
     already makes security/auth always-escalate.
- **OBS-OPUS-R25** — The `zone=EXCLUDED` classification MUST be derived from a
  **declared path list held outside the zone** (so the zone's own files are not
  edited to declare themselves), and the list MUST be enforced by a test in the
  `tools/orphan-audit` family (A4 #10) so the boundary cannot silently drift as
  the accounts mission resumes.
- **OBS-OPUS-R26** — The design MUST NOT disturb the stopped accounts mission's
  resume points. Concretely: no edit to any file in the zone list, no change to
  migrations `0030..0033`, and no new migration that alters `identity.*`.

Confidence in R24: **MEDIUM-HIGH**. **Strongest counter-argument:** capturing
zone errors at all — even code-only — creates an ops-visible signal about
authentication failures (e.g. a spike in `VERIFICATION_TOKEN_INVALID`) that an
attacker with ops access could use as an oracle, and it puts data *about* the
excluded zone into a store the excluded mission never reviewed. The alternative
(fully exclude: the shared handler checks `instanceof AuthFlowError` and
records nothing) is cleaner for the zone but leaves the product's own error
handler with an untested silent branch and makes a registration-path DB outage
invisible. I judge tier-2 minimisation the better trade, but this is genuinely
V's call — recorded as **E5**.

---

## RQ-C — Root-cause traceability

### C1. Code-level requirements for machine-traceable roots

| # | Requirement | Present-tree gap |
|---|---|---|
| C1.1 | **`TypedDomainError` MUST accept and carry a `cause`.** | `packages/kernel/src/index.ts:283-288`: `constructor(readonly code: string, message: string) { super(message); … }` — **no cause parameter, no `{ cause }` option passed to `super`**. This single omission severs the chain at every wrap in the system. |
| C1.2 | **Every wrap site MUST pass the original error as `cause`.** | Confirmed cause-dropping wraps: `packages/graph/src/index.ts:328-331` (`EDGE_INTEGRITY_ERROR` keeps only `error.message`); `apps/runner/src/index.ts:862-868` (`parseContent` keeps only the message); `:892-905` (`callWithContentContract` keeps only `error.lastParseError`); `apps/api/src/index.ts:107-123` (`MalformedRequestError` keeps only the message and drops the ZodError object); `apps/runner/src/index.ts:2488-2492` (collapses to a string). The one correct example to follow is `ProviderCallFailedError` (`packages/providers/src/index.ts:46-60`), which stores `cause` explicitly. |
| C1.3 | **Re-throw MUST NOT replace.** A handler that cannot record must still propagate the original. | `apps/runner/src/index.ts:2519-2521` replaces the original error with `RUNNER_FAILURE_STATE_NOT_RECORDED`. `apps/runner/src/index.ts:1783-1793` replaces *any* non-allowlisted error from the review path with `NODE_REVIEW_UNAVAILABLE`, discarding the original — including, e.g., a `DATABASE_POOL_FAILED`. |
| C1.4 | **Correlation MUST be ambient, not threaded.** | B2/R21. |
| C1.5 | **Run lineage MUST be reachable from any error.** | Already largely true structurally: `core.work_item.run_id` (`migrations/0000_s00.sql:99`), `ledger.ledger_entry.run_id` (`:158`), `ledger.raw_artifact.run_id` (`:142`), `core.node.run_id`, `ledger.propagation_run.run_id` (`:191`). The missing link is error→run, which the store supplies. |
| C1.6 | **Error identity MUST be independent of message text.** | `apps/runner/src/index.ts:1567` (`No configured maker exists at index ${index}`), `:1820`, `:2135`, `packages/serve/src/index.ts:605` all interpolate ids into messages; fingerprinting on message text would fragment every group. |
| C1.7 | **Async boundaries MUST preserve the chain.** Any `Promise.all` that can reject with one of several errors MUST record all rejections. | `apps/api/src/index.ts:574-596` (`Promise.all` of three queries) and `:618-640` (two queries) discard all but the first rejection. `packages/liveness/src/index.ts:243-259` same. |
| C1.8 | **Every capture point MUST record the *code path taken*, not just the throw site.** | `call_site_key` already does this for provider calls; the requirement is to extend the discipline to non-provider errors. |

### C2. The mechanical trace procedure

Given one error event `E`, the deterministic steps to a verdict:

```
STEP 0  Read E. Assert R22 mandatory fields present. If absent → verdict
        UNTRACEABLE_INCOMPLETE_EVENT (a defect in the capture layer itself).
STEP 1  Walk E.cause_chain to its terminal link C_n. C_n is the PROXIMATE cause.
STEP 2  Classify C_n.category (A5.1).
        - TRANSPORT with an external provider_ref → go to STEP 6 (external).
        - PERSISTENCE with code DATABASE_POOL_FAILED → go to STEP 7 (infra).
        - otherwise continue.
STEP 3  Resolve component: (process, package, call_site_key, build_ref).
        Fetch the source at build_ref. If build_ref is unknown → verdict
        UNTRACEABLE_UNKNOWN_BUILD. [Today this ALWAYS fires — no build_ref exists.]
STEP 4  Correlation join, in this fixed order:
        4a. E.run_id           → core.run                         (migrations/0000_s00.sql:41)
        4b. E.work_item_id     → core.work_item                   (:97)   → state, terminal_reason
        4c. E.call_site_key + run_id
                               → ledger.ledger_entry              (:155)  → ordered attempts, outcomes
        4d. ledger_entry.raw_artifact_ref
                               → ledger.raw_artifact              (:139)  → parse_status, parse_error, model_version
        4e. E.run_id           → core.run_progress_event          (:68)   → PHASE/TERMINAL/ENVELOPE_*/node.retrying/ledger.could_not_do
        4f. E.run_id           → serve.condition_mark             (migrations/0006_s05.sql:171) → ruled honesty marks
        4g. E.run_id           → core.provider_probe              (migrations/0022:1) → availability at claim
        Each join is bounded (indexed, single run scope) and terminates.
STEP 5  Decide the root by the first matching rule (ordered, exhaustive):
        R1  A CONFIG error at or before the first claim → ROOT = missing/invalid
            register row or wiring. Verdict: CONFIG_ROOT, name the row/setting.
        R2  A CONTRACT error with a raw_artifact whose parse_status is
            PARSE_FAILED/SCHEMA_FAILED, repeated across all attempts at the
            call_site_key → ROOT = model output contract. Verdict: CONTRACT_ROOT.
        R3  A DOMAIN_INVARIANT error → ROOT = the invariant's assertion site at
            build_ref. Verdict: CODE_ROOT with the exact path:line.
        R4  A PERSISTENCE error with SQLSTATE 55000 → ROOT = an append-only
            violation; the writing call site is the root. Verdict: CODE_ROOT.
        R5  A BUDGET error → ROOT = the ceiling basis; join envelope_basis on
            core.run. Verdict: POLICY_ROOT (not a defect).
        R6  An AVAILABILITY error whose provider_probe shows ABSENT at claim →
            STEP 6.
        R7  A STALL event → ROOT = the last recorded lifecycle transition; the
            missing successor names the stalled stage. Verdict: STALL_ROOT.
        R8  No rule matched → verdict INDETERMINATE with the full evidence set.
            This is a legal, terminating verdict — never a silent give-up.
STEP 6  EXTERNAL: the root lies outside the repo (provider outage, CLI outage,
        network). Verdict: EXTERNAL_ROOT. Record the evidence (probe record,
        HTTP status from raw_artifact.metadata_json.status, timeout
        classification) and STOP. No fix is authored.
STEP 7  INFRASTRUCTURE: DB/host. Verdict: INFRA_ROOT. Report only.
```

**Store guarantees required for termination:**

- **OBS-OPUS-R27** — Every join key in STEP 4 MUST be indexed and MUST be
  nullable-but-declared, so each step either resolves or provably does not
  exist. No step may require a scan.
- **OBS-OPUS-R28** — `cause_chain` MUST be finite and acyclic, with a stored
  maximum depth. A cycle or an unbounded chain makes STEP 1 non-terminating.
- **OBS-OPUS-R29** — The verdict vocabulary MUST be closed (`CONFIG_ROOT`,
  `CONTRACT_ROOT`, `CODE_ROOT`, `POLICY_ROOT`, `STALL_ROOT`, `EXTERNAL_ROOT`,
  `INFRA_ROOT`, `INDETERMINATE`, `UNTRACEABLE_*`) and every trace MUST end in
  exactly one member. `INDETERMINATE` is a first-class verdict, not a failure.
- **OBS-OPUS-R30** — The trace MUST be **recorded** as an artefact linked to the
  error group, with its evidence set, so the same group is not re-traced and so
  a human can audit the agent's reasoning (D4 audit trail).
- **OBS-OPUS-R31 (on `apps/replay`)** — `apps/replay` is **not** reusable for
  error tracing and MUST NOT be extended for it. Evidence: it is a
  *numeric-determinism* ceremony — it recomputes a served number from frozen
  structural receipts (`apps/replay/src/index.ts:68-87`) and **refuses every
  non-trivial shape** (`REPLAY_SHAPE_NOT_IMPLEMENTED` at `:78, :82`; the
  scheduler's variant throws `CONTINUOUS_REPLAY_SHAPE_NOT_IMPLEMENTED` at
  `apps/scheduler/src/index.ts:52` whenever `arrow_order` is non-empty). It
  requires a READ ONLY session (`apps/replay/src/cli.ts:13`) and a signed
  operator attestation (`apps/replay/src/index.ts:17-32`). It answers "is the
  stored number reproducible?", not "why did this fail?". Its *isolation
  discipline* is worth copying; its code is not.

### C3. Where current code makes tracing impossible — inventory

Classification key: **[SWALLOW]** error discarded entirely · **[FLATTEN]** cause
chain severed · **[REPLACE]** original error substituted · **[DROP]** signal
discarded without an error object · **[BENIGN]** control-flow use of catch on a
pure predicate, no diagnostic value lost.

#### C3.1 Product runtime (outside the security zone)

| # | `path:line` | Class | What is lost | Remediation requirement class |
|---|---|---|---|---|
| 1 | `apps/runner/src/index.ts:2519-2521` | **[REPLACE]** | The original runner error, in full, whenever the terminal-failure write loses a race | **RC-1: never replace on record-failure.** Record both: the original error AND a separate meta-event for the failed write. |
| 2 | `apps/runner/src/index.ts:2488-2492` | **[FLATTEN]** | Message, stack, cause of every runner error — collapsed to `RUNNER_EXECUTION_FAILED:<code>` or `…:UNEXPECTED_ERROR` | **RC-2: capture before compression.** The lifecycle string may stay; the error event must be written first, from the full error object. |
| 3 | `apps/runner/src/index.ts:1783-1793` | **[REPLACE]** | Any non-allowlisted error from the cross-maker review path (the allowlist at `:1784-1788` passes only 3 codes) — including infrastructure errors — is replaced by `NODE_REVIEW_UNAVAILABLE` | **RC-1** + **RC-3: widen or invert the allowlist.** Wrapping with `cause` preserves both the domain verdict and the real fault. |
| 4 | `apps/runner/src/index.ts:1342-1346` | **[FLATTEN]** | A claim-time probe throw becomes a bare `failureCode` string; the error object is gone. Note the fallback `"CLAIM_PROVIDER_PROBE_FAILED"` erases *which* probe failed and why | **RC-2** |
| 5 | `apps/runner/src/index.ts:862-868` (`parseContent`) | **[FLATTEN]** | The Zod/JSON error object behind every `*_CONTRACT_ERROR`; only `error.message` survives | **RC-4: pass `cause`.** Depends on C1.1. |
| 6 | `apps/runner/src/index.ts:892-905` (`callWithContentContract`) | **[FLATTEN]** | The `ProviderContentUnacceptedError` — including `lastRawArtifactRef` and `lastLedgerEntryRef`, the two fields that would let a trace jump straight to the offending artifact | **RC-4** (high value: these refs are exactly STEP 4d) |
| 7 | `apps/runner/src/index.ts:870-881` (`classifyStructuredContent`) | **[BENIGN]** | Nothing — classification is the purpose; `parseError` is preserved | none |
| 8 | `apps/api/src/index.ts:166-172` | **[SWALLOW]** | A double `destroy()` failure on an SSE socket teardown. Deliberate and correct as *behaviour*; but the fact that a stream aborted is recorded nowhere | **RC-5: record the event, keep the total handler.** |
| 9 | `apps/api/src/index.ts:107-123` (`MalformedRequestError`) | **[FLATTEN]** | The ZodError object — its structured `issues` array, which is the *only* machine-readable statement of which field was malformed | **RC-4** |
| 10 | `apps/api/src/index.ts:158-191` (whole handler) | **[DROP]** | **Every API error.** The handler formats a response and records nothing | **RC-6: this is capture point B1.3.** |
| 11 | `apps/api/src/index.ts:651` | **[DROP]** | Every stored progress event whose `kind` does not map to a contract `EventType` — returned as `[]`, uncounted | **RC-7: count and emit.** |
| 12 | `apps/api/src/index.ts:641` | **[DROP]** | An empty event stream is indistinguishable from a healthy quiet run | **RC-7** |
| 13 | `apps/api/src/index.ts:574-596`, `:618-640` | **[DROP]** | In `Promise.all`, all rejections but the first | **RC-8: use `allSettled` at capture-relevant joins, or record all rejections.** |
| 14 | `packages/graph/src/index.ts:328-331` | **[FLATTEN]** | The Postgres error object behind `EDGE_INTEGRITY_ERROR` — SQLSTATE, constraint name, detail. The message alone cannot distinguish a cycle violation from a FK violation from a pool death | **RC-4** (high value) |
| 15 | `packages/db/src/index.ts:164-167` (`withWriteTransaction`) | **[SWALLOW]** | Any failure of the `ROLLBACK` itself — awaited but unguarded; if `ROLLBACK` throws, it *replaces* the original error | **RC-1** + **RC-9: guard the rollback.** |
| 16 | `packages/db/src/index.ts:146-151` (`migrate`) | **[SWALLOW]** | Same shape: a throwing `ROLLBACK` replaces the migration error | **RC-9** |
| 17 | `packages/db/src/index.ts:69-72` | **[FLATTEN]** | Correct latch idiom, but the *first* pool error is the only one ever surfaced (`??=` at `:70`); all subsequent distinct failures are invisible | **RC-10: count suppressed occurrences.** |
| 18 | `packages/providers/src/index.ts:236-240` | **[SWALLOW]** | The JSON parse error on the provider response body — `decoded = null` and the reason is gone. The raw text *is* persisted (`:263-283`), so this is recoverable, but only by re-parsing | **RC-11: record the classification reason.** |
| 19 | `packages/providers/src/index.ts:180-186` | **[BENIGN]** | Predicate only | none |
| 20 | `packages/providers/src/index.ts:257-262` | **[FLATTEN]** | A throwing `classifyContent` becomes `SCHEMA_FAILED` + `error.message`; cause lost | **RC-4** |
| 21 | `packages/providers/src/index.ts:348-368` | **[FLATTEN]** | `lastError` is retained across the loop (`:350`) and does reach `ProviderCallFailedError` (`:380-385`) — **correct**. But the intermediate attempts' errors are overwritten each iteration; only the last survives | **RC-12: record per-attempt errors, not just the last.** |
| 22 | `packages/evaluator/src/index.ts:417-419` | **[SWALLOW]** | Which precondition failed — all collapse to `ADDON_PREFLIGHT_FAILED` | **RC-2** |
| 23 | `packages/evaluator/src/index.ts:431-433` | **[SWALLOW]** | Receipt-write failure. *Isolation is correct*; the silence is not | **RC-13: best-effort writes must still emit a meta-event.** |
| 24 | `packages/evaluator/src/index.ts:448-453` | **[SWALLOW]** | The provider-isolation assertion's reason | **RC-2** |
| 25 | `packages/evaluator/src/index.ts:457-462` | **[SWALLOW]** | The candidate-load failure (a DB error) → `ADDON_PREFLIGHT_FAILED` | **RC-2** |
| 26 | `packages/evaluator/src/index.ts:490-497` | **[SWALLOW]** | Same | **RC-2** |
| 27 | `packages/evaluator/src/index.ts:603-609` | **[SWALLOW]** | Blind-judgement reason extraction returns `[]` on parse failure | **RC-11** |
| 28 | `packages/evaluator/src/index.ts:1386-1392` | **[SWALLOW]** | Which of three input validations failed → `TAGGER_INPUT_INVALID` | **RC-2** |
| 29 | `packages/evaluator/src/index.ts:1406-1415` | **[SWALLOW]** | Receipt-start write failure → `TAGGER_PREFLIGHT_FAILED` | **RC-2**, **RC-13** |
| 30 | `packages/evaluator/src/index.ts:1420-1427` | **[SWALLOW]** | Terminal receipt write failure, silent by design | **RC-13** |
| 31 | `packages/evaluator/src/index.ts:1428-1433` | **[SWALLOW]** | Isolation assertion reason | **RC-2** |
| 32 | `packages/evaluator/src/index.ts:1957-1966` | **[SWALLOW]** | Receipt-persist failure during harvest failure handling — the *original* error is correctly rethrown at `:1966`, but the secondary is silent | **RC-13** |
| 33 | `packages/evaluator/src/index.ts:3419-3424` | **[SWALLOW]** | `assertObservedUsage` failure → `null` usage. **Spend telemetry silently becomes absent** | **RC-14: absent-because-invalid must be distinguishable from absent-because-missing.** |
| 34 | `packages/evaluator/src/index.ts:3467-3475` | **[SWALLOW]** | Per-row projection failures counted only as `callsFailed += 1`; no reason, no row id | **RC-15: count *and* sample.** |
| 35 | `packages/evaluator/src/index.ts:355-360`, `:1333-1339`, `packages/evaluator/src/consumer.ts:220-226` | **[FLATTEN]** | JSON parse errors → fixed messages ("… is not JSON") | **RC-4** |
| 36 | `packages/evaluator/src/consumer.ts:349-360` | **[SWALLOW]** | Job-list load failure → a receipt with a fixed reason | **RC-2** |
| 37 | `packages/evaluator/src/consumer.ts:396-410` | **[SWALLOW]** | Per-job claim failure → `failures += 1` + fixed reason | **RC-2**, **RC-15** |
| 38 | `packages/evaluator/src/consumer.ts:437-446` | **[SWALLOW]** | Isolation assertion reason | **RC-2** |
| 39 | `apps/evaluator-worker/src/index.ts:143-148` | **[SWALLOW]** | Receipt write failure ("best effort") | **RC-13** |
| 40 | `apps/evaluator-worker/src/index.ts:157-163` | **[SWALLOW]** | `readEvaluatorJudgeAddonPolicy` failure → `ADDON_POLICY_INVALID`; the actual policy defect is gone | **RC-2** |
| 41 | `apps/evaluator-worker/src/index.ts:243-253` | **[SWALLOW]** | Per-run harvest failure → `TERMINAL_HARVEST_FAILED`, no reason | **RC-2**, **RC-15** |
| 42 | `apps/evaluator-worker/src/index.ts:261-270` | **[SWALLOW]** | Metering reconciliation failure → a zeroed result with `failureReason` but no diagnostic | **RC-2** |
| 43 | `packages/judgement/src/s04.ts:143, 146, 150` | **[SWALLOW]** | Three successive JSON-recovery strategies each swallow their parse error; only the final typed error survives | **RC-16: record which strategy succeeded/failed** — this is a direct model-quality signal |
| 44 | `packages/contract/src/client.ts:64-73` | **[SWALLOW]** | A non-JSON error body from the API. Comment acknowledges it (`:72`) | **RC-11** |
| 45 | `packages/contract/src/client.ts:94-96`, `:100-102` | **[FLATTEN]** | `NETWORK_FAILURE` / `INVALID_RESPONSE` keep only `error.message`; the fetch cause (DNS, ECONNREFUSED, TLS) is lost | **RC-4** |
| 46 | `packages/crypto/src/index.ts:304-312` | **[SWALLOW]** | Audit-chain verification failure → `false`. **Security-adjacent, shared package** | **RC-17: report-only capture; no fix.** Boundary-tagged per R24. |
| 47 | `packages/crypto/src/index.ts:418-425` | **[BENIGN/zone]** | `verifyPassword` → `false`. Correct: distinguishing failure modes here IS the vulnerability | **none — explicitly do not change.** |
| 48 | `apps/ui/app/api/[...path]/route.ts:50-60` | **[SWALLOW]** | The upstream `fetch` rejection, entirely | **RC-11** (high value: this is the UI↔API seam) |
| 49 | `apps/ui/app/api/[...path]/route.ts:14-22` | **[FLATTEN]** | URL parse failure → fixed `DIALECTICAL_API_BASE_INVALID` | acceptable; **RC-2** low priority |
| 50 | `apps/ui/components/ScoringErrorBoundary.tsx:15-38` | **[SWALLOW]** | **Every React render error under the boundary.** No `componentDidCatch`, no `errorInfo`, no component stack | **RC-18: add `componentDidCatch` + report.** |
| 51 | `apps/ui/app/page.tsx:33-35` | **[FLATTEN]** | SSR index-load failure → a display string | **RC-19: SSR catches must report server-side.** |
| 52 | `apps/ui/app/debate/[id]/page.tsx:11-18` | **[BENIGN]** | Cookie decode fallback | none |
| 53 | `apps/ui/app/debate/[id]/DebatePageClient.tsx:479-486, 501-509, 521-528, 594-601, 653-662, 685-688`, `apps/ui/app/new/page.tsx:75-79, 88-92`, `apps/ui/app/settings/page.tsx:52+`, `apps/ui/components/NodeDetailDrawer.tsx:136` | **[DROP]** | **Ten client fetch-failure sites**, each converting an error to a React state string and reporting nowhere | **RC-20: one client reporting seam** — do not patch ten call sites. |
| 54 | `apps/ui/components/LibraryComposer.tsx:22-30` | **[SWALLOW]** | Token-validation and debate-creation failures both silently fall through to the `/new` flow. A user sees a redirect; the operator sees nothing | **RC-11** |
| 55 | `apps/ui/components/CanvasViewport.tsx:320-324` | **[BENIGN]** | Pointer-capture unavailability | none |
| 56 | `apps/ui/lib/api.ts:56-60` | **[FLATTEN]** | URL construction failure → fixed message. Correct (boot-time guard) | none |
| 57 | `apps/ui/app/debate/[id]/DebatePageClient.tsx:198-203` | **[BENIGN]** | JSON-snippet decode fallback for streaming partials | none |
| 58 | `apps/ui/lib/observability/logger.ts:241-243` | **[SWALLOW]** | The sink's own write failure. Correct isolation | **RC-13** (bounded meta-event) |
| 59 | `apps/ui/lib/observability/suspiciousScoring.ts:137-141` | **[SWALLOW]** | Logger failure during suspicious-event recording. Correct isolation | **RC-13** |
| 60 | `acceptance/relay-core.ts:100` | **[DROP]** | **All CLI stderr.** `child.stderr.resume()` | **RC-21: capture bounded stderr.** Becomes product-critical if the listener runs a relay (D2). |
| 61 | `acceptance/relay-core.ts:114` | **[SWALLOW]** | Scratch-directory cleanup failure — `void rm(…).catch(() => undefined)`. Deliberate (`:112-113`) | **RC-13**, low priority |
| 62 | `acceptance/standing-db.ts:27-29`, `:40-45` | **[SWALLOW]** | Datadir-probe and pool-probe failures used as predicates | **[BENIGN]** for `:27`; `:43` discards a real connection error before deciding to start an embedded server |
| 63 | `acceptance/model-shim.ts:59, 88, 114`, `acceptance/claude-relay.ts:60`, `acceptance/grok-relay.ts:43` | **[SWALLOW]** | CLI output parse failures → typed loud relay errors without the offending text | **RC-11** |
| 64 | `tools/orphan-audit/src/index.ts:367` | **[SWALLOW]** | Audit read failure | low priority |
| 65 | `web/app/api/[...path]/route.ts:17`, `web/app/debate/[id]/page.tsx:14` | **[SWALLOW]** | Same shapes as #48/#52 in the parallel `web/` app | **RC-11**, **[BENIGN]** respectively |

#### C3.2 Fire-and-forget and missing awaits

Verified by grep for `void <expr>(`, `.then(`, `.catch(`, `Promise.allSettled`
across the tree:

- **Server-side product path (`apps/{api,runner,scheduler,replay,evaluator-worker}`,
  `packages/*`) outside the security zone: NO un-awaited promises.** The only
  three `void` uses are lint markers for unused bindings
  (`apps/replay/src/index.ts:85`, `packages/battery/src/terminal.ts:247`,
  `packages/db/src/schema.ts:1054`). This is a genuine strength and should be
  stated as such.
- **UI:** `void refresh()` / `void showInspection()` / `void recordInvestigation()`
  at `apps/ui/app/debate/[id]/DebatePageClient.tsx:157, 636, 647, 650, 660,
  1456, 1457, 1463`; `apps/ui/app/new/page.tsx:64, 80`;
  `apps/ui/components/EvaluatorDevMenu.tsx:25, 79`;
  `web/app/debate/[id]/DebatePageClient.tsx:43, 47, 57, 58, 60, 66`. Each
  discards the promise; the inner functions set React state on failure, so the
  loss is the *unhandled-rejection* signal, not the user-facing state.
- **Acceptance:** `acceptance/run-acceptance.ts:386-387`
  (`process.once("SIGINT", () => { void close(); })`) — a shutdown failure is
  unobservable.
- **Security zone (mapped, not to be changed):**
  `apps/api/src/registration.ts:466, 527-531, 568, 701, 724-740, 766, 879,
  935-938, 953`.

**RC-22:** the UI `void` population MUST be covered by a global
`unhandledrejection` listener rather than by editing 16 call sites.

### C4. What "root" means — where tracing stops

- **OBS-OPUS-R32 — Definitions.**
  - **Proximate cause** = the terminal link of `cause_chain` (STEP 1).
  - **Root cause** = the earliest link in the causal chain that is **(a) inside
    this repository at a known `build_ref`, and (b) changeable by a code,
    schema, or register-row edit**.
  - If no link satisfies (a)+(b), the root is **external** and tracing stops
    with `EXTERNAL_ROOT`.
- **OBS-OPUS-R33 — The external boundary is drawn at four named surfaces**,
  each with a present-tree marker:
  1. **Provider HTTP** — anything reached via
     `packages/providers/src/index.ts:224-233`. Evidence of externality: a
     non-2xx status recorded in `ledger.raw_artifact.metadata_json.status`
     (`:273-277`), or the `TimeoutError` classification at `:352`.
  2. **CLI relay subprocess** — `acceptance/relay-core.ts:89-128`. Evidence: a
     non-zero exit (`:119`) or a `SIGTERM` deadline (`:102-105`).
  3. **Hatchet engine** — `apps/runner/src/main.ts:18-22, 45-47`,
     `apps/api/src/index.ts:371-382`. A failure to dispatch or a lost workflow
     is external. `UNVERIFIED` what Hatchet records; the trace must say so
     rather than guess.
  4. **PostgreSQL server/host** — `DATABASE_POOL_FAILED`
     (`packages/db/src/index.ts:20-28` enumerates the connection-class
     signatures) and SQLSTATE classes `08*`, `57P0*`.
- **OBS-OPUS-R34 — An external root is a legitimate terminal verdict, never a
  fix target.** The listener MUST NOT author a "fix" for a provider outage. The
  lawful outputs are: record, group, and (if a pattern crosses a ruled
  threshold) escalate to humans.
- **OBS-OPUS-R35 — A configuration root is distinct from a code root.** The
  runner mis-wiring (A3 #2) has a *code* root (`apps/runner/src/main.ts:27-41`
  omits two settings), whereas a missing sealed register row has a *policy*
  root that only V may supply (the `SCORING_OPERATOR_UNRESOLVED` comment at
  `apps/runner/src/index.ts:1245-1248` says exactly this: "its value is V's at
  DR-023 and is never invented"). **The listener MUST NOT invent register
  values.** This is a hard guardrail, not a preference.
- **OBS-OPUS-R36 — Tracing stops at the excluded zone boundary.** An error
  whose chain enters the zone terminates with `EXTERNAL_ROOT(SECURITY_ZONE)`.
  Named, not followed.

---

## RQ-D — The listener loop agent

### D1. Trigger transport

| Option | Missed-event guarantee | Backlog | Latency | Cost | Present-tree fit |
|---|---|---|---|---|---|
| **Cursor poll over the event/group tables** | **Strong.** A durable cursor (last processed `sequence`) survives restarts; nothing is missed because nothing is pushed | Natural — the backlog *is* the unread tail | Bounded by the poll interval (seconds) | One indexed query per interval | **Best fit.** No new infrastructure; matches the existing `pool.query` idiom everywhere; works with the fallback sink drain (B3.4) |
| **Postgres `LISTEN`/`NOTIFY`** | **Weak.** Notifications are *not* durable: anything emitted while the listener is disconnected is lost, and payloads are capped (8 kB). Would need a cursor anyway as the safety net | Poor — a disconnect loses the burst | Sub-second | Cheap | **No present usage:** a grep for `LISTEN|NOTIFY|pg_notify` across `apps/`, `packages/`, `migrations/` returns **nothing**. Adding it means a new trigger on the error table, which conflicts with keeping that table cheap (B5) |
| **Outbox + tail** | Strong, but it *is* the poll design with an extra table | — | — | Extra write per event | Redundant: the error table already is the outbox |
| **WAL/logical replication** | Strong | Good | Sub-second | Operationally heavy; needs replication slots and a new privilege class | Disproportionate; and a stuck slot can fill the disk — a new failure mode (violates B5.6) |

- **OBS-OPUS-R37** — **Cursor poll is the required transport**, with
  `LISTEN/NOTIFY` permitted only as a latency *optimisation* layered on top of
  the cursor, never as the sole trigger. Confidence **HIGH**.
  **Strongest counter-argument:** V's words are "listens for the moment errors
  are thrown", which reads as push. A 2–10 s poll is not "the moment". My
  answer: durability beats latency here, because a missed error is exactly the
  failure this mission exists to end; and a poll interval is a register row V
  can set to 1 s. If V wants true push, the lawful shape is NOTIFY-as-wakeup
  over a cursor-as-truth, which costs one trigger and keeps the guarantee.
- **OBS-OPUS-R38 — Delivery guarantee: at-least-once with an idempotent
  handler.** The cursor advances only after the group's trace verdict is
  durably recorded (R30). A crash mid-trace re-processes the group; the trace
  record's uniqueness key (`fingerprint`, `build_ref`) makes the repeat a
  no-op.
- **OBS-OPUS-R39 — The listener consumes GROUPS, not EVENTS.** One bad deploy
  produces thousands of events and one fingerprint. Group-level consumption is
  what makes the rate caps in D4 meaningful.
- **OBS-OPUS-R40 — The listener's own cursor, health and last-tick time MUST be
  observable in the same store.** A dead listener must not be silent — and a
  dead listener is exactly the case where nothing else is watching.

### D2. Runtime under DR-179

**The hard constraint:** CLI-relay is the only lawful model access. The evidence
of what that means concretely is `acceptance/relay-core.ts`:

- One HTTP front over interchangeable maker-specific CLI strategies
  (`:10-18`, `:47-57`).
- Each call spawns a CLI in a **fresh empty scratch directory** with `cwd`,
  `PWD` and `OLDPWD` all pointed at it (`:87-96`), stdin closed (`:96`), a hard
  deadline with `SIGTERM` (`:102-105`), and typed loud failure instead of
  fabrication (`:106-122`).
- Three adapters exist: `acceptance/model-shim.ts` (codex/OpenAI),
  `acceptance/claude-relay.ts` (Anthropic), `acceptance/grok-relay.ts` (xAI)
  — per `acceptance/README.md`.

**The architectural tension, stated plainly:** the only lawful model-access
mechanism in this repository lives in `acceptance/`, a directory that
`acceptance/README.md:1-9` declares to be outside the production reachability
walk, whose declared production roots are exactly `apps/api/src/main.ts`,
`apps/runner/src/main.ts` and `apps/scheduler/src/cli.ts`. A product component
cannot import it without breaking that invariant.

- **OBS-OPUS-R41 — The listener MUST be an OPS agent, not a product
  component.** It runs as a separate process, outside the product's
  reachability graph, reading the error store over its own database
  connection. It does not import product packages except types. Rationale:
  (a) it resolves the `acceptance/` tension without promoting acceptance code
  into the product; (b) it keeps the product's failure isolation intact — a
  looping LLM agent inside the product is a new, large failure surface
  (violates B5.6); (c) it matches how every other autonomous agent in this
  system already runs (visible CLI sessions under the Heartbeat spine).
  Confidence **HIGH**. **Strongest counter-argument:** an ops agent cannot be
  shipped, versioned or deployed with the product to `dezbatere.ro`, so the
  "permanent loop" becomes machine-bound and stops when V's laptop sleeps. My
  answer: that is the correct trade *for now* under DR-179, and the design must
  make the ops/product boundary a swappable seam (R43) so a server-side runtime
  is a deployment change, not a rewrite.
- **OBS-OPUS-R42 — Session lifecycle: one supervisor + ephemeral per-group
  workers.** A single long-lived supervisor process owns the cursor, the rate
  caps and the kill switch; each group's trace+classify+fix cycle runs in a
  **fresh, short-lived CLI session** with a bounded deadline. Rationale: a
  permanently open model session accumulates context, drifts, and cannot be
  cost-bounded per unit of work; `acceptance/relay-core.ts:87-96` already
  proves the fresh-scratch-directory-per-call discipline. Confidence **HIGH**.
  **Counter-argument:** per-group sessions lose cross-error pattern memory. My
  answer: pattern memory belongs in the *store* (group table, trace records),
  not in a model context window — that is also what makes it auditable.
- **OBS-OPUS-R43 — Where it runs is a configuration seam, not a design
  commitment.** Today: V's machine, alongside the existing fleet CLIs.
  Later: the `dezbatere.ro` server. The requirement is that the listener's only
  couplings are (a) a Postgres connection string, (b) a CLI binary path, and
  (c) a git working tree path — all three configurable.
- **OBS-OPUS-R44 — Idle cost MUST be effectively zero.** The idle loop is one
  indexed SQL query per interval and **no model call**. A model call happens
  only when an unprocessed group exists. Any design that "thinks" on an idle
  tick is refused: under a permanent loop, idle cost dominates total cost.
- **OBS-OPUS-R45 — Active cost MUST be bounded per group and per day**, and the
  bound MUST be a register row (E3). Concrete unit prices are **UNVERIFIED** —
  the CLI relays report usage only when the CLI itself does
  (`acceptance/relay-core.ts:36-45`, `CliUsage` optional), and no pricing data
  exists in this repository. The design must therefore bound by **calls and
  wall-clock**, which are always observable, not by dollars, which are not.
- **OBS-OPUS-R46 — If V lifts DR-179**, the only thing that changes is the
  adapter behind the same seam: a direct API client replaces the CLI strategy
  (`CliRelayAdapter`, `acceptance/relay-core.ts:47-57`, is already the right
  shape). Everything else — cursor, guardrails, caps, audit — is unaffected.
  Explicitly: lifting DR-179 does **not** justify moving the listener inside
  the product.

### D3. Fix-magnitude taxonomy

The dimensions must be **objectively checkable by a machine**, and every one
must be computable from the repository plus the trace record.

| Tier | Objective criteria — **ALL** must hold | Authority |
|---|---|---|
| **QUICK-FIX** | 1. Verdict ∈ {`CODE_ROOT`, `CONFIG_ROOT`} where the config is code-level wiring, not a register value. 2. Diff touches **exactly 1 file**, **≤10 changed lines**, **0 added files**, **0 deleted files**. 3. File is **not** in the forbidden set (D4). 4. No change to any exported symbol's **signature** (name, arity, types) — checkable via the type-checker. 5. No change to any string literal that is a **ruled vocabulary member** (`packages/kernel/src/index.ts:10-243`) or a **register row key**. 6. No SQL, no migration, no `package.json`, no lockfile, no CI/config. 7. A **RED** test reproducing the error existed before the change and is **GREEN** after. 8. The full suite (`pnpm test`), the type-check (`pnpm typecheck`) and the audits (`pnpm lint` → `audit:architecture` + `audit:source`) all pass. 9. The change is **revertible by a single revert** with no dependents. 10. The group's `occurrence_count` ≥ a ruled minimum (do not chase singletons). | Auto-apply, no approval |
| **PR-FIX** | Verdict is a code root; the change exceeds any QUICK-FIX numeric bound but still touches **no** forbidden-set path, adds no migration, changes no scoring/persistence/security semantics, and carries RED→GREEN proof plus a full clean suite. | Agent opens a PR; humans merge |
| **ESCALATE (report only)** | Any of: verdict ∈ {`EXTERNAL_ROOT`, `INFRA_ROOT`, `POLICY_ROOT`, `INDETERMINATE`, `UNTRACEABLE_*`}; **or** the fix would touch anything in the forbidden set; **or** the fix requires a register value (V's alone); **or** the fix requires a schema change; **or** the agent cannot produce a RED test; **or** any spine §9 high-risk category is implicated. | No code change at all |

- **OBS-OPUS-R47 — The RED→GREEN proof is the load-bearing criterion, not the
  line count.** A 3-line change with no reproducing test is ESCALATE; a
  40-line change with a crisp RED→GREEN is a legitimate PR-FIX. Line counts are
  a *cheap upper bound* on blast radius, not a measure of correctness.
  Confidence **HIGH**.
- **OBS-OPUS-R48 — "Cannot write a RED test" is itself a finding**, recorded
  against the group as `UNREPRODUCIBLE`, and it is the strongest available
  signal that the error is environmental rather than code-rooted.
- **OBS-OPUS-R49 — Blast radius MUST be computed, not estimated.** The
  repository already has the tool: `tools/orphan-audit/src/index.ts:303`
  (`auditSurfaceReachability`) and `:118` (`auditS14TypeGraph`) walk the module
  graph. Reachability from the changed symbol is a checkable number.
- **OBS-OPUS-R50 — Subsystem criticality MUST be a declared, versioned map**
  (path glob → `CRITICAL | NORMAL | PERIPHERAL`), held outside the agent's own
  writable set. `CRITICAL` (never QUICK-FIX) at minimum covers:
  `packages/propagation/**`, `packages/judgement/**`, `packages/valuation/**`,
  `packages/serve/**`, `packages/budget/**`, `packages/settlement/**`,
  `packages/ledger/**`, `packages/crypto/**`, `packages/db/**`,
  `migrations/**`, and the entire excluded zone.

**Strongest counter-argument to my own taxonomy:** the numeric thresholds
(1 file / 10 lines) are arbitrary and will be gamed by the agent's own choice of
how to express a fix — an agent that wants auto-apply authority will find the
10-line formulation of a 40-line change, and that formulation is usually the
*worse* one (dense, clever, unreviewable). A taxonomy built on proof quality
(RED→GREEN + clean audits + computed reachability) is robust to that pressure;
one built on line counts actively rewards compression. **I keep the numeric
bounds only as a hard ceiling on top of the proof criteria, never as the
qualifying test on their own** — and I flag to V that if only one criterion can
be kept, keep the proof, not the count.

### D4. Guardrails

- **OBS-OPUS-R51 — The hard forbidden set (never touched by the agent, in any
  tier):**
  1. The excluded security zone (B6.1 list) — every file, every migration.
  2. `migrations/**` — all of it. New schema is architecture (spine §9 floor).
  3. `packages/crypto/**`, `packages/db/src/identity.ts`,
     `packages/register/src/auth-policy.ts`.
  4. Scoring/propagation semantics: `packages/propagation/**`,
     `packages/judgement/**`, `packages/valuation/**`,
     `packages/published-arithmetic/**`, `packages/settlement/**`.
     (`packages/published-arithmetic` is the *licensed shared arithmetic
     surface* that the replay-isolation receipt pins —
     `apps/replay/src/index.ts:4-8`; changing it silently invalidates every
     replay proof.)
  5. Spend/budget configuration: `packages/budget/**`, `register.*` rows,
     `register.bootstrap.json`.
  6. Protocol and governance docs: `docs/agent-protocols/**`,
     `docs/founding/**`, `docs/missions/**`.
  7. Board state and Hermes surfaces: `.hermes/**`.
  8. **Its own configuration, guardrails, thresholds, forbidden set, criticality
     map, and audit code.** No self-modification, ever, in any tier.
  9. `package.json`, `pnpm-lock.yaml`, `pnpm-workspace.yaml`, `compose.dev.yaml`,
     `deploy/**`, CI configuration.
  10. `packages/kernel/src/index.ts` closed vocabularies (`:10-243`) — these are
      minting authorities; a change there is a semantic change everywhere.
- **OBS-OPUS-R52 — Kill switch, three levels, all effective within one tick:**
  (a) a register/config row that halts fix authority but keeps observing;
  (b) a row that halts the loop entirely; (c) an out-of-band file/flag on the
  host that the supervisor checks **before** every model call, so a runaway can
  be stopped without database access. The switch state MUST be readable in the
  store, and flipping it MUST be recorded.
- **OBS-OPUS-R53 — Rate caps, all register-ruled and all enforced by the
  supervisor, not the worker:** max QUICK-FIX applications per day; max PR
  opens per day; max model calls per group; max model calls per day; max
  consecutive failed fix attempts per fingerprint (after which the group is
  force-escalated); minimum interval between two changes to the same file.
- **OBS-OPUS-R54 — Regression circuit-breaker.** If a group's
  `occurrence_count` **rises** after the agent's fix landed (comparing
  `build_ref` before/after — R20), fix authority auto-disables and the change
  is flagged for revert. This is the single most important guardrail, because
  it is the only one that catches a *wrong* fix rather than a *forbidden* one.
- **OBS-OPUS-R55 — Budget caps.** A monthly ceiling expressed in model calls and
  wall-clock (R45), enforced by the supervisor, with a hard stop (not a
  warning) at the ceiling.
- **OBS-OPUS-R56 — Who watches the watcher: every agent action lands in the same
  store.** Mandatory audit record per action: `{action_id, group_fingerprint,
  trace_verdict_ref, tier, decision_rationale, diff_hash, files_touched,
  lines_changed, red_test_ref, green_proof_ref, suite_result, audits_result,
  model_calls, wall_clock_ms, landed_ref (commit/PR), reverted_ref,
  build_ref_before, build_ref_after, actor="listener", occurred_at}`. The
  agent's own errors are captured through the same layer, tagged
  `process=listener`, and are subject to the same rate caps.
- **OBS-OPUS-R57 — The agent MUST have its own least-privilege database role:**
  SELECT on the error store, narrow UPDATE on group triage state, INSERT on the
  audit table. **No access to `core.*`, `serve.*`, `identity.*`, `memory.*`
  content tables.** It reads *about* runs (ids, states, outcomes), never the
  debate content itself. This is the strongest available privacy control and it
  is enforceable today with the existing role idiom
  (`migrations/0000_s00.sql:290-312`).
- **OBS-OPUS-R58 — Two-agent separation.** The seat that *traces and classifies*
  MUST NOT be the seat that *decides its own authority tier*. The tier decision
  is a deterministic function (D3) evaluated by the supervisor from checkable
  facts, not a judgement the model makes about itself. This mirrors the spine's
  detector/reviewer/router separation
  (`docs/agent-protocols/debateai-heartbeat-protocol.md:1635-1636`).

### D5. Git and PR mechanics — **and a blocking precondition**

#### D5.1 The blocking finding

The loop agent's entire PR/commit capability rests on the repository being in a
workable git state. **It is not.**

Verified facts:

- The git root is `/Users/vladmihaimiron/Documents/DebateAIRO`; the product tree
  is the subdirectory `dialectical-engine/`. There is **no** nested `.git` in
  `dialectical-engine/`.
- `git status --porcelain` at the root reports **4265 deleted paths**, **252
  untracked paths**, 11 modified. The deletions are the old prefixes
  (`DebateAI-V3/…` 2 645 paths, `apps/dialectical-engine/…` 742,
  `.hermes/…` 594, `skeleton/…`, `docs/…`) — the 2026-08-17 rename described in
  `README.md:3-8` was never recorded in git.
- Under `dialectical-engine/`, exactly **141 files are tracked**, of which the
  product-source subset is **30 files**: `apps/api/{package.json,
  src/index.ts, src/mail-channel.ts, src/main.ts, src/registration.ts}`,
  `apps/runner/src/main.ts`, `migrations/003{0,1,2}_*.sql`,
  `packages/crypto/*`, `packages/db/src/{identity.ts,index.ts,schema.ts}`,
  `packages/register/src/{auth-policy.ts,index.ts,runtime-environment.ts}`,
  `tools/orphan-audit/src/index.ts`, and 10 test files.
- **That set is, almost exactly, the excluded security zone.** Everything the
  loop agent is *allowed* to fix — `apps/runner/src/index.ts` (2 559 lines),
  every UI file, `packages/{serve,ledger,graph,budget,propagation,judgement,
  valuation,liveness,memory,evidence,battery,contract,critique,evaluator,
  kernel,providers,settlement}`, migrations `0000..0029` and `0033`,
  `acceptance/`, `web/` — is **untracked**.
- Current branch `dev`; remote `origin → https://github.com/DebateAIRO/debateairo.git`;
  `HEAD` = `5b2471d`.

**Consequence:** an agent running `git add <file> && git commit` on, say,
`apps/runner/src/index.ts` would be adding a brand-new file to the repository
for the first time, in a working tree that simultaneously shows 4 265 deletions.
A `git commit -a` would record a catastrophic deletion commit. A PR diff would
be unreadable. There is no `git diff` baseline against which "≤10 lines
changed" (D3) can even be computed.

- **OBS-OPUS-R59 — BLOCKING PRECONDITION.** The repository MUST be brought to a
  clean, fully-tracked state — the rename recorded, the product tree committed,
  the working tree clean against `HEAD` — **before** the listener is granted any
  git authority. Until then, QUICK-FIX and PR-FIX are both physically
  impossible to perform lawfully. I record this as a requirement and take no
  action: repository restructuring is V's, and it is not a REQUIREMENTS-loop
  activity.
- **OBS-OPUS-R60 — The agent MUST verify a clean baseline before every change**
  (`git status --porcelain` empty except its own edits; `HEAD` matches the
  `build_ref` the error was observed on) and MUST abort otherwise. A dirty tree
  means it cannot know what it is changing.

#### D5.2 Mechanics (assuming R59 is satisfied)

- **OBS-OPUS-R61 — Branch naming:** a single reserved namespace, e.g.
  `obs-agent/<fingerprint-short>-<short-slug>`, one branch per fingerprint, so
  a human can see at a glance what is agent-authored and so a repeat attempt on
  the same group is an update, not a proliferation.
- **OBS-OPUS-R62 — PR body MUST contain, in a fixed machine-parseable order:**
  (1) the error group: fingerprint, code, severity, first/last seen,
  occurrence count, affected `build_ref`s; (2) the **full trace record** from
  C2 with its ordered evidence set and its verdict; (3) the **RED** test — the
  test file, and the failing output before the change; (4) the **GREEN** proof
  — the same test passing after; (5) full-suite, typecheck and audit results;
  (6) the computed blast radius (R49); (7) the tier decision and the criteria
  that qualified it; (8) an explicit "what I did not change and why"; (9) the
  revert command.
- **OBS-OPUS-R63 — Every commit MUST be attributable.** A distinct author or
  trailer identifying the listener agent, plus the `action_id` from R56, so the
  audit record and the commit are joinable in both directions.
- **OBS-OPUS-R64 — Review routing:** a loop-agent PR is reviewed by a **human**
  and by an **independent non-author-family reviewer**, matching the spine's
  independent-review law
  (`docs/agent-protocols/debateai-heartbeat-protocol.md:1635-1636`). The agent
  MUST NOT approve, merge or close its own PR, and MUST NOT be granted merge
  permission on the remote.
- **OBS-OPUS-R65 — Revert path:** every landed change (both tiers) MUST be a
  single, self-contained commit that reverts cleanly with `git revert <sha>`.
  No squashed multi-fix commits. The audit record stores the sha; the
  circuit-breaker (R54) can therefore produce an exact revert command without
  reasoning.
- **OBS-OPUS-R66 — QUICK-FIX landing mechanics.** See **E2** for the contested
  choice. Whatever V rules, three things are non-negotiable:
  (a) it lands as **one revertible commit** on a branch that is **not** `main`;
  (b) the audit record (R56) is written **before** the push, so an
  unrecorded change is impossible;
  (c) a **human-visible notification** fires per landing (the point of "no
  approval needed" is to remove the *wait*, not the *visibility*).
- **OBS-OPUS-R67 — Mission workers are unaffected.** The loop agent's authority
  is a product capability V grants to *that agent*. It confers nothing on
  requirements/architecture/programming seats, who still never push without V's
  approval.

### D6. Activation gating and rollout

V's sequencing is explicit: the listener activates only **after** the tables
exist. The phases below make that a chain, each with acceptance criteria that
are checkable, not narrative.

| Phase | Contents | Acceptance criteria (all must hold to open the next phase) |
|---|---|---|
| **P0 — Prerequisites** | `cause` on `TypedDomainError` (C1.1); `build_ref` stamping (R20); ambient correlation (R21); error-code registry (R05); **repository git state clean (R59)** | Type-check and full suite green with the new `cause` parameter across every wrap site; every process reports a `build_ref` at boot; `git status --porcelain` clean |
| **P1 — Capture + store, no listener** | The error tables; the capture wrappers at B1.1–B1.14; the redaction kernel (R14); the fallback sink (B3.4) | (a) A deliberately induced error in **each** of the 7 runtimes produces exactly one event with all R22 mandatory fields; (b) a **DB-down** drill produces events in the fallback sink and drains them on recovery — reusing the existing `tests/support/poolFailureHarness.ts` + `tests/integration/pol03-pool-resilience.test.ts:21-40` shape; (c) a redaction test proves no token, prompt, question line or node statement appears in any stored event; (d) a load drill shows p99 added latency within the R45 budget and no product-path regression; (e) the `PROCESS_DEATH_STALL` case (A3 #1) produces a `STALL` event |
| **P2 — Listener in report-only mode** | Cursor poll (R37); grouping; trace procedure (C2); verdicts recorded; **zero write authority, zero git access** | (a) ≥N consecutive days with no missed group (cursor gap check); (b) trace verdicts reviewed by a human against ground truth, with a ruled minimum agreement rate; (c) every `EXTERNAL_ROOT`/`INDETERMINATE` verdict is correct — a false `CODE_ROOT` here would be a false fix later; (d) the agent's own errors appear in the store; (e) the kill switch (R52) verified at all three levels; (f) zero `zone=EXCLUDED` groups traced past the boundary |
| **P3 — PR-FIX authority (no auto-apply)** | The agent may open PRs; every one is human-merged | (a) ≥M merged agent PRs with no revert; (b) zero PRs touching the forbidden set (R51); (c) every PR body complete per R62; (d) reviewer time per PR trending down, not up (a PR nobody can review is a failed capability) |
| **P4 — QUICK-FIX authority** | Auto-apply within D3's tier-1 criteria, under E1/E2's ruling | (a) a defined trial window with the circuit-breaker (R54) armed; (b) revert rate below a ruled ceiling; (c) every landing audited and notified (R66) |

- **OBS-OPUS-R68 — Phases are gated by V, not by the agent, and are
  reversible.** Any phase can be revoked by flipping the kill switch; the
  system must remain fully functional with the listener at P2 forever.
- **OBS-OPUS-R69 — P1 must run long enough to produce a real error corpus
  before P2 opens.** A trace procedure validated against three synthetic errors
  is not validated. The corpus size is V's to rule.

### D7. Governance

- **OBS-OPUS-R70 — The listener is an OPS AGENT under the Graph Spine, not a
  product component** (R41). It is not part of the served product; it does not
  affect answers; it has no user-facing surface. It is subject to the spine's
  agent laws, including the immutable high-risk floor
  (`docs/agent-protocols/debateai-heartbeat-protocol.md:374-377`).
- **OBS-OPUS-R71 — The error *store* IS a product component** (new Postgres
  schema in the product database, written by product processes) and is
  therefore governed by the spine's persistence rules. **The store and the
  listener have different governance and must be designed as separable
  deliverables** — which is also exactly what V's sequencing implies (tables
  first, listener after).
- **OBS-OPUS-R72 — Architecture-detection is the reviewer's job, backed by an
  automatic tripwire.** A loop-agent PR that turns out to touch architecture is
  caught by: (a) the forbidden-set check at author time (R51) — mechanical;
  (b) the criticality map (R50) — mechanical; (c) the blast-radius computation
  (R49) — mechanical; (d) the human + independent reviewer (R64) — judgement.
  Any PR that trips (a)/(b)/(c) is auto-converted to ESCALATE and never opens.
- **OBS-OPUS-R73 — Routing on escalation:** an ESCALATE verdict produces a
  **mission intake candidate**, not a PR — a structured record the human
  orchestrator can turn into a ticket. The listener MUST NOT create tickets,
  modify the board, or write into `.hermes/**` (R51 item 7).
- **OBS-OPUS-R74 — The listener MUST NOT be the sole judge of whether something
  is architecture.** Any group whose trace verdict is `CODE_ROOT` but whose
  blast radius exceeds a ruled threshold is ESCALATE regardless of line count.
- **OBS-OPUS-R75 — Provenance.** Every agent-authored change carries its
  `action_id`, `group_fingerprint` and trace verdict into the commit trailer
  (R63), so the authority trail from error → trace → decision → commit → review
  is reconstructable end to end, in the same spirit as the DR-citation
  discipline the founding documents already require (`README.md:20-22`).

---

## RQ-E — Contested decisions for V

### E1. The QUICK-FIX definition — the exact objective threshold

**Options.**
- **E1-a (proof-only):** qualify on RED→GREEN + clean full suite + clean audits
  + not-forbidden + blast radius below threshold. **No line/file count at all.**
- **E1-b (proof + hard ceiling) — my recommendation:** E1-a **plus** a hard
  ceiling of 1 file / ≤10 changed lines / 0 added or deleted files / no
  exported-signature change / no ruled-vocabulary or register-key literal
  change / no SQL, migration, manifest, lockfile or CI change / group
  occurrence ≥ ruled minimum.
- **E1-c (count-only):** qualify purely on a diff-size bound.
- **E1-d (allowlist):** QUICK-FIX only for a small, explicitly enumerated set of
  defect shapes (e.g. a null-guard, an off-by-one in a bound, a missing `await`,
  a wrong constant that has a test).

**Recommendation: E1-b.** Confidence **MEDIUM-HIGH**.
**Strongest counter-argument:** E1-b's numeric ceiling actively rewards the
agent for compressing a change into fewer lines, and the compressed form is
usually the less reviewable one — so the ceiling can make the auto-applied
population *worse* on average even as it makes it smaller. E1-d is the safest
option and the one I would choose if V wants the lowest possible risk, at the
cost of covering very few real defects. If V picks E1-b, the ceiling must be
explicitly framed as a *cap on top of* the proof criteria, never as an
alternative to them.

### E2. QUICK-FIX landing mechanics

**Options.**
- **E2-a:** direct commit to `main`.
- **E2-b:** direct commit to a long-lived agent branch (e.g.
  `obs-agent/auto`), which a human fast-forwards or merges in batches.
- **E2-c — my recommendation:** an **auto-merged PR into `dev`** — the agent
  opens a PR, CI runs, and the merge is automatic on green; the PR exists as
  the permanent audit artefact.
- **E2-d:** a batched daily PR containing all of the day's QUICK-FIXes.

**Recommendation: E2-c.** It satisfies V's "no approval needed" (no human is
waiting), while preserving a reviewable diff, CI as the gate, a clean revert
handle, and a notification surface. It lands on `dev`, never `main`, so a
release remains a human act.
Confidence **MEDIUM-HIGH**.
**Strongest counter-argument:** an auto-merged PR is a *ceremony* around a
direct commit — it does not actually add a gate, it adds latency and noise, and
if CI is the only gate then E2-a with the same CI is honest about what is
happening. My answer: the PR is not a gate, it is an **artefact** — it gives
every auto-applied change a URL, a diff, a comment thread and a revert button,
which is what makes "no approval" survivable. E2-d is materially worse: batching
destroys the one-commit-one-revert property (R65) and couples unrelated fixes.
**Audit trail is identical and mandatory in all four options (R56).**

### E3. Listener runtime, model, and monthly budget cap

**Options.**
- **E3-a — my recommendation:** ops agent on V's machine, via the existing CLI
  relay (DR-179-compliant), supervisor + ephemeral per-group workers (R42),
  budget expressed as **model calls per day and per month** plus a wall-clock
  ceiling.
- **E3-b:** same, but on the `dezbatere.ro` server once it exists.
- **E3-c:** in-product component with a direct API client — **requires V to lift
  DR-179** and, in my judgement, should be refused independently of DR-179
  because it puts an unbounded LLM loop inside the product's failure domain
  (B5.6).

**Recommendation: E3-a now, E3-b later, never E3-c.** Confidence **HIGH** on
the shape, **LOW** on any specific number.
**Which model:** the roster verified live at intake
(`docs/missions/2026-08-21-observability-loop/00-intake-H0.md:79-84`) contains
three available CLIs. I decline to recommend one: model choice for a standing
autonomous agent is a cost/capability trade only V can make, and the relay
seam (`acceptance/relay-core.ts:47-57`) makes it swappable.
**On the dollar cap: `UNVERIFIED`.** There is no pricing data in this
repository and the CLI relays surface usage only when the CLI itself reports it
(`acceptance/relay-core.ts:36-45`). Any dollar figure I named would be
fabricated. The lawful design is therefore: cap on **calls and wall-clock**
(always observable), and treat a dollar cap as a derived, best-effort estimate.
**Strongest counter-argument to E3-a:** a laptop-hosted "permanent" loop is not
permanent — it stops when the machine sleeps, and a listener that is silently
off is worse than no listener, because the team believes it is watching. This is
real, and it is why **R40** (the listener's own liveness must be observable, and
its absence must be an alert) is not optional.

### E4. Error-data retention under DR-188

**Options.**
- **E4-a:** keep everything forever (strictest DR-188 reading).
- **E4-b — my recommendation:** **tiered, V-ruled retention** — full events for
  a short window; then reduce to group-level aggregates (fingerprint, counts,
  first/last seen, verdicts) retained indefinitely; individual event rows aged
  out after a ruled window; **nothing that is product data is ever deleted**,
  because nothing that is product data is ever *stored* here (B4.1/B4.2).
- **E4-c:** fixed short retention for everything.

**Recommendation: E4-b.** The key argument is a **classification** one, and it
is V's to accept or reject: *error events are operational telemetry about the
system, not product data*. Under B4, the store contains no debate content, no
provider payloads, no prompts — only codes, stacks, component identifiers and
references. On that basis DR-188's data-preservation law is not engaged by
aging out an event row, while the group aggregate (the part with lasting
diagnostic value) is kept forever.
Two supporting observations, both verified: the accounts mission's own
amendment record already reads DR-188 as governing "migrations and datadirs,
not rows"
(`docs/missions/2026-08-17-accounts-privacy-security/AMENDMENTS.md:20`); and
row-level immutability is a *separate, amendable* mechanism
(`core.reject_mutation`, `migrations/0000_s00.sql:31-39`) which the error tables
must be deliberately excluded from (B3.3) for either aggregation or retention
to be possible at all.
Confidence **MEDIUM**.
**Strongest counter-argument:** the classification is exactly the kind of move
that erodes a preservation law — "it's only telemetry" is how every retention
exception starts, and error events *do* contain `asker_id`/`session_id`
(B4.6), which are user-linking. If V rejects the classification, E4-a is
workable provided B3.2 (off the global sequence) and hard volume bounds hold;
the cost is unbounded table growth and a store that gets slower exactly as the
system gets busier.

### E5. Security-zone boundary rule

**Options.**
- **E5-a:** fully exclude — the shared error handler checks
  `instanceof AuthFlowError` (`apps/api/src/index.ts:179`) and records nothing.
- **E5-b — my recommendation:** capture at the shared boundary with **tier-2
  minimisation** (code only, no message, no stack, no cause), tagged
  `zone=EXCLUDED`, report-only forever (R24).
- **E5-c:** capture normally, treat the zone like any other component.

**Recommendation: E5-b.** Confidence **MEDIUM-HIGH**.
**Strongest counter-argument:** even code-only capture creates an
authentication-failure oracle in an ops surface, and it places data *about* the
excluded, defect-known mission (`6e58adc` marks S3b/S3c/S3d KNOWN-DEFECTIVE)
into a store that mission never reviewed. E5-a is cleaner for the zone. My
reason for preferring E5-b: under E5-a, a `DATABASE_POOL_FAILED` raised on the
registration path — produced by *shared* code in `packages/db` (seam S6) — would
be invisible, which means the product's own infrastructure health has a hole in
it shaped like the auth routes. That is a worse failure than the oracle risk,
which is mitigated by restricting store access (R57) and by never storing the
discriminating detail.
**Either way, three things hold:** no instrumentation inside the zone; no
listener action on the zone, ever; no disturbance of the stopped mission's
resume points (R26).

### E6. Further decisions only V can make (surfaced by this research)

| Id | Decision | Why it is V's | My reading |
|---|---|---|---|
| **E6-1** | **The repository git state.** 4 265 tracked paths show as deleted; the entire product tree except the security zone is untracked (D5.1). | Repository restructuring, and it blocks the loop agent's core capability | Must be resolved before P3. I flag it and take no action. |
| **E6-2** | **The runner production entrypoint is mis-wired** — `apps/runner/src/main.ts:27-41` omits `judgementPolicy`/`servePolicy`, guaranteeing `JUDGEMENT_POLICY_UNRESOLVED` on every work item (A3 #2). | A live product defect discovered incidentally; fixing it is out of this loop's scope | Ticket it separately. It is also the ideal P1 acceptance fixture: a real defect the new layer must surface. |
| **E6-3** | **19 of 29 declared wire event types can never be produced** (A3 #8) — the contract and the DDL disagree, and the three most error-relevant members (`node.failed`, `ledger.failure`, `ledger.attempt`) are all dead. | A product-contract decision: widen the DDL and write producers, or delete the members | Must be settled before the layer is designed, or the layer inherits a vocabulary two thirds of which is fiction. |
| **E6-4** | **Should `apps/evaluator-worker` ever run?** It has no entry point and its dispatch binding is permanently `UNBOUND` (A1.1). | Product scope | Until V rules, do not build capture for a process that does not exist. |
| **E6-5** | **Nothing schedules the scheduler jobs** (A3 #15) — `pnpm job:*` are one-shot CLIs with no cron anywhere. | Operations | Affects the layer directly: liveness sweeps and settlement watches are error-relevant inputs that never run. |
| **E6-6** | **The dev-JSONL README prohibition** (`apps/ui/lib/observability/README.md:18`) needs an explicit amendment, not an implicit override. | It is a written rule; V's new order supersedes it only for the new class | A4 #2 proposes the exact reconciliation text. |
| **E6-7** | **`asker_id`/`session_id` in the error store** (B4.6) — user-linking pseudonyms in an ops surface. | Privacy posture and the erasure regime | I recommend storing them, because run-level correlation is the backbone of C2 — but this is a privacy call, not an engineering one. |
| **E6-8** | **Does the listener get read access to `core.run.question_line`?** Some traces would be easier with the question text. | Privacy | I recommend **no** (R57). The listener works from ids, codes and structure. |
| **E6-9** | **Alerting.** Requirements above cover *recording*; nothing covers *waking a human*. A `FATAL` at 03:00 with no listener authority is currently a row in a table. | Product/ops | Needs its own decision: what notifies whom, on what severity. |
| **E6-10** | **Both `apps/ui` (`dialectical-engine-v2ui`) and `web` (`dialectical-engine-web`) exist as Next apps**, and `pnpm build` builds only `web` (`package.json:12`). | Product scope | Instrumenting both doubles the client-side work; V should name the live surface. |

---

## Ranked recommendations (top 10)

| # | Recommendation | Confidence | Strongest counter-argument |
|---|---|---|---|
| 1 | **Add `cause` to `TypedDomainError` and thread it through every wrap site** (`packages/kernel/src/index.ts:283-288`; wraps at `packages/graph/src/index.ts:328`, `apps/runner/src/index.ts:862, 892, 2488`, `apps/api/src/index.ts:107`). Without this, root-tracing is impossible by construction and every other requirement is decoration. | **HIGH** | It is a cross-cutting change to ~370 sites in a system with no safety net for the untracked majority of files (D5.1) — a large, risky diff to land before any observability exists to watch it. Mitigation: land it in P0, behind the full suite, one package at a time. |
| 2 | **Stamp a `build_ref` on every process and every event.** Zero support exists today. | **HIGH** | It is "just" a build-time constant and feels low-value next to the schema work — until the first version-skew incident, when its absence makes the store useless for the exact class the brief names. |
| 3 | **Build the store as a new schema, off `ledger.allocate_sequence()` and off `core.reject_mutation`** (`migrations/0000_s00.sql:9-29, 31-39, 314-331`). | **HIGH** | It forgoes the system's global ordering guarantee, so error events cannot be interleaved with ledger events by sequence alone. Answer: correlate by `(occurred_at, run_id, call_site_key)`; errors are not replay inputs. |
| 4 | **Capture at the four existing funnels, not at call sites** — `apps/api/src/index.ts:158-191`, `apps/runner/src/index.ts:2504-2526`, `packages/providers/src/index.ts:195-386`, `packages/db/src/index.ts:14-72` — plus process-level handlers. | **HIGH** | Funnel capture loses locality: an error caught at the API funnel has already lost the intermediate frames that a call-site capture would have kept. Mitigation is recommendation 1 (`cause` preserves them). |
| 5 | **Resolve the git state before granting any fix authority** (D5.1/R59). | **HIGH** | It is not an observability requirement and V may reasonably say so. But the alternative is a listener whose two headline capabilities are unusable, discovered at P3 instead of now. |
| 6 | **Make the RED→GREEN proof the qualifying criterion for auto-apply; make diff size only a ceiling** (D3/E1). | **HIGH** | Test-writing is itself LLM work and a plausible-but-wrong RED test would launder a bad fix through the gate. Mitigation: the regression circuit-breaker (R54), which is the only guardrail that catches wrong rather than forbidden. |
| 7 | **Run the listener as an ops agent with a least-privilege DB role that cannot read debate content** (R41/R57). | **HIGH** | An agent that cannot read the failing question will sometimes be unable to explain a content-dependent failure. Accepted: that class escalates to a human who can. |
| 8 | **Ship stall/absence detection with the capture layer, not after it** (R09/R10). The largest known failure class today throws nothing (`PROCESS_DEATH_STALL`). | **MEDIUM-HIGH** | It expands P1 beyond "capture what throws", which is what V asked for first, and stall detection needs the reaper that does not exist (`apps/scheduler/src/index.ts:87-89`). Answer: V asked for "when something does not work" in the same sentence. |
| 9 | **Reconcile the contract event vocabulary with the DDL before designing the layer** (E6-3, A3 #8). | **MEDIUM-HIGH** | It is scope creep into the product contract. But building an error taxonomy on top of a vocabulary where 19 of 29 members are unproducible — including `node.failed`, `ledger.failure` and `ledger.attempt` — bakes the lie in. |
| 10 | **Lift the redaction kernel from `apps/ui/lib/observability/logger.ts:88-202` into a shared package and use it for both sinks** (R14). | **MEDIUM-HIGH** | It is UI-authored code hardened for a JSONL developer sink, not for a durable store, and its patterns (`:83-86`) are regex-based and will miss novel secret shapes. Answer: one imperfect redactor that is tested and shared beats two that drift. |

---

## Contested decisions for V

| Id | Decision | Options | My pick | Why (and the strongest counter) |
|---|---|---|---|---|
| **E1** | QUICK-FIX threshold | (a) proof-only · (b) proof + hard ceiling · (c) count-only · (d) narrow allowlist | **(b)** | Proof is what makes a fix safe; the ceiling bounds blast radius. **Counter:** the ceiling rewards compressing changes into less-reviewable forms; (d) is safer and covers less. |
| **E2** | QUICK-FIX landing | (a) direct to `main` · (b) direct to agent branch · (c) auto-merged PR into `dev` · (d) batched daily PR | **(c)** | Removes the wait, keeps the artefact, keeps one-commit-one-revert, lands off `main`. **Counter:** an auto-merged PR is ceremony over a direct commit; (d) destroys the revert property. |
| **E3** | Listener runtime + model + cap | (a) ops agent on V's machine via CLI relay · (b) same on the server later · (c) in-product with direct API (needs DR-179 lifted) | **(a) → (b); never (c)** | DR-179-compliant, zero idle cost, no new product failure surface. Model choice deliberately left to V. Dollar cap **UNVERIFIED** — cap on calls + wall-clock. **Counter:** a laptop loop is not permanent; a silently-off listener is worse than none (→ R40). |
| **E4** | Error-data retention under DR-188 | (a) keep everything · (b) tiered: full events short window, group aggregates forever · (c) fixed short retention | **(b)** | Rests on classifying error events as operational telemetry, not product data — defensible because B4 stores no product content. Supported by `AMENDMENTS.md:20` (DR-188 governs migrations/datadirs, not rows). **Counter:** "it's only telemetry" is how preservation laws erode, and the events do carry user-linking pseudonyms. |
| **E5** | Security-zone boundary | (a) fully exclude · (b) boundary capture, code-only, report-only · (c) capture normally | **(b)** | The shared handler (`apps/api/src/index.ts:179`) and shared `packages/db` (seam S6) mean full exclusion blinds infrastructure health on the auth path. **Counter:** even code-only capture is an auth-failure oracle, and it puts data about a stopped, defect-known mission into an unreviewed store. |
| **E6-1** | Repository git state | fix now · fix before P3 · leave | **fix before P3 (surface now)** | 4 265 phantom deletions and an untracked product tree make PR authority physically impossible. **Counter:** out of scope for an observability mission — true, but it gates the mission's second half. |
| **E6-3** | Contract vs DDL event vocabulary | widen DDL · delete unproducible members · leave | **decide before architecture** | 13 of 26 declared event types cannot be persisted; one UI branch is already dead code. **Counter:** touching the wire contract is its own mission. |
| **E6-7** | `asker_id`/`session_id` in the error store | store · omit · hash again | **store, flagged as user-linked** | Run-level correlation is the backbone of the trace procedure. **Counter:** it creates a per-user error trail the erasure regime must reach. |
| **E6-9** | Alerting | none · severity-triggered notification · full paging | **severity-triggered, V to define** | Nothing above covers waking a human; a `FATAL` with the listener at P2 is currently just a row. **Counter:** alerting is an ops product of its own and may deserve a separate mission. |

---

## UNVERIFIED / gaps

1. **Hatchet's own failure retention.** `UNVERIFIED` — what the Hatchet engine
   records on a failed workflow, whether it retries idempotently, and whether
   its state is queryable from our side. Anchors: `apps/runner/src/main.ts:18-22,
   45-47`, `apps/api/src/index.ts:363-383`, `compose.dev.yaml:14-31`. I did not
   run the stack. This materially affects D1 (a second, external error source)
   and the runner's real retry semantics.
2. **Production error volume and rate.** `UNVERIFIED` — no production or staging
   traffic data exists in the repository. Every volume bound in B3.7 must be set
   by V or measured in P1.
3. **Model/CLI pricing.** `UNVERIFIED` — no pricing data in the repo; the relay
   surfaces usage only when the CLI reports it
   (`acceptance/relay-core.ts:36-45`). No dollar figure appears anywhere above.
4. **Pre-rework observability surface.** Partially `UNVERIFIED` — reconstructed
   from `docs/missions/2026-08-06-v3-programming/logs/LOAD-01-codex.log:1409-1410,
   1494-1495` and the two `.disabled` test files. Git archaeology is impossible:
   **no commit reachable from `--all` contains any path matching
   `observability`** (verified by walking `git ls-tree -r`). The layer was
   apparently never committed under any prefix.
5. **Zod v4 leakage across all issue codes.** Partially verified against the
   pinned `zod@4.4.3`: `too_small`, `invalid_value` and `unrecognized_keys` do
   not echo values; `invalid_type` echoes a type descriptor. `UNVERIFIED` for
   the remaining issue codes — hence B4.10 requires redaction regardless.
6. **Whether `apps/ui` or `web` is the live surface.** `pnpm build`
   (`package.json:12`) builds only `dialectical-engine-web`; the brief names
   `apps/ui`. Both are instrumented in my requirements; V should name one
   (E6-10).
7. **`core.run_progress_event` has no timestamp column** (`migrations/0000_s00.sql:68-74`)
   — only `at_seq`. I could not determine whether wall-clock time for existing
   run events is recoverable at all; if not, historical error correlation before
   the new store is impossible. Flagged, not resolved.
8. **The `.hermes/` and `docs/missions/` trees are large and I read only what
   the brief pointed to** plus the spine sections and the EXEC-01 handoff.
   Earlier rulings on observability may exist in mission logs I did not open.
9. **Runtime behaviour was not executed.** Every claim above is from static
   reading of the working tree plus two isolated `node`/`zod` probes. I did not
   start Postgres, the API, the runner, or the acceptance harness. Claims about
   what *would* happen at runtime (notably the `JUDGEMENT_POLICY_UNRESOLVED`
   path at `apps/runner/src/index.ts:1227-1232`) are read off the control flow,
   not observed.
10. **`packages/serve` (2 026 lines) and `packages/evaluator` (4 866 lines)**
    were surveyed by targeted grep for throw/catch sites rather than read in
    full. Their error inventories above are complete for `catch` blocks and
    `throw` counts, but I may have missed non-throwing silent-failure paths
    inside them.
11. **Retention vs crypto-shredding interaction.** I have not verified how the
    existing erasure regime enumerates the tables it must reach, so B4.7's
    requirement is stated structurally rather than against a concrete
    mechanism. That mechanism lives inside the excluded zone.
