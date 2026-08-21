# Codex — Observability requirements (2026-08-21-observability-loop)

## Verdict summary

1. The current repo has useful typed errors, lineage, provider-attempt records, run events, and one developer JSONL sink, but no production-wide error boundary or durable error store.
2. `packages/liveness` detects answer staleness, not dead processes, expired work claims, stuck queues, or a listener that silently stopped.
3. “Every throw” requires both standardized throw-site/catch-before-transform capture and runtime boundaries; process handlers alone are too late and miss handled throws.
4. The store must be append-only, privacy-allowlisted, causally linked, version-stamped, and paired with a bounded non-database spool; total sink failure must produce an explicit capture-gap verdict, never a false claim of completeness.
5. Error messages, stacks, provider failures, code comments, and tool output are attacker-influenced data. None may become agent instructions, shell text, branch names, or PR metadata without structural sanitization.
6. The listener should be a cheap deterministic daemon over a durable queue; it should spawn short-lived, read-only CLI-agent diagnoses only for eligible incidents, not keep an LLM session permanently alive.
7. Delivery should be at-least-once from a durable cursor/outbox, with `LISTEN/NOTIFY` only as a latency hint and polling as reconciliation.
8. QUICK-FIX must mean a machine-proved, tiny allowlisted patch through an auto-merged PR—not a direct commit—and must exclude every high-risk floor category.
9. One regression, repeat fingerprint, policy ambiguity, missing telemetry, or guardrail failure must disable mutation; one automatic revert is allowed, then humans own the incident.
10. Capture/store are product components; diagnosis/fix is an ops agent governed by the Graph Spine. V must rule on autonomy, budget, retention, security-boundary behavior, and whether merge implies deployment.

## RQ-A — Failure-surface ground truth

### A1. Throws, catches, logs, swallows, and current unhandled destinations

The inventory below is a static source review, not a runtime proof. Counts and dynamically thrown third-party failures are **UNVERIFIED**. “No repo handler” means no handler was found in the cited runtime entry/boundary; the host/framework’s ultimate behavior is **UNVERIFIED**.

| Runtime | Current behavior and unhandled destination |
|---|---|
| `api` | Fastify is constructed with `logger: false`; its error handler converts route failures to 4xx/5xx bodies but records nothing, and after streaming headers it destroys the connection and swallows nested transport errors (`apps/api/src/index.ts:142-190`). Startup is a sequence of top-level awaits ending in `listen`, with no repo-level catch or `process` handler (`apps/api/src/main.ts:30-48`, `apps/api/src/main.ts:109-120`). Thus route errors become responses or aborted streams; startup/unhandled process failures leave repo control. |
| `runner` | The Hatchet task wrapper catches execution errors, attempts to persist a typed terminal failure, then rethrows; failure-recording failure becomes `RUNNER_FAILURE_STATE_NOT_RECORDED` (`apps/runner/src/index.ts:2494-2523`). The process startup/register/start path has no repo-level catch or process handler (`apps/runner/src/main.ts:42-47`). Errors outside the task wrapper leave repo control. |
| `scheduler` | The CLI validates the command, runs one job, prints a report, and closes the pool in `finally`; it has no catch/logging boundary (`apps/scheduler/src/cli.ts:5-24`). The root `package.json` exposes replay, liveness, and settlement commands (`package.json:24-28`). A job throw therefore leaves repo control after pool cleanup. |
| `evaluator-worker` | This package exports functions but exposes no start script or process entry (`apps/evaluator-worker/package.json:1-12`). It deliberately swallows a preflight receipt-store outage, converts policy-read failures to `SKIPPED`, reduces per-run harvest exceptions to a generic failed state, and reduces metering exceptions to counters (`apps/evaluator-worker/src/index.ts:135-162`, `apps/evaluator-worker/src/index.ts:192-269`). Its production caller/runtime and final unhandled destination are **UNVERIFIED**. |
| `replay` | The CLI validates input, reads the attestation, runs a read-only ceremony, and closes its pool in `finally`; only a completed-but-inexact report explicitly sets exit code 1 (`apps/replay/src/cli.ts:5-18`). Thrown parse/query/replay errors leave repo control. Replay itself refuses non-single-strength or structurally nonempty shapes (`apps/replay/src/index.ts:68-83`). |
| `ui` server | The Next proxy turns a rejected upstream fetch into an unlogged 502 (`apps/ui/app/api/[...path]/route.ts:37-69`). SSR helpers convert transport/contract failures to `pending`, `failed`, or page error state (`apps/ui/lib/serverApi.ts:62-98`, `apps/ui/app/page.tsx:18-35`). Framework-level render/process error disposition is **UNVERIFIED**. |
| `ui` client | The scoring error boundary renders a fallback but has no `componentDidCatch` capture (`apps/ui/components/ScoringErrorBoundary.tsx:15-37`). Other catches erase details, e.g. node history becomes empty (`apps/ui/components/NodeDetailDrawer.tsx:126-142`), and multiple refreshes are launched with `void` (`apps/ui/app/debate/[id]/DebatePageClient.tsx:636-660`). Browser-global `error`/`unhandledrejection` capture is absent from the reviewed boundary and otherwise **UNVERIFIED**. |

| Package | Observed failure form / local disposition |
|---|---|
| `battery` | Throws contract, claim-bound, and terminal-reason validation errors; caller owns disposition (`packages/battery/src/index.ts:115`, `packages/battery/src/index.ts:224-230`, `packages/battery/src/index.ts:404`). |
| `budget` | Throws invalid consumption, missing run, and budget state errors; caller owns disposition (`packages/budget/src/index.ts:138-159`, `packages/budget/src/index.ts:252-259`). |
| `contract` | Converts fetch and response-parse failures into `ContractHttpError` but does not preserve `cause`; callers often convert them again to UI states (`packages/contract/src/client.ts:80-102`). |
| `critique` | Throws typed configuration/admission/isolation errors; caller owns disposition (`packages/critique/src/index.ts:255-305`, `packages/critique/src/index.ts:381`). |
| `crypto` | Normalizes several underlying failures into authentication errors, intentionally hiding the original failure class (`packages/crypto/src/index.ts:153-168`). This high-risk package is observation/escalation-only for the fix agent. |
| `db` | Wraps query/connect failures into typed failures; pool errors are emitted only to `console.error` and latched for later calls (`packages/db/src/index.ts:39-72`, `packages/db/src/index.ts:74-120`). |
| `evaluator` | Throws provider HTTP and domain errors and contains many catch/transform paths; one provider probe catch preserves an error only long enough to derive a result (`packages/evaluator/src/index.ts:158-173`). Exhaustive disposition is **UNVERIFIED** because this source is large. |
| `evidence` | Throws typed plan, freshness, score-source, and citation-gate errors; caller owns disposition (`packages/evidence/src/index.ts:16-41`, `packages/evidence/src/index.ts:102-165`). |
| `graph` | Converts a caught storage/integrity error to `EDGE_INTEGRITY_ERROR`, preserving only a message (`packages/graph/src/index.ts:299-330`); other typed graph errors propagate. |
| `judgement` | Converts provider content failures and parser failures to judge/review typed codes, generally retaining only parse text (`packages/judgement/src/index.ts:125-163`, `packages/judgement/src/index.ts:226-234`). |
| `kernel` | Defines the common `TypedDomainError(code,message)` without a cause field (`packages/kernel/src/index.ts:283-287`); its validation throws propagate. |
| `ledger` | Throws replay-identity, completeness, reconstruction, and missing-result errors; caller owns disposition (`packages/ledger/src/index.ts:95-107`, `packages/ledger/src/index.ts:395-433`). |
| `liveness` | Throws projection, cycle, policy, query, and trigger-state errors; it models content staleness, not runtime health (`packages/liveness/src/index.ts:38-80`, `packages/liveness/src/index.ts:100-122`). |
| `memory` | Throws typed canonicalization, cap, provenance, and missing-link errors; caller owns disposition (`packages/memory/src/index.ts:58`, `packages/memory/src/index.ts:129-138`, `packages/memory/src/index.ts:407`). |
| `propagation` | Throws typed malformed graph/order/cycle/invariant errors; caller owns disposition (`packages/propagation/src/index.ts:174-231`, `packages/propagation/src/index.ts:298`). |
| `providers` | Captures each attempt, records ledger outcome, retains the last raw cause in `ProviderCallFailedError`, and after bounded attempts throws (`packages/providers/src/index.ts:213-385`). Content rejection instead exposes parse text as the error message (`packages/providers/src/index.ts:62-74`). |
| `published-arithmetic` | One invalid empty-input guard throws; caller owns disposition (`packages/published-arithmetic/src/index.ts:12`). |
| `register` | Throws invalid/unresolved/unprovenanced register errors; caller owns disposition (`packages/register/src/index.ts:67-105`, `packages/register/src/index.ts:121-150`). |
| `serve` | Throws typed honesty, magnitude, band, and persisted-state errors; caller owns disposition (`packages/serve/src/index.ts:40`, `packages/serve/src/index.ts:209-247`). |
| `settlement` | Throws typed policy/numeric/provenance and mandatory-human errors; caller owns disposition (`packages/settlement/src/index.ts:46-86`, `packages/settlement/src/index.ts:443-445`). |
| `valuation` | Throws typed weight, criteria, option, and derivation errors; caller owns disposition (`packages/valuation/src/index.ts:113-129`, `packages/valuation/src/index.ts:182-230`). |

- **OBS-CODEX-R01:** Every runtime shall have an explicit last-chance capture boundary for startup failure, uncaught exception, unhandled rejection, shutdown failure, and framework/worker crash. The boundary shall emit once, flush only within a hard deadline, and then preserve the runtime’s normal failure semantics. This prevents silent process death and “observability kept the zombie alive.”
- **OBS-CODEX-R02:** Every package throw/catch/transform shall be classified as expected-domain, degraded-operation, or incident. Every actual throw is recorded, but expected refusals shall not page or enter the fix queue unless rate/anomaly rules promote them. This prevents both invisible handled failures and alert storms from normal validation.
- **OBS-CODEX-R03:** CI shall maintain a generated throw/catch/fire-and-forget inventory and fail on an unclassified new `throw`, bare catch, discarded promise, or error wrapper that loses cause/correlation. This prevents the static inventory from becoming stale immediately.

**Recommendation — confidence HIGH:** instrument throw/catch discipline plus runtime boundaries, not runtime boundaries alone. **Strongest counter-argument:** standardized throw-site capture is invasive and can duplicate events; event identity and rethrow deduplication therefore become mandatory.

### A2. What the rework dropped

The defensible finding is narrower than the intake’s word “dismantled”: the load lane deleted the active observability logger tests and reintroduced them as `.disabled` (`docs/missions/2026-08-06-v3-programming/logs/LOAD-01-codex.log:1401-1413`, `docs/missions/2026-08-06-v3-programming/logs/LOAD-01-codex.log:1488-1499`). Current logger files are untracked in this worktree, and path-scoped `git log` yielded no history; commit-level provenance is therefore **UNVERIFIED**.

The surviving surface carries levels/categories, request/session/user/debate/run/artifact identifiers, a shaped error and root hint (`apps/ui/lib/observability/logger.ts:5-51`); redaction and size bounds (`apps/ui/lib/observability/logger.ts:76-201`); and suspicious scoring signals for empty output, missing required fields, and missing artifact chain (`apps/ui/lib/observability/suspiciousScoring.ts:82-115`). Disabled tests show the former active contracts for JSONL shape, redaction, sink-failure isolation, and suspicious-root hints (`apps/ui/lib/observability/logger.test.mjs.disabled:65-155`, `apps/ui/lib/observability/logger.contract.test.mjs.disabled:65-111`). The scoring signal still has a callable seam (`apps/ui/lib/scoringResponse.ts:213-219`), but production call-site coverage is **UNVERIFIED**.

- **OBS-CODEX-R04:** Restore the behavioral guarantees—not the old sink—as active tests for the new layer: structured shape, correlation, redaction, bounded payloads, suspicious-success detection, and sink-failure isolation. This prevents regression by copying dormant code without active proof.
- **OBS-CODEX-R05:** Preserve `scoring.empty_output`, `scoring.success_missing_required_fields`, and `scoring.missing_artifact_chain` as semantic-failure classes, mapped to the new taxonomy and store. This prevents “HTTP 200 but product truth is broken” from disappearing.
- **OBS-CODEX-R06:** Record the exact pre-rework commit/file provenance as an architecture prerequisite; until a reachable git object proves more, no requirement may claim that server-wide production capture previously existed. This prevents mythology from becoming scope.

**Recommendation — confidence HIGH:** treat active test coverage and production attachment as what was demonstrably lost; treat broader historical functionality as **UNVERIFIED**. **Strongest counter-argument:** a missing local git object may hide relevant history; synthesis can add it only with a checkable commit/path citation.

### A3. “Something does not work” modes

| Failure mode | Detectable today? | Evidence / gap |
|---|---|---|
| Hung/stuck claimed work | Partly represented, not detected | `core.work_item` has `READY/CLAIMED/DONE/FAILED` and `claim_deadline` (`migrations/0000_s00.sql:97-115`), but the scheduler reaper is still a throwing scaffold (`apps/scheduler/src/index.ts:87-89`). |
| Dead runner / stalled queue | Invisible to product store | Runner tasks persist terminal failure only after the wrapper executes (`apps/runner/src/index.ts:2504-2523`); no heartbeat/queue-age detector was found. Hatchet’s own operational behavior is **UNVERIFIED**. |
| Intra-run WAIT/budget stall | State is queryable, general stall is not | Latest WAIT rows are queryable and must drain at completion (`packages/db/src/index.ts:495-543`); the run projection derives queued/running/failed and cooldown hold (`packages/db/src/index.ts:430-455`). No deadline breach incident is emitted. |
| Provider timeout/failure | Yes, per attempt | Provider attempts become `FAILED`/`TIMED_OUT` ledger outcomes and end in a typed failure after bounded attempts (`packages/providers/src/index.ts:348-385`). |
| Provider/model version skew | Yes, after a sweep and only for recorded artifacts | Liveness compares recorded model versions and fires staleness triggers (`packages/liveness/src/index.ts:302-341`). This is content freshness, not build skew or process-version skew. |
| Parse/schema failure | Yes, provider path | `raw_artifact.parse_error` is required for `PARSE_FAILED/SCHEMA_FAILED` (`migrations/0004_s04.sql:11-22`), and provider content classification persists it (`packages/providers/src/index.ts:263-320`). |
| Silent scheduler no-op | Present and invisible | `runSettlementWatch` defaults to empty outcomes and reports zero work (`apps/scheduler/src/index.ts:101-118`), while the CLI invokes it without an adapter (`apps/scheduler/src/cli.ts:16-20`). |
| Evaluator dead-letter/exhaustion | Partial | Terminal harvest skips candidates after a bounded count of failed pipeline events and converts thrown harvests to a generic result (`apps/evaluator-worker/src/index.ts:192-254`). Whether a human-visible dead-letter exists is **UNVERIFIED**. |
| Replay drift | Partial | Continuous replay rejects any row with nonempty arrow order (`apps/scheduler/src/index.ts:18-71`); launch replay rejects nontrivial shapes (`apps/replay/src/index.ts:68-83`). |
| UI semantic/render/network failure | User-visible, ops-invisible | Proxy rejection returns 502 without durable capture (`apps/ui/app/api/[...path]/route.ts:50-59`); render boundary only flips UI state (`apps/ui/components/ScoringErrorBoundary.tsx:21-37`). |
| Stale answer/content | Yes | `packages/liveness` projects freshness/review/stale/archive states and sweeps content by policy (`packages/liveness/src/index.ts:24-62`, `packages/liveness/src/index.ts:344-394`). |

- **OBS-CODEX-R07:** Define independent detectors for claim-deadline breach, oldest-ready age, missing worker heartbeat, no run-progress delta, WAIT age, cooldown overdue, provider failure burst, parse/schema burst, scheduler expected-vs-observed cadence, replay unsupported/drift, and listener heartbeat/cursor lag. Each detector shall name its clock, subject, threshold source, and recovery evidence. This prevents a stored state from being mistaken for an active detector.
- **OBS-CODEX-R08:** `packages/liveness` shall remain the content-staleness owner. Runtime-health detectors may consume its events but shall not reuse its “liveness” states for worker/process health. This prevents semantic collision between stale answers and dead infrastructure.
- **OBS-CODEX-R09:** Every periodic job shall persist “scheduled, started, succeeded/failed/no-op, next due” evidence; a no-op shall be lawful only when its input count is recorded. This prevents a stopped watch and a healthy empty watch from looking identical.
- **OBS-CODEX-R10:** Unsupported replay shape shall itself be an observable `CAPABILITY_GAP`, never counted as replay success. This prevents false-green reproducibility.
- **OBS-CODEX-R11:** Thresholds shall be register/policy values with provenance and a safe initial report-only calibration period; current workload baselines are **UNVERIFIED**. This prevents arbitrary constants from paging or fixing the product.

**Recommendation — confidence HIGH:** build a separate runtime-health detector family and reuse liveness only as a correlated content signal. **Strongest counter-argument:** more detectors create noise; persisted expected cadence, promotion windows, and evidence-bearing thresholds are required to control it.

### A4. Reuse versus supersede

- **OBS-CODEX-R12 (dev JSONL — supersede as primary, reuse tests/redaction ideas):** Keep it explicitly developer-local and separate. Its README forbids DB/user exposure for those diagnostics (`apps/ui/lib/observability/README.md:1-18`), it defaults to development-only (`apps/ui/lib/observability/logger.ts:204-218`), uses synchronous filesystem writes, and swallows every sink failure (`apps/ui/lib/observability/logger.ts:224-243`). The new store shall not import or silently widen this logger’s contract. This prevents production dependence on a best-effort synchronous dev file and privacy-policy confusion.
- **OBS-CODEX-R13 (`parse_error` — reuse the typed pairing pattern, not the free text):** Reuse the enforced status/error pairing (`migrations/0004_s04.sql:11-22`) and artifact/ledger references, but store only a bounded sanitized error code/template in ops records; raw parse text remains excluded from agent prompts. This prevents prompt injection and private provider content leakage through parser messages.
- **OBS-CODEX-R14 (`ledger`/`register` — reuse provenance/append patterns, separate bounded context):** Reuse monotonic ordering, actor/outcome/hash/time provenance from ledger entries (`migrations/0000_s00.sql:155-172`) and version/source provenance from register reads (`packages/register/src/index.ts:67-105`). Do not put generic errors into the action-kind ledger or policy into error payloads. This prevents vocabulary pollution and makes error retention/privileges independently governable.
- **OBS-CODEX-R15 (`acceptance/` — extend as black-box proof, never production dependency):** The harness deliberately imports shipped APIs while production never imports it (`acceptance/README.md:1-8`) and observes DB state rather than calling behind the dispatch boundary (`acceptance/run-acceptance.ts:228-243`). Reuse that shape for injected failures, DB outage/spool recovery, privacy canaries, process crash, listener restart, trace termination, and auto-fix rollback. This prevents a test-only side channel from masquerading as production attachment.

**Recommendation — confidence HIGH:** create a new production bounded context while borrowing proven invariants and harness patterns. **Strongest counter-argument:** a second event family increases joins and operational complexity; generic errors nevertheless have different privacy, rate, retention, and listener semantics from product actions.

### A5. Grounded taxonomy

- **OBS-CODEX-R16:** Every occurrence shall have exactly one primary class: `EXPECTED_DOMAIN` (typed refusal/validation), `TRANSPORT_PROVIDER`, `CONTENT_PARSE_SCHEMA`, `PERSISTENCE_INTEGRITY`, `WORKFLOW_STALL`, `SEMANTIC_SILENT_FAILURE`, `VERSION_CONFIG_SKEW`, `UI_CLIENT`, `OBSERVABILITY_FAILURE`, or `AGENT_GOVERNANCE`. These classes derive respectively from typed domain errors (`packages/kernel/src/index.ts:283-287`), provider outcomes (`packages/providers/src/index.ts:348-385`), parse status (`migrations/0004_s04.sql:11-22`), DB normalization (`packages/db/src/index.ts:39-120`), work states (`migrations/0000_s00.sql:97-115`), suspicious scoring (`apps/ui/lib/observability/suspiciousScoring.ts:82-115`), model-version detection (`packages/liveness/src/index.ts:302-341`), UI catches, and the new watcher itself. This prevents an abstract taxonomy unrelated to real signals.
- **OBS-CODEX-R17:** Severity shall be objective: `S0` safety/security/data-loss or fleet-wide unavailable; `S1` run-ending/persistence/worker death; `S2` degraded branch/job or repeated external failure; `S3` recoverable single occurrence/suspicious success; `S4` expected domain refusal. Promotion shall depend on breadth, duration, recurrence, and affected runs—not LLM sentiment. This prevents attacker-written text from assigning urgency.
- **OBS-CODEX-R18:** Attribution shall include runtime app, owning package, operation/call-site, build/deploy identity, and applicable run/work/node/attempt/ledger references. Unknowns shall be explicit reasoned states, not null ambiguity. This prevents the listener from guessing component ownership.

**Recommendation — confidence MEDIUM-HIGH:** adopt this closed primary taxonomy with orthogonal severity and disposition. **Strongest counter-argument:** some incidents span categories; causal links and secondary tags may represent that without allowing multiple competing primary classes.

## RQ-B — Error capture and the error store

### B1. Required capture points

- **OBS-CODEX-R19:** Standardized error construction/capture shall record every first-party throw before control transfers. A lint shall forbid raw `throw` outside approved helpers, and a rethrow shall retain the original event identity. This prevents handled throws from vanishing and rethrows from double-counting.
- **OBS-CODEX-R20:** Catch blocks that transform, downgrade, return fallback state, or swallow shall capture the incoming error and record the resulting disposition before losing detail. This directly covers API stream aborts, evaluator best-effort receipts, UI empty-state fallbacks, and observability’s own swallow paths (`apps/api/src/index.ts:158-175`, `apps/evaluator-worker/src/index.ts:143-162`, `apps/ui/components/NodeDetailDrawer.tsx:132-138`, `apps/ui/lib/observability/suspiciousScoring.ts:131-141`).
- **OBS-CODEX-R21:** API capture shall cover startup, request ID allocation, pre-handler/auth boundary metadata, route handler errors, Fastify error-handler disposition, streaming abort after headers, response status, and shutdown. It shall never capture auth body/header values. This prevents unlogged 500s and security-data leakage.
- **OBS-CODEX-R22:** Runner capture shall cover process startup, Hatchet registration/start, task receipt, work claim, each provider attempt, terminal-failure persistence, task rethrow, and worker shutdown. This prevents an engine crash before/after the current task wrapper from being invisible.
- **OBS-CODEX-R23:** Scheduler/replay/evaluator capture shall wrap every command/job invocation with scheduled/start/finish/exception/timeout/no-op facts and an idempotent invocation ID. This prevents orphan jobs and dead watches.
- **OBS-CODEX-R24:** Provider capture shall reuse attempt/ledger references and record transport, HTTP, timeout, content rejection, persistence-of-attempt failure, and retry disposition; raw request/response and parse message shall not cross into the error store or listener. This prevents missing provider roots and injection via payloads.
- **OBS-CODEX-R25:** DB capture shall cover pool errors, query/connect/transaction failures, migration attempts only as escalate-only metadata, and error-store write failures through a nonrecursive health channel. This prevents the store from hiding the very DB outage being diagnosed.
- **OBS-CODEX-R26:** UI server capture shall cover proxy rejection, SSR data failures, framework route/render boundaries, and server process errors. UI client capture shall cover React error boundaries, `window.error`, `unhandledrejection`, SSE parse/disconnect, and discarded promises, using a privacy-safe same-origin reporting boundary with bounded offline buffering. This prevents browser-only failures from remaining user anecdotes.
- **OBS-CODEX-R27:** Third-party/library throws shall be captured at the nearest owned boundary with vendor component and sanitized stable classification. The system shall not attempt to monkey-patch every dependency throw. This prevents fragile global instrumentation and still records externally generated errors.

**Recommendation — confidence HIGH:** combine owned throw-site capture, catch-before-transform, and runtime/framework boundaries. **Strongest counter-argument:** coverage work is cross-cutting; rollout gates must prove overhead and duplicate suppression before broad activation.

### B2. Mandatory event semantics for trace termination

- **OBS-CODEX-R28:** Mandatory on every occurrence: immutable event ID; monotonic occurrence sequence; occurred/captured timestamps; environment; build commit plus dirty/deploy marker; runtime/app; component/package; operation/capture point; stable error code (or `UNKNOWN_ERROR`); taxonomy/severity; handled/rethrown/terminal disposition; fingerprint plus fingerprint-version; and redaction-policy version/result. This prevents version-skew and ambiguous-record roots.
- **OBS-CODEX-R29:** Every event shall have a trace ID and explicit applicability states for request, session-pseudonym, debate, run, work item, node, attempt, raw-artifact reference, ledger entry, provider, and job invocation. Each field is either a valid opaque reference, `NOT_APPLICABLE`, or `UNKNOWN:<reason>`. This prevents null from meaning both “not relevant” and “capture failed.”
- **OBS-CODEX-R30:** Causality shall be explicit: parent event ID or `NO_CAUSE`; wrapper/rethrow relationship; retry-of; spawned-by; and preceding relevant sequence. Unknown cause shall be `CAUSE_NOT_CAPTURED:<reason>`. This prevents an infinite “look for parent” loop.
- **OBS-CODEX-R31:** The safe error representation shall include exception class, sanitized stable message template/code, bounded repo-relative stack frames, and cause depth—never arbitrary object serialization. Stack unavailable/truncated shall carry a reason. This prevents hidden truncation and secret-bearing stack/object capture.
- **OBS-CODEX-R32:** Component ownership and source position shall be derived from a versioned build manifest/source map, not from attacker text. Client events shall carry asset/build hash. This prevents false attribution and client/server version-skew blindness.
- **OBS-CODEX-R33:** Every event shall bind to capture status `PERSISTED`, `SPOOLED`, or `GAP_RECONSTRUCTED`; a persisted capture-gap marker shall quantify lost/unavailable sequences. This prevents the trace agent from claiming completeness after sink failure.
- **OBS-CODEX-R34:** A machine trace may start only from an event satisfying R28-R33. Otherwise it must terminate `INSUFFICIENT_CAPTURE`, never synthesize missing lineage. This prevents fabricated roots.

**Recommendation — confidence HIGH:** make explicit unknown/applicability and capture-integrity fields mandatory. **Strongest counter-argument:** larger records cost storage; shared fingerprint/stack dictionaries and minimal occurrence records can reduce duplication without dropping semantics.

### B3. Storage, resilience, bounds, indexes, retention

- **OBS-CODEX-R35:** The new Postgres bounded context shall be represented in both migrations and Drizzle metadata because the repo uses Postgres plus `drizzle-orm` (`packages/db/package.json:1`, `packages/db/src/schema.ts:1-15`). Architecture/migration work remains high-risk and human-controlled.
- **OBS-CODEX-R36:** Persist separate logical records for immutable occurrences, deduplicated incident projections, causal links, listener delivery/ack attempts, trace verdicts, agent actions, budget usage, policy decisions, and spool-ingest receipts. Requirements specify semantics only; exact schema is deferred. This prevents one mutable “error row” from erasing history or conflating capture with remediation.
- **OBS-CODEX-R37:** Occurrences, traces, and agent actions shall be append-only with monotonic ordering, following the repo’s sequence and reject-mutation pattern (`migrations/0000_s00.sql:9-39`). Corrections shall append superseding facts. This prevents the fixer from rewriting its own audit trail.
- **OBS-CODEX-R38:** Product execution shall enqueue a bounded safe envelope without synchronously waiting for a network or database write. An asynchronous writer shall use a separate pool/transaction from the failing product operation. This prevents observability from extending or aborting product transactions.
- **OBS-CODEX-R39:** If Postgres is unavailable, a pre-opened, append-only local spool shall accept the already-redacted envelope. On recovery, ingestion shall be idempotent by event ID and append a spool receipt. This prevents DB failure from erasing DB-failure evidence.
- **OBS-CODEX-R40:** Observability failures shall never recursively call the normal capture path. A separate fixed-code health channel, circuit breaker, and counter shall report sink state. This prevents error-on-error recursion and disk/DB storms.
- **OBS-CODEX-R41:** If queue and spool are both unavailable/full, product flow shall continue, increment a nonblocking loss counter, and later append one `CAPTURE_GAP` marker with time/sequence/count bounds. Absolute capture is impossible under simultaneous DB/disk/memory loss; the acceptance contract shall test truthful degradation, not claim losslessness. This prevents a false “every error stored” guarantee and prevents the logger from taking down the product.
- **OBS-CODEX-R42:** No thrown occurrence shall be sampled away during normal capacity. Repeated fingerprints may share stack/template payloads, but each occurrence retains minimal time/component/correlation/disposition. This prevents deduplication from hiding rate and blast radius.
- **OBS-CODEX-R43:** Initial provisional bounds shall be: safe envelope at most 8 KiB, 32 stack frames, cause depth 16, per-process memory queue at most 64 MiB or 10,000 occurrences (whichever first), degrade-to-minimal at 80%, then spool. Capacity shall be re-based to at least 10× observed peak before production authority; current peak is **UNVERIFIED**. This prevents unbounded memory/disk use.
- **OBS-CODEX-R44:** Listener-serving indexes shall support monotonic unacked sequence; severity/time; fingerprint/time; component/build/time; trace/run/work/node/attempt/ledger correlation; causal parent; delivery lease/ack; and agent-action/fix fingerprint. Query plans at 10× projected retention shall be acceptance evidence. This prevents the listener from becoming a table-scan outage.
- **OBS-CODEX-R45:** No automatic deletion/pruning shall exist until V rules on E4 under DR-188 (`docs/missions/2026-08-21-observability-loop/brief.md:55-64`). Compaction, partition movement, and key destruction shall be separately authorized and auditable. This prevents a storage optimization from deleting product evidence.

**Recommendation — confidence HIGH on semantics, MEDIUM on provisional numeric bounds:** use Postgres as truth plus a bounded redacted local spool and explicit gaps. **Strongest counter-argument:** local spools add operational and privacy burden; without one, DB outages are exactly when the most important evidence disappears.

### B4. Privacy and capture-time redaction

- **OBS-CODEX-R46:** Never store or transmit to ops/agent surfaces: debate/question/claim/answer text; private prompts; provider request/response/raw artifact; parse text derived from raw content; secrets, keys, passwords, tokens, cookies, authorization headers; email/phone/IP/user-agent; local absolute home paths; environment values; arbitrary request bodies/headers/query strings; or serialized unknown objects. This prevents private-content, credential, and attacker-payload exfiltration.
- **OBS-CODEX-R47:** Redaction shall be allowlist-based per event type, before queue/spool/DB/network. Unknown fields are rejected; a minimal fixed-code event replaces the payload. The existing dev logger’s denylist regex and recursive serializer (`apps/ui/lib/observability/logger.ts:83-181`) may inform tests but is insufficient as the production boundary. This prevents novel secret names and nested objects from bypassing key-pattern redaction.
- **OBS-CODEX-R48:** Error messages shall be mapped to stable codes/templates at capture. Unrecognized text may be hashed locally for deduplication but shall not be stored or sent to an LLM. This prevents prompt injection and secret leakage through `Error.message`.
- **OBS-CODEX-R49:** Stack frames shall be normalized to repo-relative file/module/function/line using the trusted build manifest; argument values, absolute paths, source snippets, and URL text are forbidden. This prevents workstation identity and injected URL/query leakage.
- **OBS-CODEX-R50:** User/session correlation shall use opaque, purpose-scoped keyed pseudonyms whose key can be destroyed for crypto-shredding. Product IDs may be stored only where necessary for root tracing and under least-privilege access; agent prompts receive narrower incident-local aliases. This prevents permanent cross-purpose identity linkage.
- **OBS-CODEX-R51:** Every capture shall record redaction policy version, allowlisted field set ID, safe-envelope hash, and whether fallback minimization occurred; privacy canary tests shall cover secrets in keys, values, messages, stacks, causes, URLs, and provider output. This prevents silent redactor regression.

**Recommendation — confidence HIGH:** default-deny structured envelopes with no raw error text. **Strongest counter-argument:** removing messages can slow diagnosis; stable codes, safe templates, source frames, causal lineage, and a human-only privileged investigation path are safer than exposing attacker-controlled text to an autonomous agent.

### B5. Overhead and failure isolation

- **OBS-CODEX-R52:** At steady state, capture preparation/enqueue shall add no synchronous I/O, target p99 ≤1 ms, and cause ≤0.5% throughput and ≤1% p99 latency regression under acceptance load. Current baselines are **UNVERIFIED**, so these are provisional gates, not observed facts. This prevents observability from becoming a hot-path outage.
- **OBS-CODEX-R53:** Capture shall be total and nonthrowing after the product error exists; serialization/redaction failure falls back to a fixed minimal event. This prevents a secondary capture exception from replacing the original failure.
- **OBS-CODEX-R54:** Backpressure sequence shall be: normal full envelope → minimal occurrence → local spool → counted gap, with hysteresis before recovery. Product requests/jobs shall never wait for queue space. This prevents blocking, oscillation, and memory exhaustion.
- **OBS-CODEX-R55:** Rate controls shall coalesce payload dictionaries, not occurrences. An attack that generates unique messages must not create unique fingerprints because fingerprint inputs exclude raw text and use trusted code/location/class. This prevents cardinality bombs.
- **OBS-CODEX-R56:** The writer shall batch within bounded latency, use separate least-privilege credentials/pool, and open its circuit on repeated DB failure. This prevents connection-pool starvation and recursive persistence load.
- **OBS-CODEX-R57:** Client reporting shall be size/rate bounded, same-origin, unauthenticated-payload-minimal, and discarded safely offline after a fixed local bound with a visible gap count; it shall never block rendering. This prevents a browser error storm or offline tab from exhausting client/server resources.
- **OBS-CODEX-R58:** Chaos acceptance shall cover DB unavailable, disk full/read-only, queue full, malformed/cyclic error object, 10× burst, redactor failure, recursive writer failure, process crash during flush, and recovery/reingest. Pass means product failure semantics remain unchanged and any evidence loss is explicit. This prevents happy-path-only resilience claims.

**Recommendation — confidence MEDIUM-HIGH:** use these hard degradation semantics and provisional performance gates. **Strongest counter-argument:** ≤1 ms/0.5% may be unrealistic in client/server variants; V may relax numbers only with measured evidence, never the nonblocking/fail-open product rule.

### B6. Excluded security-zone boundary

- **OBS-CODEX-R59:** Capture only at the already-existing outer API/process boundary. If a failure crosses from the excluded zone, emit `EXCLUDED_SECURITY_BOUNDARY_FAILURE` with time, outer operation, build, severity, and an opaque zone marker—no inner stack, message, identifiers, auth route/body/header, or cause walk. The excluded scope is defined by the brief (`docs/missions/2026-08-21-observability-loop/brief.md:48-53`). This prevents both total outage blindness and accidental instrumentation/data capture inside W.I.P. security code.
- **OBS-CODEX-R60:** Every such event is `ESCALATE`, never LLM-traced, auto-fixed, replayed, or included in generated patches/PR details. Aggregates may show counts/availability only. This prevents security work and attacker-influenced auth errors from entering autonomous mutation.
- **OBS-CODEX-R61:** Zone membership shall come from a human-owned immutable path/module manifest checked both at capture and before agent dispatch; uncertain attribution is treated as excluded. This prevents refactors or generated imports from bypassing the boundary.

**Recommendation — confidence HIGH:** metadata-only outer-boundary capture with mandatory escalation. **Strongest counter-argument:** full exclusion minimizes leakage further; it also makes a zone-caused fleet outage indistinguishable from a dead API, so the metadata-only compromise is preferable.

## RQ-C — Root-cause traceability

### C1. Code/event preconditions

- **OBS-CODEX-R62:** All first-party operational errors shall have a stable code, safe template, owning component, operation, and native `cause` chain. `TypedDomainError` currently holds only code/message (`packages/kernel/src/index.ts:283-287`), while only selected provider failures retain `cause` (`packages/providers/src/index.ts:46-59`). This prevents wrappers from erasing causal identity.
- **OBS-CODEX-R63:** Catch-and-wrap shall preserve original event ID/cause and add wrapper context; it shall never interpolate raw upstream text into a new message. This prevents both trace breaks and injection propagation.
- **OBS-CODEX-R64:** Correlation context shall propagate across HTTP, Hatchet dispatch, DB work item, provider attempt, scheduler invocation, replay, SSE, SSR proxy, and client report. Context creation/absence shall be explicit at each boundary. This prevents orphan events.
- **OBS-CODEX-R65:** Run lineage shall connect run → work item → attempt → provider ledger/raw-artifact reference → node/review/propagation/serve facts using existing opaque identifiers; the agent shall not read `raw_text`. Existing ledger inputs already carry run/attempt/call-site/subject/hash/artifact/times (`packages/ledger/src/index.ts:13-53`). This prevents root tracing from requiring private payloads.
- **OBS-CODEX-R66:** Every build/deploy shall publish a trusted component/source manifest and source-map identity tied to the commit; mixed versions in one trace become a first-class `VERSION_SKEW` candidate. This prevents tracing today’s source against yesterday’s event.
- **OBS-CODEX-R67:** CI shall reject swallowed errors, cause-losing wrappers, bare fire-and-forget promises, and missing correlation at declared async boundaries unless an explicit expected-disposition record is produced. This prevents known trace breaks from reappearing.

**Recommendation — confidence HIGH:** stable typed causes plus end-to-end correlation are prerequisites for machine tracing. **Strongest counter-argument:** retrofitting all wrappers is large; phase rollout may prioritize production entry paths, but fix authority remains disabled until coverage gates pass.

### C2. Deterministic terminating trace procedure

- **OBS-CODEX-R68:** Step 1: load the immutable occurrence by event ID/sequence; verify envelope hash, redaction receipt, build manifest, and capture status. Invalid/missing evidence terminates `CAPTURE_CORRUPT` or `INSUFFICIENT_CAPTURE`.
- **OBS-CODEX-R69:** Step 2: walk explicit cause/wrapper/retry/spawn links backward with a visited-ID set and hard maximum 64 hops. Stop on `NO_CAUSE`, missing parent, self-link, repeated ID, or limit; emit `CAUSE_CYCLE`, `CAUSE_GAP`, or `CAUSE_DEPTH_EXCEEDED` rather than looping.
- **OBS-CODEX-R70:** Step 3: query the trace/request/job/run/work/node/attempt/ledger lineage at or before the event sequence; validate that IDs agree and flag cross-run, future-sequence, or build mismatch as corruption. This prevents a coincidental correlated row from becoming the root.
- **OBS-CODEX-R71:** Step 4: order relevant state transitions and find the earliest invariant divergence after the last confirmed success: claim expiry, missing progress, failed provider attempt, parse/schema rejection, DB failure, config/build skew, or semantic-success detector. Record alternative candidates and disconfirming evidence.
- **OBS-CODEX-R72:** Step 5: replay only a safe deterministic subsystem for which the event’s recorded shape is supported and private input is not needed. Current replay’s nontrivial shape refusal (`apps/replay/src/index.ts:68-83`) must produce `REPLAY_UNSUPPORTED`, not a retry loop or root claim.
- **OBS-CODEX-R73:** Step 6: stop with exactly one verdict: `ROOT_CONFIRMED_INTERNAL`, `ROOT_CONFIRMED_EXTERNAL`, `ROOT_POLICY_EXPECTED`, `ROOT_CAPTURE_LAYER`, `INSUFFICIENT_EVIDENCE`, `CAPTURE_GAP`, `CORRUPT_LINEAGE`, or `UNSUPPORTED_REPLAY`. Every verdict shall cite event/sequence/source facts and confidence derived from evidence class, not model self-rating.
- **OBS-CODEX-R74:** Step 7: persist the trace verdict, evidence IDs, visited path, queries/manifest versions, elapsed resources, and whether fix classification is permitted. Only then acknowledge delivery. This prevents lost investigations and ack-before-verdict.
- **OBS-CODEX-R75:** Trace execution gets three bounded attempts across transient store failures; deterministic poison/corrupt events go directly to dead-letter and humans. The same trace input/version shall be idempotent. This prevents retrace storms and dead-end backlog starvation.

**Recommendation — confidence HIGH:** use a deterministic graph/lineage walk with explicit terminal failure verdicts. **Strongest counter-argument:** many roots will initially be `INSUFFICIENT_EVIDENCE`; that truthful result is preferable to an LLM guessing and drives capture remediation.

### C3. Current trace breakers and remediation class

| Current case | Why tracing breaks | Required remediation class |
|---|---|---|
| API error handler sends message but does not log; stream nested catches vanish (`apps/api/src/index.ts:158-190`) | No event/correlation/disposition for 500 or aborted stream | Boundary capture before response/return; safe message template; retain request/build. |
| Evaluator preflight receipt catch is empty (`apps/evaluator-worker/src/index.ts:143-147`) | Store failure is indistinguishable from no attempted receipt | Best-effort capture health event via nonrecursive channel. |
| Evaluator policy/harvest/metering catches discard cause (`apps/evaluator-worker/src/index.ts:158-162`, `apps/evaluator-worker/src/index.ts:243-269`) | Only generic state remains | Capture incoming event ID and attach it to returned failed/skipped result. |
| Contract client wraps fetch/schema errors without `cause` (`packages/contract/src/client.ts:89-102`) | Network/parser origin and stack are replaced | Cause-preserving wrapper plus boundary event; never pass raw server message to agent. |
| Runner parser wrapper reduces error to message (`apps/runner/src/index.ts:862-867`) | Parser type/path and causal identity are lost | Safe typed cause plus artifact/attempt reference. |
| Runner schema repair injects parse error into a provider prompt (`apps/runner/src/index.ts:883-888`) | Provider/error text can act as instructions | Treat parse detail as untrusted structured code; no verbatim error text in prompts. |
| Runner review catch replaces most errors with generic `NODE_REVIEW_UNAVAILABLE` (`apps/runner/src/index.ts:1783-1793`) | Underlying root disappears | Preserve cause/event ID while presenting generic user-safe error. |
| UI proxy catch returns generic 502 (`apps/ui/app/api/[...path]/route.ts:50-59`) | Upstream transport root, request correlation, and build are absent | Server boundary capture and trace header propagation. |
| SSR helper converts errors to pending states (`apps/ui/lib/serverApi.ts:62-98`) | User recovery state has no ops occurrence | Capture transform disposition with shared trace ID. |
| React error boundary has no logging lifecycle (`apps/ui/components/ScoringErrorBoundary.tsx:15-37`) | Render failure is visible only in UI | Client boundary report with component/build/route, no props/state/text. |
| Node history catch erases the error (`apps/ui/components/NodeDetailDrawer.tsx:126-138`) | Empty history and failed load look identical | Record degraded-operation event before fallback. |
| Dev observability swallows its own failures (`apps/ui/lib/observability/logger.ts:224-243`) | Sink failure is unknowable | Separate capture-health channel/counter; do not recursively use normal writer. |

- **OBS-CODEX-R76:** Remediation order shall be boundary capture → cause preservation → correlation propagation → eliminated verbatim error-to-prompt paths → static enforcement. This prevents cosmetic logging from leaving the causal chain broken.
- **OBS-CODEX-R77:** A swallowed error is permitted only when the returned fallback/degraded state contains the captured event ID or an explicit privacy-safe incident reference. This prevents silent fallback equivalence.
- **OBS-CODEX-R78:** A fire-and-forget operation is permitted only through a supervised helper that records start/settle/reject and component ownership; raw `void promise` is forbidden at production async boundaries. This prevents promise rejection loss.

**Recommendation — confidence HIGH:** treat these as release-blocking traceability debt before any fix authority. **Strongest counter-argument:** some UI gesture catches are expected and harmless; the rule can classify expected platform exceptions without sending them to the fix queue, while still recording aggregate disposition where useful.

### C4. Definition of root

- **OBS-CODEX-R79:** “Root” is the earliest evidenced condition in the captured causal/lineage graph whose absence would have prevented the observed failure, at the lowest boundary the system can responsibly control. The latest thrown wrapper is the proximate cause, not automatically the root.
- **OBS-CODEX-R80:** Tracing stops internal when a specific source/invariant/config/build/persistence fact is evidenced and no earlier captured cause exists; it stops external at the owned adapter boundary when the evidence proves provider/network/OS/database service failure outside repo control. “External” shall name boundary and evidence, not blame a vendor by guess.
- **OBS-CODEX-R81:** Expected policy/domain refusal is a valid terminal root and never a code-fix candidate unless recurrence shows a separate detector root such as invalid caller behavior or config skew. This prevents the agent from “fixing” intended guards.
- **OBS-CODEX-R82:** Missing evidence, unsupported replay, security-zone boundary, and capture gaps are terminal non-root verdicts that always escalate/report; the agent must not recurse into code search until it finds a plausible narrative. This prevents infinite tracing and confirmation bias.

**Recommendation — confidence HIGH:** distinguish proximate, internal root, external boundary root, expected root, and non-root terminal verdicts. **Strongest counter-argument:** counterfactual causality can be ambiguous; requiring an evidence chain and alternatives keeps ambiguity explicit.

## RQ-D — The listener loop agent

### D1. Trigger transport and delivery guarantees

| Option | Restart/missed-event behavior | Backlog/latency/cost verdict |
|---|---|---|
| Poll occurrence/outbox | Durable if cursor queries immutable rows; does not depend on being connected. | Predictable backlog recovery; latency and repeated-query load trade off with interval. Acceptable as reconciliation, not sole low-latency mechanism. |
| PostgreSQL `LISTEN/NOTIFY` alone | `LISTEN` is session registration and is cleared when the session ends; only currently listening sessions receive notifications ([PostgreSQL LISTEN](https://www.postgresql.org/docs/current/sql-listen.html)). | Low latency, but notification is a hint. `NOTIFY` is delivered on commit, duplicate notifications may fold, payload is bounded, and a full notification queue can fail commits ([PostgreSQL NOTIFY](https://www.postgresql.org/docs/current/sql-notify.html)). Unacceptable as source of truth. |
| Durable outbox/tail + notification hint | Immutable row is truth; notification wakes a consumer; cursor poll reconciles restarts/gaps. | Best fit for at-least-once, backlog, low idle query rate, and bounded latency; additional records/worker semantics required. |

- **OBS-CODEX-R83:** Use an immutable durable dispatch/outbox record committed with the occurrence (or deterministically derived from it), `LISTEN/NOTIFY` carrying only a safe key as wake-up hint, and periodic cursor reconciliation. This prevents missed work on listener restart and avoids large/injected notification payloads.
- **OBS-CODEX-R84:** Delivery guarantee shall be at-least-once. Consumers shall have durable identity, monotonic cursor, lease/attempt facts, ack only after trace verdict persistence, and idempotency by event/trace-policy version. This prevents loss and duplicate fixes.
- **OBS-CODEX-R85:** Startup shall establish listening, snapshot/reconcile the cursor boundary, then process; reconnect shall repeat reconciliation. This prevents the LISTEN initialization race.
- **OBS-CODEX-R86:** Backlog processing shall prioritize S0/S1 and oldest-within-severity, cap concurrent diagnoses, and preserve fairness so a poison event cannot block the cursor. This prevents starvation and burst spend.
- **OBS-CODEX-R87:** Notification failure or lag shall never fail the product transaction; durable rows remain discoverable by poll, and notification health becomes a capture-layer incident. This prevents observability transport from taking down writes.
- **OBS-CODEX-R88:** End-to-end wake latency target is p95 ≤5 s when healthy; reconciliation shall discover any committed unacked row within 60 s. Values are provisional pending deployment measurement. This prevents “moment errors are thrown” from remaining qualitative.

**Recommendation — confidence HIGH:** durable outbox/cursor + `LISTEN/NOTIFY` hint + reconciliation poll. **Strongest counter-argument:** polling alone is simpler; the hybrid earns its complexity only if low-latency acceptance evidence is required by V’s “moment” wording.

### D2. Runtime under DR-179

Existing acceptance relays prove local CLI transports, not a production listener: Codex is invoked as an isolated read-only one-shot and reports no usage (`acceptance/model-shim.ts:130-159`); Claude uses no session persistence/no tools and can report usage/cost when present (`acceptance/claude-relay.ts:44-105`); Grok similarly disables memory/subagents/web/tools (`acceptance/grok-relay.ts:17-88`). The acceptance relay lives outside production reachability (`acceptance/README.md:1-8`).

- **OBS-CODEX-R89:** The permanent component shall be a deterministic non-LLM daemon that waits on the durable queue. It shall spawn a fresh short-lived CLI-agent process per eligible incident/batch; no idle LLM session and no shared conversational memory. This prevents idle spend, context poisoning, cross-incident leakage, and an immortal compromised session.
- **OBS-CODEX-R90:** Under DR-179, model access shall be local authenticated CLI only. Initial recommendation is the Codex CLI with the V-ruled `gpt-5.6-sol` coding model recorded at intake (`docs/missions/2026-08-21-observability-loop/00-intake-H0.md:77-84`), but model identity must be captured from the CLI, not assumed. This prevents API-key policy violation and false lineage.
- **OBS-CODEX-R91:** Diagnosis phase shall run read-only, no network/web, no subagents, no project-global ambient credentials, no interactive shell, and no session resume. Mutation requires a separate policy-approved executor with a new capability. This prevents an injected incident from escalating its own privileges.
- **OBS-CODEX-R92:** Run first on V’s machine under an OS supervisor with a human-owned kill switch. Moving to dezbatere.ro requires a separately approved CLI authentication, least-privilege service account, process supervision, encrypted spool, and cost/telemetry proof; availability is **UNVERIFIED**. This prevents copying workstation assumptions to production.
- **OBS-CODEX-R93:** Idle model cost shall be zero calls; active cost shall be measured per trace/fix attempt. Missing cost or token telemetry counts against conservative fixed per-job budgets and blocks mutation when monthly accounting cannot be proven. Codex’s current relay returns `usage: null` (`acceptance/model-shim.ts:130-139`). This prevents unknown usage from bypassing caps.
- **OBS-CODEX-R94:** Hard caps before V rules otherwise: 20 diagnoses/day, 5 patch attempts/day, 2 concurrent diagnoses, 1 concurrent mutation, and €50 equivalent incremental monthly model spend. Any unmeasurable monetary usage consumes one conservative daily slot; crossing any cap switches to queue-and-report only. This prevents runaway spend.
- **OBS-CODEX-R95:** If V lifts DR-179, an API worker may replace CLI transport only after equivalent identity, usage/cost, data residency/privacy, tool isolation, rate limit, and kill-switch gates; lifting API-key hold does not expand fix authority. This prevents transport change from becoming a governance bypass.

**Recommendation — confidence MEDIUM-HIGH:** deterministic resident daemon + event-spawned Codex CLI workers on V’s machine, with €50/month and activity caps. **Strongest counter-argument:** process startup adds latency and a subscription may not expose monetary cost; short-lived isolation and token/job caps are safer than a persistent context.

### D3. Objective fix-magnitude taxonomy

- **OBS-CODEX-R96 (QUICK-FIX, all conditions mandatory):** exactly one incident fingerprint with `ROOT_CONFIRMED_INTERNAL`; deterministic RED reproducer; at most one non-generated production file plus one test file; at most 20 production changed lines and 50 total changed lines; no dependency/lockfile/public API/wire format/config/schema/data/query/credential change; path and dependency graph wholly in a V-approved low-risk allowlist; full scoped tests, typecheck/lint, and relevant acceptance gates GREEN; clean base SHA; no prior auto-fix/revert/same fingerprint in 30 days; and independent deterministic policy gate passes. This prevents “small diff” from hiding high blast radius, weak evidence, or flapping.
- **OBS-CODEX-R97:** QUICK-FIX examples are limited to provable local defects such as a missing await in an allowlisted adapter, a null guard matching an existing contract, or a wrong local constant already fixed by a failing test. Comments/docs-only edits are not runtime fixes. An LLM’s confidence or “obviousness” is never a criterion. This prevents subjective magnitude and fake fixes.
- **OBS-CODEX-R98 (PR-FIX):** confirmed internal root, no forbidden/high-risk category, up to 10 files and 200 total changed lines, deterministic RED/GREEN evidence, and human merge required. Larger changes may still be proposed as an issue/trace, not agent-authored code. This prevents broad refactors disguised as routine PRs.
- **OBS-CODEX-R99 (ESCALATE):** always for security/auth/excluded zone; crypto/privacy; persistence/migrations/SQL/data retention; provider selection/spend/credentials; scoring/judgement/propagation semantics; live/product data; destructive actions; architecture/dependency boundaries; public contracts/protocol docs/board state; generated sources/build/deploy config; ambiguous/multiple roots; external root; missing/corrupt evidence; or agent/guardrail/audit changes. This implements the immutable high-risk floor (`docs/missions/2026-08-21-observability-loop/brief.md:65-73`) and prevents high-impact autonomy.
- **OBS-CODEX-R100:** File/line limits are necessary but not sufficient: a semantic risk classifier and dependency reachability gate shall independently reject a tiny forbidden change. This prevents one-line scoring/security/spend changes from qualifying.
- **OBS-CODEX-R101:** If a candidate crosses QUICK and PR criteria, the stricter tier wins. Unknown classification is ESCALATE. This prevents ambiguity from granting authority.
- **OBS-CODEX-R102:** Generated patch content shall be reclassified after generation; a generated import, symlink/path traversal, renaming, generated file, or test-command change that reaches a forbidden surface invalidates the attempt. This prevents guardrail bypass through generated code.

**Recommendation — confidence MEDIUM:** adopt the exact conservative thresholds above, subject to V’s E1 ruling. **Strongest counter-argument:** line/file thresholds are gameable and can reject safe mechanical changes; the semantic deny floor and V-approved allowlist matter more than size, so thresholds must never be the sole gate.

### D4. Guardrails and the failure each prevents

- **OBS-CODEX-R103:** Human-owned, read-only policy bundle with pinned hash; agent cannot edit its prompt, allowlist, denylist, limits, model/CLI selection, tests, audit writer, supervisor, or kill switch. Prevents **self-modification and safety erosion**.
- **OBS-CODEX-R104:** Hard deny by path, module/dependency reachability, file type, diff semantics, and ownership—checked before diagnosis dispatch, before patch, after patch, and before merge. Prevents **renaming/import/generated-code bypass into security, migrations, crypto, scoring, spend, architecture, protocol, board, or agent config**.
- **OBS-CODEX-R105:** Error payloads, stack/message strings, DB values, code comments, test output, provider output, issue/PR text, and tool output are untrusted data in typed envelopes. They never enter system/developer instructions and cannot request tools or relax policy. Prevents **prompt injection through errors or repository/tool content**.
- **OBS-CODEX-R106:** No raw error text is used in shell arguments, SQL, paths, filenames, branch names, commit messages, or PR fields. Fixed templates consume only validated IDs/codes. Prevents **command/SQL/path/metadata injection**.
- **OBS-CODEX-R107:** Diagnosis runs read-only with no network, no credentials, fixed query/tool allowlist, and bounded repo paths. Patch executor is a new ephemeral principal/worktree scoped to approved files. Prevents **capability escalation and data exfiltration from a poisoned diagnosis**.
- **OBS-CODEX-R108:** The model cannot invent shell/test commands. Tests and formatting are selected from a human-owned command catalog with fixed arguments. Prevents **arbitrary code execution via generated validation commands**.
- **OBS-CODEX-R109:** One active mutation per repository and one per fingerprint; base SHA must match; unrelated dirty state blocks. Prevents **racing fixes, overwrites, and attribution loss**.
- **OBS-CODEX-R110:** At-least-once delivery uses event/trace/fix idempotency keys. Prevents **duplicate branches, PRs, commits, and spend**.
- **OBS-CODEX-R111:** Fix cooldown: no new fix for the same fingerprint/component for 30 days after merge/revert; recurrence during canary escalates. Prevents **flapping and repeated wrong-fix cascades**.
- **OBS-CODEX-R112:** Rate caps from R94 plus maximum one QUICK-FIX merge/day during rollout and five/week steady-state until V raises it. Prevents **mass mutation during error storms**.
- **OBS-CODEX-R113:** Hard per-job token/time/tool/command limits and monthly budget; missing telemetry fails closed to report-only. Prevents **runaway spend and hung agents**.
- **OBS-CODEX-R114:** Global kill switch is out-of-band, human-owned, defaults mutation off after supervisor restart, and trips on budget/rate breach, audit/store outage, policy hash mismatch, capture gap, branch-protection failure, regression, or watcher anomaly. Prevents **uncontrolled continuation when safeguards are blind**.
- **OBS-CODEX-R115:** Every read, decision, prompt-envelope hash, model identity, tool call, file considered, diff, test, branch/PR/merge/revert, budget unit, denial, and kill event appends to the observability store. Prevents **unaccountable agent action**.
- **OBS-CODEX-R116:** A separate deterministic non-LLM watchdog monitors listener heartbeat, cursor lag, leases, audit continuity, spend counters, branch/PR outcomes, and policy hash; it cannot fix code. Prevents **the watcher declaring itself healthy (“who watches the watcher”)**.
- **OBS-CODEX-R117:** The agent may never modify capture/store/listener/agent/watchdog code or policy under QUICK/PR authority; those incidents always escalate. Prevents **self-repair becoming self-concealment**.
- **OBS-CODEX-R118:** Patch canary monitors the original fingerprint and adjacent error/latency/test signals. One deterministic automatic revert is allowed; after revert, mutation is disabled and humans own recovery. Prevents **wrong-fix cascades while avoiding revert/fix flapping**.
- **OBS-CODEX-R119:** A fix may address only one confirmed root. Bundling opportunistic cleanup, refactor, dependency update, formatting sweep, or unrelated failing test is forbidden. Prevents **scope creep and hidden architecture changes**.
- **OBS-CODEX-R120:** Test changes cannot weaken/delete/skip assertions, snapshots, lint, coverage, or acceptance gates; new RED test must fail on clean base for the expected reason. Prevents **manufactured GREEN proof**.
- **OBS-CODEX-R121:** Symlinks, submodules, path escapes, binary files, generated artifacts, vendored code, package manifests/locks, and repository hooks are denied. Prevents **filesystem/repository escape and persistence mechanisms**.
- **OBS-CODEX-R122:** Security-zone events never enter agent prompts, even sanitized beyond the fixed outer metadata. Prevents **auth/security prompt injection and scope violation**.

**Recommendation — confidence HIGH:** all guardrails above are hard preconditions, not advisory prompt text. **Strongest counter-argument:** this sharply limits successful autonomy; that is appropriate until empirical false-fix, bypass, and cost rates justify V-approved expansion.

### D5. Git/PR and lawful QUICK-FIX landing

- **OBS-CODEX-R123:** Branch names shall be `obs-agent/<safe-fingerprint>/<UTC-sequence>` using validated hashes only. Dedicated signed bot identity, base commit, policy hash, incident/trace IDs, and capability tier are recorded. This prevents injected branch text and ambiguous authorship.
- **OBS-CODEX-R124:** Every patch starts from current protected base in an ephemeral isolated worktree; stale base, dirty state, or changed protected policy aborts. This prevents patching the wrong version.
- **OBS-CODEX-R125:** PR body uses a fixed template: sanitized incident ID/fingerprint; root verdict and cited evidence IDs; causal path; RED command/result on base; diff scope; GREEN scoped/full gates; privacy/forbidden-surface attestations; risk tier; spend; rollback commit/plan; and canary window. No raw error text/provider content. This prevents evidence-free and injection-bearing PRs.
- **OBS-CODEX-R126:** QUICK-FIX shall open a PR and auto-merge only after protected required checks plus an independent deterministic policy bot approve. No direct commit. Human approval is not required, satisfying V’s grant while retaining a review object. This prevents unaudited main-branch mutation.
- **OBS-CODEX-R127:** PR-FIX shall require human CODEOWNER/domain review and merge. Any architecture indicator routes to Hermes/Graph Spine architecture intake and cannot be merged by the listener. Branch protection/CODEOWNERS presence is **UNVERIFIED** and is an activation prerequisite. This prevents the author agent from judging its own architectural reach.
- **OBS-CODEX-R128:** Merge shall not imply deploy/restart/data action. Production deployment authority is a separate V decision; default is code merge only. This prevents a small code patch from becoming an uncontrolled production operation.
- **OBS-CODEX-R129:** Each merge creates a deterministic revert reference. During canary, regression can trigger exactly one policy-bot revert PR/auto-merge using the same protected checks; any revert conflict escalates. This prevents irreversible fixes and unsafe hand-authored rollback.
- **OBS-CODEX-R130:** Auto-merge is allowed only while the original PR head/base/policy hashes match approved values and all checks are fresh. This prevents time-of-check/time-of-use substitution.
- **OBS-CODEX-R131:** Mission workers’ no-push law remains unchanged; only the future product capability may use these mechanics after activation (`docs/missions/2026-08-21-observability-loop/brief.md:70-73`). This prevents research/build agents from treating requirements as present authorization.

**Recommendation — confidence HIGH:** auto-merged protected PR for QUICK-FIX, human-merged PR for PR-FIX, no direct commits or deployment authority. **Strongest counter-argument:** PR/check latency weakens “quick”; auditability and automatic revert outweigh seconds/minutes for the tiny eligible tier.

### D6. Activation gating and rollout

- **OBS-CODEX-R132 (Gate 0 — V decisions):** E1-E6, excluded-zone manifest, retention, budget, allowlist, kill-switch custody, and merge-vs-deploy authority are ruled; architecture/migrations receive separate high-risk review. Exit: signed/pinned policy bundle. Prevents **autonomy under undecided policy**.
- **OBS-CODEX-R133 (Gate 1 — store/capture):** Tables/Drizzle metadata exist and are migrated by humans; capture is live with listener off. Exit: all runtimes/capture classes attached; privacy canaries pass; DB/disk/queue chaos produces no product regression and explicit gaps; p99 overhead gate passes; 7 days of volume baseline; excluded-zone test captures metadata only. Prevents **listener activation before trustworthy tables/capture**, honoring V’s ordering (`docs/missions/2026-08-21-observability-loop/brief.md:15-20`).
- **OBS-CODEX-R134 (Gate 2 — deterministic listener report-only):** Durable delivery and trace procedure run without LLM fixes. Exit: restart/backlog/poison tests show no unaccounted events; p95 wake/reconciliation targets pass; every trace terminates; ≥100 representative incidents receive human root-verdict review; zero private/raw payloads; false-root and insufficient-evidence rates reported. Prevents **fixing from an unproven trace loop**.
- **OBS-CODEX-R135 (Gate 3 — LLM diagnosis/report-only):** CLI agent may draft diagnosis and candidate diff but cannot write/branch. Exit: 30 days, budget observed, injection corpus yields zero instruction/tool-policy violations, ≥95% policy-denial correctness, and human agreement threshold ruled by V. Prevents **prompt injection and runaway cost before mutation**.
- **OBS-CODEX-R136 (Gate 4 — PR-FIX):** Agent may open non-auto-merge PRs within PR tier; all require human merge. Exit: at least 20 reviewed PR attempts or 30 days, whichever longer; no forbidden touch, no privacy leak, no audit gap, false-fix/revert rate reported. Prevents **jumping directly to self-merge**.
- **OBS-CODEX-R137 (Gate 5 — QUICK canary):** V explicitly enables allowlisted QUICK; one auto-merge/day, one component, one canary environment/branch. Exit after 30 days and ≥10 eligible fixes with zero forbidden touches, zero audit gaps, zero unrecovered regressions, and budget within cap. Prevents **fleet-wide wrong-fix cascade**.
- **OBS-CODEX-R138 (Gate 6 — steady state):** V may raise caps/allowlist only from evidence. Any policy/hash/audit/capture regression rolls authority back one gate automatically. Prevents **one-way privilege expansion**.

**Recommendation — confidence HIGH:** six fail-closed gates with report-only and human-merge stages before QUICK authority. **Strongest counter-argument:** collecting 20 PRs/10 QUICK fixes may take months at low error rates; calendar minimums plus V review are still safer than relaxing sample evidence silently.

### D7. Governance and architecture routing

- **OBS-CODEX-R139:** Capture library, error store, and deterministic dispatch/watchdog are product components. LLM diagnosis/fix is an ops agent under Graph Spine governance with explicit capability packets, audit, and human review. This prevents product error traffic from granting an unconstrained coding process standing authority.
- **OBS-CODEX-R140:** The listener may classify but may not decide that a change is non-architectural by itself. Deterministic indicators—dependency edge, public contract, storage/query, config/deploy, cross-package ownership, new abstraction, more than tier thresholds, or uncertain reach—route to architecture/Hermes and stop patching. This prevents architecture changes hidden in a normal PR.
- **OBS-CODEX-R141:** PR-FIX review shall include domain CODEOWNER plus an independent architecture-risk gate; QUICK includes the deterministic gate and a post-merge audit sample. Same model/session cannot be author and sole reviewer. This prevents self-review.
- **OBS-CODEX-R142:** Security/privacy/persistence/spend/scoring/live-data incidents route directly to named human owners and never through general PR generation. This prevents the Graph Spine high-risk floor from being downgraded by magnitude.
- **OBS-CODEX-R143:** Governance state, decisions, denials, and authority changes are append-only observable events watched by the non-LLM watchdog. This prevents off-record privilege changes.

**Recommendation — confidence HIGH:** split product capture from Graph-Spine-governed ops remediation. **Strongest counter-argument:** two governance planes add handoffs; they also enforce the necessary separation between “observe product” and “rewrite product.”

## RQ-E — Contested decisions for V

### E1. QUICK-FIX definition

- **OBS-CODEX-R144:** V must choose among: (A) R96 exact allowlisted ≤1 production +1 test file/20 production lines with RED/GREEN and all exclusions; (B) looser ≤3 files/50 production lines; (C) no QUICK initially. **Pick A. Confidence MEDIUM. Strongest counter-argument:** size is gameable and may reject safe changes; the semantic deny floor/allowlist remains controlling.

### E2. QUICK-FIX landing

- **OBS-CODEX-R145:** Options: direct protected-branch commit; auto-merged per-fix PR; batched auto-merged PR. **Pick per-fix auto-merged PR** with signed bot, immutable incident evidence, protected checks, deterministic policy approval, canary, and one-shot revert. Confidence HIGH. Strongest counter-argument: slower/noisier PR history; direct commits remove the safest audit/revert object and batching increases blast radius.

### E3. Listener runtime, model, budget

- **OBS-CODEX-R146:** Options: permanent conversational CLI session; deterministic daemon + event-spawned Codex CLI worker on V’s machine; always-on server API agent after DR-179. **Pick daemon + fresh `gpt-5.6-sol` Codex CLI workers on V’s machine**, initially report-only, with 20 diagnoses/day, 5 patch attempts/day, 2 diagnosis/1 mutation concurrency, and €50/month incremental cap; server move requires new approval. Confidence MEDIUM-HIGH. Strongest counter-argument: CLI startup latency and unavailable cost telemetry; fixed job/token slots compensate until accounting is proven.

### E4. Error-data retention under DR-188

- **OBS-CODEX-R147:** Options: indefinite hot append-only; automatic time deletion; V-gated hot/cold plus crypto-shredding. **Pick no deletion initially; after explicit V law, 90 days hot, 365 days encrypted cold, then retain minimal non-content audit indefinitely while destroying subject-link keys where erasure requires it.** Exact partition/archive mechanics are architecture work. Confidence MEDIUM. Strongest counter-argument: indefinite minimal records and one-year cold storage cost money; automatic deletion would violate current law and weaken incident/audit evidence.

### E5. Security-zone boundary

- **OBS-CODEX-R148:** Options: fully exclude; outer metadata-only capture; instrument inside. **Pick outer metadata-only capture** under R59-R61, always escalate and never send to LLM. Confidence HIGH. Strongest counter-argument: even metadata can reveal sensitive traffic patterns; full exclusion is safer for confidentiality but dangerously blind for API availability.

### E6. Additional V-only decisions

- **OBS-CODEX-R149:** V must decide whether an auto-merged QUICK fix may deploy/restart production. **Pick merge-only; deployment remains human-controlled.** Confidence HIGH. Counter-argument: delayed deployment weakens “quick,” but deployment has a materially larger operational blast radius.
- **OBS-CODEX-R150:** V must name kill-switch custodians and backup; **pick V plus one named ops delegate, either able to stop, both required to expand authority.** Confidence HIGH. Counter-argument: two-person expansion slows tuning; it prevents unilateral privilege growth.
- **OBS-CODEX-R151:** V must approve the initial low-risk path/module allowlist; **pick empty-by-default, then add only components with completed trace/capture tests and no high-risk reachability.** Confidence HIGH. Counter-argument: little autonomy at launch; that is the intended canary posture.
- **OBS-CODEX-R152:** V must decide acceptable capture loss under simultaneous sink exhaustion; **pick product fail-open plus explicit gap marker and immediate mutation kill.** Confidence HIGH. Counter-argument: this concedes not every occurrence is durable; blocking or crashing the product would be worse and still might not persist the event.
- **OBS-CODEX-R153:** V must define the false-fix/revert threshold for disabling QUICK; **pick any forbidden touch/audit gap immediately, or ≥1 auto-revert in 30 days, or >5% human-rejected root verdicts in the rolling reviewed sample.** Confidence MEDIUM. Counter-argument: one revert may be ordinary software risk; autonomous mutation deserves a stricter floor than human development.

## Ranked recommendations

1. **Keep mutation off until causal capture and deterministic trace termination pass. Confidence HIGH.** Strongest counter-argument: delays the visible fix agent; otherwise it will automate guesses.
2. **Use a durable outbox/cursor with `LISTEN/NOTIFY` only as a wake hint. Confidence HIGH.** Strongest counter-argument: polling alone is simpler; hybrid is justified by low-latency wording and restart safety.
3. **Treat all error/repo/tool text as untrusted data and never as instructions. Confidence HIGH.** Strongest counter-argument: losing raw messages slows diagnosis; stable safe codes/frames/lineage are the acceptable autonomous surface.
4. **Separate deterministic resident listener from fresh, read-only CLI-agent workers. Confidence HIGH.** Strongest counter-argument: startup overhead; it buys isolation, zero idle calls, and bounded context.
5. **Adopt auto-merged protected PRs—not direct commits—for QUICK. Confidence HIGH.** Strongest counter-argument: more latency/noise; audit/revert/branch checks are indispensable.
6. **Make high-risk and self/guardrail surfaces hard-denied by path plus semantic reachability. Confidence HIGH.** Strongest counter-argument: conservative false positives; false negatives are catastrophic.
7. **Use append-only Postgres truth plus a bounded redacted local spool and explicit gaps. Confidence HIGH.** Strongest counter-argument: spool privacy/operations; DB outages otherwise erase their own evidence.
8. **Keep `packages/liveness` scoped to content staleness; add separate runtime-health detectors. Confidence HIGH.** Strongest counter-argument: more concepts; overloading current states creates worse ambiguity.
9. **Start with R96’s tiny QUICK tier, one merge/day, one-shot revert, 30-day cooldown. Confidence MEDIUM.** Strongest counter-argument: too restrictive to be useful; evidence should earn expansion.
10. **Boundary-capture excluded security failures as metadata only and always escalate. Confidence HIGH.** Strongest counter-argument: metadata leakage; full exclusion loses availability truth.

## Contested decisions for V

| ID | Options | Codex pick | Why |
|---|---|---|---|
| E1 | Conservative QUICK / looser QUICK / none | R96 conservative exact threshold | Objective RED/GREEN + semantic deny + tiny scope bounds wrong-fix blast radius. |
| E2 | Direct commit / per-fix auto-PR / batch PR | Per-fix auto-merged protected PR | Preserves no-human-approval while retaining checks, audit, and revert unit. |
| E3 | Persistent CLI / event-spawned CLI / API server | Deterministic daemon + fresh Codex CLI on V machine; €50/month and R94 caps | Lawful under DR-179, zero idle calls, isolated incidents. |
| E4 | Indefinite hot / automatic deletion / V-gated tiering | No deletion now; later 90d hot +365d cold + key destruction/minimal audit | Complies with DR-188 and crypto-shredding without silently erasing evidence. |
| E5 | Full exclusion / boundary metadata / internal instrumentation | Boundary metadata only | Observes zone-caused availability without entering zone or exposing payloads. |
| E6a | Merge deploys / merge only | Merge only | Deployment is a separate high-blast-radius authority. |
| E6b | Kill owner | V + named ops delegate | Fast stop, dual-control authority expansion. |
| E6c | Initial allowlist broad / narrow / empty | Empty, evidence-driven additions | Fails closed while capture/trace mature. |
| E6d | Sink exhaustion blocks / fails open / crashes | Product fails open, explicit gap, mutation kill | Truthful compromise between product availability and impossible total-failure capture. |
| E6e | QUICK disable threshold | Any forbidden/audit breach; one auto-revert/30d; >5% rejected roots | Conservative empirical stop rule for autonomous mutation. |

## UNVERIFIED / gaps

- Commit-level reconstruction of `apps/v2-ui/lib/observability` and whether any production-wide logger existed: current files are untracked and path-scoped git history returned no objects.
- Exhaustive dynamic throw/catch inventory, third-party exception behavior, and actual host behavior for unhandled Node/Next/Hatchet failures.
- Production attachment, schedule, supervisor, and deployment topology for `evaluator-worker`, scheduler jobs, and the future listener.
- Hatchet’s durable failure/backlog/heartbeat guarantees and current dashboard/retention configuration; no claim in this artifact relies on them.
- Current error rate, event size, peak throughput, database/disk capacity, and performance baselines; R43/R52/R88 are provisional acceptance thresholds.
- Production branch protection, CODEOWNERS, CI required checks, signed-bot identity, auto-merge, and deploy/revert mechanics; these are activation prerequisites.
- CLI subscription quotas, marginal pricing, data handling, server authentication feasibility, and reliable Codex cost/token telemetry; existing Codex relay reports no usage.
- V’s lawful numeric retention, budget, allowlist, kill-switch custody, merge/deploy, and acceptable-capture-gap decisions.
- A safe, reliable way to identify an excluded-zone-origin error at the outer boundary without importing or inspecting inside it; architecture must prove the fixed metadata classifier.
- General replay support for nontrivial graphs; current replay paths explicitly refuse those shapes.
