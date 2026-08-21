# Plan.md — Observability layer + error-listener loop (ARCHITECTURE, C2 — rework round 1)

- **Mission:** `2026-08-21-observability-loop` · **Ticket:** ARCH-OBS-C2 · **Seat:** Claude C2 planner (fresh instance, SDK-subagent; same session as round 0)
- **Inputs:** `research/SYNTHESIS-requirements.md` (read in full), `research/POST-SYNTHESIS-RULINGS.md` (binding overlay — **wins on any conflict**), `00-intake-H0.md`, `brief.md`, `wayfinder/map.md` + T05, `reviews/H1-integrity-qa.md`, direct repo reads cited as `path:line`. **Rework round 1 inputs:** `reviews/H3-merge-rework-packet.md`, `reviews/H2-plan-fidelity-opus.md` (FID-01..17), `planning/PlanReview.md` (RT-01..42) — all read in full; every finding is addressed and mapped in §M. No blind-seat artifact was opened.
- **Precedence rule:** ruling ids (`R-E1..R-E5`, `R-BIGGER`, `R-E6-*`, adopted defaults `E6-01..E6-16`) > `OBS-Rnnn` rows > my judgement. Marks: **MUST** / **SHOULD** / **DECIDE-V** (collected in §K). Findings that could not be resolved without reopening a V ruling are ARCH→REQ rows in §K (rework rule 3), never guesses.
- **Scope law:** design only — no code, no migrations, no config. The excluded zone was read only at its outer mounts (`apps/api/src/index.ts:205-234`), never inside (OBS-R130).

---

## 0. Shape of the whole

One new bounded context, **`obs`**, split across the product/ops seam OBS-R125 fixes:

- **Product side (inside the reachability walk):** capture library `@debateai/obs-capture` + the `obs.*` Postgres tables. Imported by the three production roots (`apps/api/src/main.ts`, `apps/runner/src/main.ts`, `apps/scheduler/src/cli.ts` — roots per `acceptance/README.md:1-9`) plus a thin client seam in `apps/ui` (R-E6-10).
- **Ops side (outside the walk, like `acceptance/`):** `tools/obs-listener/` — deterministic daemon, ephemeral Codex CLI workers (R-E3), watchdog, `obsctl` human CLI. Anything touching a model or git lives here only (OBS-R125, DIV-08).
- **Identity separation is real, not nominal (RT-22/RT-28):** every obs component gets its **own OS-level and DB-level identity** — LOGIN database roles with distinct credentials, and (for the fix path) a separate OS user. No obs process ever connects as the product superuser.
- **Topology-neutral core, thin bindings** (ROW-TOPOLOGY): the core knows envelopes and sinks; per-runtime bindings are the only files docker-hatchet can obsolete. **No hard cross-mission ordering exists anywhere in this plan** (FID-11/RT-38 — see §G, container-topology gate).

Naming: "current algorithm version" throughout; the `dialectical-engine-v2ui` breach is handled in §H.3.

---

## A. Error store (`obs` schema)

### A.1 Placement and mechanics

- **MUST** — New Postgres bounded context: schema `obs` via `pgSchema("obs")` in `packages/db/src/schema.ts` (beside `packages/db/src/schema.ts:7-15`), created by the next-numbered migration (`0034_obs_foundation.sql`) under the existing `migrate()` runner (`packages/db/src/index.ts:123-149`). No column added to `ledger.ledger_entry`, `core.run_progress_event`, `core.work_item` (OBS-R028). Migrations `0030..0033` untouched (OBS-R130/R135).
- **MUST** — **Own ordering, never the global allocator** (OBS-R031, DIV-04): `CREATE SEQUENCE obs.occurrence_seq`. Verified hazard: `ledger.allocate_sequence()` is a single-row locked `UPDATE` (`migrations/0000_s00.sql:9-29`). Sequences are monotonic-with-gaps; the cursor acks rows and never counts them, so sequence gaps are lawful — **and are therefore explicitly NOT the audit-continuity signal** (RT-06; continuity is the hash chain, A.2).
- **MUST** — Immutability where it is audit (OBS-R030, DIV-03): `core.reject_mutation` attached per-table by the explicit-list idiom (`migrations/0000_s00.sql:314-331`) to every append-only obs table, **plus a `BEFORE TRUNCATE … FOR EACH STATEMENT` reject trigger on each** — row-level triggers do not fire on TRUNCATE (RT-06). Mutable tables are enumerated with their reconstruction story (A.2).

### A.2 Table family (logical records per OBS-R029)

Append-only + `reject_mutation` + truncate-reject:

| Table | Holds | Key ids |
|---|---|---|
| `obs.occurrence` | one captured event (all sources); **UNIQUE `(source, source_event_ref)`** so at-least-once ingest is idempotent by constraint, inserted `ON CONFLICT DO NOTHING` — the only lawful ingest form under the immutability trigger (RT-13) | OBS-R029/R032 |
| `obs.occurrence_detail` | human-only detail, first-party only (A.6) | OBS-R050 |
| `obs.delivery` | per-occurrence lease/attempt/ack facts | OBS-R080 |
| `obs.trace` | trace verdict + evidence, persisted before ack | OBS-R075 |
| `obs.agent_action` | every listener/worker/supervisor/obsctl action | OBS-R111 |
| `obs.policy_decision` | deterministic gate evaluations, input-hashed | OBS-R094 |
| `obs.budget_usage` | spend facts (calls/day, wall-clock) | OBS-R089/R107, R-E3 |
| `obs.spool_receipt` | idempotent spool re-ingest receipts | OBS-R041 |
| `obs.capture_gap` | counted loss windows per source (incl. `unclassified` and client-drop classes — RT-09, FID-16) | OBS-R058, R-E6-13 |
| `obs.zone_daily` | anonymous zone counter deltas (E.4) | R-E5 |
| `obs.source_link` | evidenced cross-source merges, both retained | OBS-R139/R140, E6-16 |

- **MUST — audit continuity is a hash chain, not a sequence (RT-06):** `obs.occurrence` and `obs.agent_action` each carry `prev_hash`, chained per `(source, writer_identity)`; **"audit gap" is DEFINED as a broken chain link**, which is what D.7's trip and OBS-R123's "zero audit gaps" gate criterion evaluate. Deletion or truncation now has a signature distinct from routine sequence caching, independent of who holds superuser.

Mutable, each with a reconstruction story:

| Table | Why mutable | Reconstruction |
|---|---|---|
| `obs.incident` | fingerprint-level projection: first/last seen, distinct-work-unit count (A.4), max severity, state machine (NEW→RESEARCHING→PROPOSED→APPROVED→TICKETED→FIXING→FIXED / REGRESSED / ESCALATED / PARKED), source set, cooldown, **`attributed_landing_ref` + `lineage_depth`** (RT-24) | deterministic fold over `occurrence` + `agent_action`; watchdog re-derives a sampled subset daily, drift = self-event (DIV-03 counter answered) |
| `obs.consumer_cursor` | one row per consumer (listener, hatchet-ingest) | replayable from `obs.delivery` / ingest receipts |
| `obs.component_health` | dashboard heartbeat row per component | ephemeral health; every state *transition* is additionally a self-event occurrence. **This table is display, never authority — authority reads the proof artifact (A.5), not this row** |

**MUST** — no automated deletion; no role holds DELETE; retention floor per OBS-R045 under **DR-188** (the intake's banked data-preservation law, named here per FID-15). E4 stays PARKED AS MOOT (R-E4).

### A.3 Occurrence envelope (OBS-R032/R033/R034/R036/R039)

`occurrence_id` · `occ_seq` · `prev_hash` (A.2) · `occurred_at`/`captured_at` · `environment` · **`build_ref` + `build_dirty`** — interim (pre-ROW-GIT): stamped **once per process start** as `UNTRACKED-DEV:<HEAD-sha>:<process-start>` — cheap, stable within a process lifetime, honest about not identifying a build; **the "did my own fix regress it" question is explicitly unavailable until ROW-GIT lands** (RT-42) · `runtime` (closed: `api|runner|scheduler|evaluator-lib|ui-client|listener|watchdog|ingest`) · `component` (structural `(process, package, call_site_key?, organ?)` — OBS-R009; `call_site_key` precedent: `migrations/0021_dr174_cooldown_prune.sql:14-16`, provider `callSiteKey`) · `capture_point` (closed: `process|http|job|provider|db|client|detector|boundary|self`) · `code` (registry member — OBS-R011; **the machine-readable code registry is a named G1 deliverable in §G, pinned in the policy bundle**, FID-04) · `taxonomy_class` + `severity` + `condition_mark` (below) · `disposition` · `fingerprint` + `fingerprint_version` · `redaction_policy_version` + `allowlist_set_id` + `fallback_minimized` (OBS-R054) · `capture_status` (`PERSISTED|SPOOLED|GAP_RECONSTRUCTED`, OBS-R039) · correlation refs (three-state) · cause refs · `at_seq_watermark` (**three-state**, C.4) · `frames` (bounded, repo-relative, normalized — OBS-R051; **zone-scrubbed per E.3 before any sink**) · `safe_template_id` (OBS-R049) · `source` (`first_party|hatchet|ui_client`) + `source_event_ref` · `zone_context` (boolean column, **not** a fingerprint input — FID-09) · `attempt_index` (evidence for RT-14).

- **MUST — closed taxonomy, named (FID-04, OBS-R007):** `taxonomy_class` initial closed vocabulary, grounded in present-tree signals and pinned in the policy bundle at G0 (extension = human re-pin, never runtime): `PROCESS_DEATH · HTTP_FAILURE · JOB_FAILURE · PROVIDER_EXHAUSTED · DB_FAILURE · PARSE_SCHEMA_FAILURE` (anchor: `raw_artifact.parse_error` PARSE_FAILED/SCHEMA_FAILED, `migrations/0004_s04.sql`) `· STALL_DETECTED · SILENT_NOOP · SUSPICIOUS_SUCCESS` (first-class semantic-failure class per OBS-R012 — subclasses `empty_output`, `missing_required_fields`, `missing_artifact_chain`, seeded from the surviving `apps/ui/lib/observability/suspiciousScoring.ts` per intake fact 1 — FID-02) `· CLIENT_FAILURE · CAPTURE_SELF · ORIGIN_UNKNOWN` (RT-09).
- **MUST — severity is an obs-owned ordered ladder (RT-41):** `severity ∈ INFO < DEGRADED < SEVERE < FATAL`. `CONDITION_MARKS` (`packages/kernel/src/index.ts:69-112`) is an **unordered** vocabulary whose header reserves minting — obs does not extend or order it; the observed mark rides the separate non-ordering `condition_mark` column. This satisfies OBS-R008's reuse *intent* while arguing the deviation OBS-R008 (SHOULD) permits: `≥` over an unordered set is not evaluable. The code/mark → ladder mapping is a deterministic table in the policy bundle.
- **MUST — severity promotion (FID-04, OBS-R010):** promotion depends only on breadth, duration, recurrence and affected runs — computed over trusted structural fields; **never on model sentiment and never on attacker-influenceable text**. Hatchet-sourced and client-sourced occurrences enter at a floor severity and can only be promoted by those deterministic rules.
- **MUST** — correlation refs three-state (value | `NOT_APPLICABLE` | `UNKNOWN:<reason>`) for `run_ref/work_item_ref/node_ref/attempt_ref/ledger_ref` (OBS-R034); cause explicit (`parent_occurrence_ref` | `NO_CAUSE` | `CAUSE_NOT_CAPTURED:<reason>` + relation, OBS-R036); schema-invalid envelopes go to the spool as `schema_invalid`, never into the cursor (OBS-R038).
- **MUST (R-E4)** — no user-linked identifier anywhere in `obs` — no asker/session/email/IP/user-agent/pseudonym columns, no keyed pseudonyms. Enforced by (i) schema column-set manifest test, (ii) allowlists with no identity fields to admit, (iii) identity-shaped canaries (OBS-R054).

### A.4 Dedup / fingerprint / maturity counting

- **MUST** — `fingerprint_v1 = sha256(version ‖ code ‖ taxonomy_class ‖ component.package ‖ (call_site_key || top_repo_frame) ‖ runtime)`. **No message text** (OBS-R037; motive verified at `apps/runner/src/index.ts:883-890`). **No `build_ref`** (recurrence across builds must group). **No `zone_marker` (FID-09):** a shared-infra failure on an auth route is the *same incident* as the same failure elsewhere — OBS-R131's "ordinary" is preserved; the `zone_context` column carries the residue without splitting the group or minting an auth-path-only incident stream.
- **MUST — anti-inflation on every funnel (RT-14):** the provider rule (one event per **exhausted** call, OBS-R018) gets its job-funnel analogue: the Hatchet task binding records `attempt_index` and the incident fold treats retries of one work item as **one work unit**. **Fingerprint maturity (E6-12) counts distinct originating work units** — distinct `work_item_ref`/`run_ref` after cross-source merge — never raw occurrence rows. A single flaky item retried N times, ingested from both sources, contributes exactly 1 to maturity.
- **MUST** — one real-world failure = one incident across layers (OBS-R024) and across sources (`obs.source_link`, E6-16, D.5).

### A.5 CAPTURE_GAP + authority: fail-CLOSED by construction (R-E6-13, OBS-R057/R058; RT-04/RT-02/RT-23)

Backpressure ladder, ordered, hysteresis: **full envelope → minimal occurrence → local spool → counted gap**. Product requests never wait; the product fails open. The **authority** direction is inverted from round 0:

- **MUST — positive proof, not absence (RT-04):** fix-agent write authority exists **only while ALL of** the following hold, evaluated by the daemon before AND during every mutation (RT-23): (1) the `KILL` file is absent; (2) a positive **`ARMED` token** exists and is fresh; (3) a **proof-of-capture-health artifact** exists, is signed by the daemon, and is younger than `obs.authorityProofStalenessMs`. The daemon refreshes the proof only after an end-to-end check passes: a synthetic canary occurrence round-trips to `obs`, the spool is writable, no `obs.capture_gap` row is open, and required heartbeats are fresh. **Any failure to refresh — full disk, dead flusher, DB down, crashed process — removes authority by default. Absence and staleness always mean TRIP, never health.** This subsumes round 0's health-file/gap-row reads, whose absence-shaped semantics failed open exactly when R-E6-13 needs them off.
- **MUST — gap accounting honesty:** the in-memory gap counter flushes as one bounded `obs.capture_gap` row when a sink returns; because the counter itself can die with the process, its loss is covered by the proof mechanism above (no refresh ⇒ no authority), and every gap row is a high-severity incident (DIV-12 mitigation).
- **MUST — exit-path physics (RT-02):** the spool is written with `fs.writeSync` on a **pre-opened fd** and is the only sink reachable from `process.on('exit')` (Node exit handlers are synchronous-only); the "bounded flush deadline" applies to signal paths (`SIGTERM`/`SIGINT`), not `exit`. **SIGKILL / OOM / power-loss is an acknowledged uncapturable class** whose only witness is the external liveness owner (B.2 process row); G1's acceptance states this rather than claiming losslessness (OBS-R058).
- **MUST — storage placement (RT-16):** spool, `KILL`, `ARMED`, and the proof artifact live on a **different volume than the Postgres data directory**, so the shared-failure-domain event (Postgres container/disk death) leaves the trip machinery standing. Verified in G1 chaos.

### A.6 Human-only detail channel — one consistent spec (FID-08; RT-07)

`obs.occurrence_detail` is **first-party only** and holds: the structured normalized frame list (post zone-scrub, E.3), cause-chain codes, template parameters (enumerated fields), and a **scrubbed free-text remnant** (length-capped message text after the secret/debate-content scrub). Stated honestly: the structured fields are allowlist-gated (OBS-R048-conformant); **the free-text remnant is a denylist-bounded surface and therefore an explicit OBS-R048 exception**, adopted for Grok's RCA argument (OBS-R050 SHOULD) and put to V with the weaker guarantee named (§K row 6). Containment is mechanical: separate table; the listener's **real connection** has no grant (A.7/RT-28); **never written for zone-context occurrences** (RT-07); **Hatchet log text never enters it** — Hatchet ingestion stores structured fields only, and a human who needs raw Hatchet logs reads them in Hatchet's own dashboard by run id (D.5). Dropping the free-text remnant entirely remains a cheap V option; nothing machine-side reads it.

### A.7 Write path, roles, self-observation of the store

- **MUST** — async write path on a dedicated least-privilege pool, never in a product transaction (OBS-R040); `emit()` enqueues (bounded queue), background flusher batch-inserts; Postgres → spool → gap ladder (OBS-R041/R057).
- **MUST — roles are LOGIN, containment is tested against real connections (RT-28):** `debateai_obs_writer`, `debateai_obs_listener`, `debateai_obs_watchdog`, `debateai_obs_human` are created **LOGIN with distinct credentials**; each component gets its own connection string (`OBS_WRITER_DATABASE_URL`, `OBS_LISTENER_DATABASE_URL`, `OBS_WATCHDOG_DATABASE_URL`); grants: writer INSERT-only on capture surfaces; listener SELECT on machine-safe tables (**no grant on `occurrence_detail`, none on `identity.*`, none on raw `core.run`**) + INSERT on delivery/trace/agent_action/policy_decision/budget_usage + narrow UPDATE on cursor/incident/component_health; human SELECT all; **no role holds DELETE** (OBS-R043/R045). Acceptance tests connect **as the listener's actual connection string** and assert permission denial on `occurrence_detail`, `identity.*`, `core.run.question_line/asker_id/session_id`; a further test asserts no obs component's connection string equals the product's. The round-0 `NOLOGIN` idiom (`migrations/0000_s00.sql:290-296`) is thereby extended, not merely copied — nothing in-tree ever assumes those roles today (verified: every process connects as compose superuser `debateai`), which is precisely the vacuity being closed.
- **MUST** — listener joins to product data go through obs-owned column-safe views (`obs.run_correlation_v`: `run_id, created_at_seq, register_version, battery_version, risk_tier` — never `question_line/asker_id/session_id`, `migrations/0000_s00.sql:42-58`) (E6-08, R-E4).
- **MUST** — listener-serving indexes incl. the UNIQUE ingest key, with plans-at-10× as gate evidence (OBS-R042).
- **MUST** — DB-failure capture is non-recursive (OBS-R019/R059): `DATABASE_*`-class failures bypass the DB sink (straight to spool + health counters); `createPool`'s `console.error` (`packages/db/src/index.ts:69-72`) rebinds to this channel.

---

## B. Capture layer (`@debateai/obs-capture`)

### B.1 Core (topology-neutral)

Exports: `emit(envelope)` (total, non-throwing, no sync I/O on the product path — OBS-R055/R056); `captureHandled(error, ctx)`; `runWithObsContext(fields, fn)` over `AsyncLocalStorage` (precedent `packages/db/src/index.ts:2,7`; OBS-R035) — the context carries run/work-item/node refs, the zone flag, **and the last `at_seq` value this request/job has already observed** (C.4/RT-40); **side-effecting installer modules** `@debateai/obs-capture/install/<runtime>` (RT-01); the redactor; the zone classifier (§E). Third-party throws are captured at the nearest owned boundary — **no monkey-patching of dependency internals** (OBS-R026, FID-17).

### B.2 Funnel bindings — exact attach points (verified)

| Runtime | Attach point (evidence) | Binding behaviour |
|---|---|---|
| every process | **zero `process.on(` handlers exist in-tree** (verified); ESM evaluates the whole import graph before any `main.ts` statement | **MUST (RT-01):** handler installation is a **module-evaluation side effect** — `import "@debateai/obs-capture/install/<runtime>"` is the FIRST import of each root module (`apps/api/src/main.ts`, `apps/runner/src/main.ts`, `apps/scheduler/src/cli.ts`), so uncaught/unhandled capture is registered before `@debateai/db`/`register`/`crypto` module bodies can throw (the scheduler's top-level command throw at `apps/scheduler/src/cli.ts:5-8` included). Lifecycle events: start, ready, signals, exit code (OBS-R014/R015). **"Never-started" is witnessed from OUTSIDE the process (RT-01):** the external liveness owner is launchd `KeepAlive` per long-lived runtime (§H.2) plus the daemon's expected-process presence detector (manifest of expected runtimes vs observed start receipts/heartbeats). SIGKILL/OOM class: A.5. |
| api (http) | `buildApi` error handler `apps/api/src/index.ts:158-191` incl. stream-abort branch; `logger: false` at `:143` | capture before reply on every branch (OBS-R016); 500-class responses stop echoing `message`, return correlation id (OBS-R053) |
| runner (job) | Hatchet task catch `apps/runner/src/index.ts:2494-2526`; task declared with `retries: engineRetries` (`:2504`) | capture **before** `recordTerminalFailure` (OBS-R017); ambient context seeded from dispatch input; `attempt_index` recorded so retries fold into one work unit (RT-14/A.4) |
| provider | gateway call loop `packages/providers/src/index.ts:195-290`; `createPostgresProviderGateway` `apps/runner/src/index.ts:2528-2559` | one event per **exhausted** call (OBS-R018); per-attempt artifacts referenced as evidence, never duplicated (OBS-R024) |
| db | pool/query wrappers `packages/db/src/index.ts:14-77` | non-recursive channel (A.7); pool-failure family is shared-infra by definition (§E) |
| scheduler (one-shot) | `apps/scheduler/src/cli.ts` (three commands) | **MUST (FID-03, OBS-R005):** each job run emits a **job-lifecycle occurrence family** — `scheduled(next_due)` / `started` / `succeeded|failed|noop` — where **a no-op is lawful only with its input count recorded** (e.g. liveness-sweep: versions scanned, rows considered, rows archived), so a job that silently skips 40 items is falsifiable, which external cadence observation alone cannot do. Plus wrap-and-flush-with-deadline before exit (OBS-R014) and one-shot health semantics: a **start/finish receipt pair** — a start receipt without a finish receipt past the job's deadline is the failure signal (RT-05); freshness bounds apply only to long-lived runtimes. |
| evaluator | exported-function boundary of `apps/evaluator-worker/src/index.ts`; dispatch binding structurally `UNBOUND` (`packages/evaluator/src/dispatch-binding.ts:6-11`) | library-boundary wrapper only (E6-05) |
| ui client (R-E6-10) | one seam (OBS-R020): new `app/global-error.tsx` + `app/error.tsx` (none exist — verified), `window.onerror`/`unhandledrejection` bootstrap, existing `ScoringErrorBoundary` (`apps/ui/components/ScoringErrorBoundary.tsx`) rewired through the same reporter | **MUST (RT-19a-d, FID-16):** `POST /v1/obs/client-report` accepts **only server-side closed enumerations** for `code/component/route_template/kind` — any unrecognized value is **rejected, not stored**; `build_ref` is **server-assigned from the served bundle**, never client-supplied; occurrences carry `source=ui_client` and are **structurally ineligible for fingerprint maturity, tier eligibility, and every fix path — report-and-count only** until a separate V ruling opens them (§K row 12); rate limiting is shared-state where replicas>1 and keyed on a **transient network-origin hash** (in-memory salt, rotated on restart, never persisted — nothing user-linked enters obs, R-E4); **rate-limited rejections increment a counted client-drop class in `obs.capture_gap`** — never a silent drop (OBS-R057). Free text never leaves the browser. Evidence for the threat: `resolveSession` is sha256 of any header string (`apps/api/src/index.ts:129-140`) — it authenticates nothing, so nothing downstream may treat client reports as trusted. |
| detectors ("does not work") | `core.work_item.state/claim_deadline` (`migrations/0000_s00.sql` work_item block); READY age; progress delta via `at_seq`; scheduler cadence; **suspicious-success** signals | daemon-hosted read-only sweeps emitting detector occurrences: claim-deadline breach, oldest-READY age, missing heartbeat, no-progress delta, WAIT age, cooldown overdue, provider/parse burst, cadence expected-vs-observed, listener cursor lag (OBS-R004), **plus the OBS-R012 classes `empty_output` / `missing_required_fields` / `missing_artifact_chain` as first-class `SUSPICIOUS_SUCCESS` detectors (FID-02)**, plus expected-process presence (RT-01) and the `unclassified` counter watch (RT-09). Reaper stays out of scope (OBS-R006; `apps/scheduler/src/index.ts:87-89` scaffold) — alert-fatigue consequence handled by incident-level dedup + acknowledged-state muting, and the build-or-park decision goes to V (§K row 15). |

- **MUST** — funnels are transport, not coverage (DIV-01): `captureHandled` at the enumerated catch-and-transform sites, list materialized from the generated inventory; CI inventory gate `tools/obs-inventory` in root `lint` fails on new unclassified throw / bare catch / discarded promise / cause-losing wrapper (OBS-R021/R022). Raw-`throw` lint stays SHOULD (OBS-R023). Fire-and-forget via supervised helper (OBS-R066); swallowed errors carry the captured event id (OBS-R065); subprocess stderr bounded + redacted (OBS-R027).

### B.3 Overhead + failure-isolation budget

- **MUST** — every bound is a register row with provenance (`register.register_row`, `migrations/0000_s00.sql:271-283`; reader idiom `packages/register/src/index.ts:74-133`), calibrated in G1 (OBS-R044, DIV-11): `obs.emitP99CeilingMs` · `obs.captureQueueMax` · `obs.envelopeMaxBytes` · `obs.frameMax` · `obs.causeDepthMax` · `obs.shedThresholdPct` · `obs.zoneFlushIntervalMs` · `obs.authorityProofStalenessMs` (A.5) · **`obs.fingerprintMaturityN`** (seed: Grok's E6-12 proposal N=3, FATAL→1 — seed only) · **`obs.blastRadiusMaxReachable`** (no seat proposed a number; **no seed exists — G5 stays closed until V rates it, fail-closed**) (RT-31) · plus D-side caps. Codex/Grok figures remain calibration seeds only; no number in this plan is ratified.
- **MUST** — layer disableable at runtime via auditable register row (OBS-R060); no boot-required dependency (OBS-R056).
- Observed by: health counters (fixed-code, circuit-broken — OBS-R059), per-runtime health receipts (RT-05 semantics), watchdog scrape, G1 chaos (OBS-R061).

---

## C. Traceability

### C.1 Cause-chain retrofit

- **MUST** — `TypedDomainError` gains `options?: { cause?: unknown }` → `super(message, options)` (OBS-R062; verified no-cause at `packages/kernel/src/index.ts:283-288`; targets ES2023/ES2022 support Error cause). Wrap sites pass `cause` and never interpolate upstream text (OBS-R063/R064); first offender `typedPoolFailure` (`packages/db/src/index.ts:14-18`) reworked to fixed template + cause; the repair-packet interpolation (`apps/runner/src/index.ts:883-890`) replaced by stable-code + safe-template (OBS-R049/R102). Note: wrappers re-root stacks — which is why the zone classifier walks the **whole cause chain**, not one stack (E.3/RT-10).
- **MUST** — error identity independent of message text; async joins preserve all rejections (OBS-R067).

### C.2 Correlation

Ambient context (B.1) seeded at funnels; cross-process linkage via ids already threaded: `additionalMetadata { v3RunId, v3WorkItemId, sourceOfRecord }` (`apps/api/src/index.ts:369-380`) — the OBS-R140 join keys.

### C.3 The mechanical trace procedure (deterministic, LLM-free — OBS-R068)

1. Load occurrence; record `capture_status` qualification if not `PERSISTED`.
2. Cause walk with visited set + `obs.causeDepthMax`; anomalies emit `CAUSE_CYCLE`/`CAUSE_GAP`/`CAUSE_DEPTH_EXCEEDED` evidence (OBS-R069).
3. Zone check **across every stack in the chain** (RT-10): manifest hit ⇒ terminal `ZONE_BOUNDARY` (OBS-R133).
4. Lineage joins, each indexed and bounded (OBS-R070); cross-run / future-sequence / build-mismatch ⇒ `CORRUPT_LINEAGE` evidence (OBS-R071).
5. Root = earliest evidenced condition whose absence would have prevented the failure, at the lowest responsibly-controllable boundary (OBS-R072).
6. Terminal verdict from the closed vocabulary: `CODE_ROOT · EXTERNAL_ROOT · POLICY_ROOT · ZONE_BOUNDARY · CAPTURE_GAP_BOUNDARY · REPLAY_UNSUPPORTED · INSUFFICIENT_EVIDENCE` (OBS-R073/R074/R076/R025).
7. Persist verdict + evidence + visited path + queries + manifest versions to `obs.trace`, **then** ack (OBS-R075/R080).
8. Bounded retries on transient store failure; deterministic poison → dead-letter + human (OBS-R077).

Termination: finite hop cap, indexed bounded joins, closed vocabulary, no unbounded retry. **What makes G2's acceptance non-vacuous is in §G (RT-33): a human-labelled sample with a ruled agreement rate and an `INSUFFICIENT_EVIDENCE` ceiling** — a tracer that always answers "don't know" fails the gate.

### C.4 `at_seq` watermark — U-11 re-closed on a specified mechanism (RT-40, FID-17)

Verified: `core.run_progress_event` has `at_seq` only, no timestamp (`migrations/0000_s00.sql:68-75`). Round 0 left acquisition unspecified; now: **the ambient context carries the last `at_seq` this request/job has already observed in the course of its own work** (the runner reads/writes progress rows while executing a work item; the api's SSE path streams them) — the watermark is **copied from context, never queried**: no `SELECT max(at_seq)` on the error path, no read of `ledger.sequence_allocator` (which A.1 refuses — one locked row, `migrations/0000_s00.sql:9-29`), no sync I/O in `emit()` (OBS-R056). Field is **three-state** like its siblings (OBS-R034): value | `NOT_APPLICABLE` (flow never observed a sequenced event) | `UNKNOWN:<reason>` (context lost). No retroactive wall-clock is ever synthesized; correlation to pre-store events is a "no later than" ordering join. **U-11 CLOSED on this mechanism.**

### C.5 Remediation order

SHOULD (OBS-R078): boundary capture → cause preservation → correlation propagation → eliminate verbatim error-into-prompt paths → static enforcement.

---

## D. Listener (`tools/obs-listener/`)

### D.1 Process shape (R-E3; OBS-R087)

Four pieces outside the reachability walk (OBS-R125; roots per `acceptance/README.md:1-9`; audit's known-non-product set gains `tools/obs-listener/`):

1. **obs-daemon** — deterministic, non-LLM, permanent: dual-source intake, incident folding + dedup, detector sweeps, tier gate, notification, approval wait, worker spawn, caps, authority-proof refresh (A.5). Zero model calls at idle (OBS-R089). **Backlog order: highest severity first, oldest-within-severity second; concurrency capped; poison cannot block the cursor** (OBS-R083 — FID-13).
2. **codex-worker (diagnosis)** — ephemeral Codex CLI spawn per eligible incident, fresh session, never resumed (OBS-R087); read-only: no network beyond the CLI's own relay, no credentials, no subagents, fixed tool/query allowlist, bounded paths (OBS-R088); spawn law per `acceptance/relay-core.ts:1-60` (typed loud failures, deadline kill, bounded redacted stdio — OBS-R027); usage telemetry or fail-closed to report-only (OBS-R089).
3. **watchdog** — separate deterministic process: daemon heartbeat, cursor lag, leases, **audit-chain continuity (hash-chain links, A.2)**, spend counters, policy hash (OBS-R086); can trip, can never modify code; mutual heartbeat with the daemon; host keepalive via launchd.
4. **obsctl** — human CLI: `status`, `kill`, `arm`, `approve` (which **emits the kanban tickets under V's identity** — D.3/RT-20), `deny`, `reveal-drift` (E.5). No LLM anywhere in it.

**MUST (FID-15, OBS-R090):** model access runs under the **DR-179** no-API-keys hold — local authenticated CLI only; **lifting the hold changes the adapter behind the same seam and SHALL NOT expand fix authority** — a DR-179 lift re-opens nothing in §D.4/§D.7. Placement is a config seam (OBS-R091): Postgres URLs (per-role, A.7), Hatchet API URL/token, CLI binary path, worktree path, spool/proof paths — V's Mac today, `dezbatere.ro` later.

### D.2 Transport: durable rows first (OBS-R079/R082/R083)

Durable truth = `obs.occurrence`; ack per **occurrence** (`obs.delivery` + cursor), diagnosis/spend/fix per **incident** (OBS-R081); batch acks by `occ_seq` range per fingerprint (DIV-05 counter answered). `LISTEN/NOTIFY` carries `occ_seq` as wake hint only; startup/reconnect = LISTEN, reconcile cursor, process (OBS-R082). **U-07 stays CLOSED:** LISTEN on a dedicated direct session-mode connection (`OBS_LISTEN_DATABASE_URL`); verified no pooler in `compose.dev.yaml`; NOTIFY loss degrades to poll latency only.

### D.3 Severe-error workflow (R-E6-09) and the approval pipeline

**The R-E6-09 pipeline serves EVERY above-QUICK proposal (FID-06):** record → research (read-only diagnosis worker) → structured **FixProposal** (fixed template, validated ids/codes only — no raw text, no LLM prose; OBS-R103/R114) persisted to `obs.agent_action` → **notification to V through §F with an approval handle, regardless of severity** — `obs.severeThreshold` (over the A.3 ladder; seed `≥ SEVERE`, §K row 8) governs **urgency class and routing only**, never whether V is asked. With the QUICK allowlist starting empty (E6-03), the modal incident is above-QUICK and below-severe; it notifies at routine urgency and waits. R-BIGGER is therefore reachable for its whole population.

→ **approval:** `obsctl approve <proposal-id>` binds the proposal **content hash**; the daemon proceeds only while stored hash == approved hash (mirrors OBS-R116).
→ **kanban tickets — created by `obsctl approve`, under V's identity, never by the daemon (RT-20):** round 0 inferred daemon authority from R-E6-09's passive voice; a MUST (OBS-R127: "the listener SHALL NOT create tickets, mutate the board") may not be overridden by an inference. Re-read: R-E6-09 names no actor; the strictly-safer reading — the human's approval command emits the tickets — satisfies the ruling's sequence verbatim while OBS-R127 holds **unamended** at every point, pre- and post-approval. Mechanics per wayfinder T05: `hermes kanban --board observability-loop <action>`, ids `t_*`, `link parent child`; **MUST:** every board write asserts the board id by read-back before and after, refusing on mismatch — T05 records the global current-board pointer parked on the sibling docker-hatchet mission, so an unflagged write lands in another live mission's board.
→ **fix loop starts** (D.4/D.6).

**MUST — the board is inside the injection wall (RT-21):** ticket titles and bodies are rendered **exclusively** from a fixed template over server-minted enumerations and ids (incident id, fingerprint prefix, severity, tier, count, verdict code). No free-form field from any occurrence — first-party, Hatchet, or client — may reach board text, notification text, or any surface read by other agents (Hermes dashboard 9119, sibling orchestrators). The board and the notification channel are named members of the OBS-R102 wall, and both are targets in G3's injection corpus (§G).

### D.4 Tiers (R-E1/R-E2/R-BIGGER; OBS-R092-R110)

**MUST — the spine §9 floor, verbatim, dominating everything (FID-01, OBS-R093):** *a one-line change to security, auth, persistence, migrations, spend, scoring semantics, live data, destructive git, architecture, protocol docs or board state is ESCALATE* — this list dominates every size threshold, every tier decision, and **every allowlist entry, present or future**. Per **E6-11**, "scoring semantics" is defined precisely as **arithmetic + served-number writers only** — that definition is the operative floor-clearance test for UI copy/CSS QUICK eligibility, and it is what lets a copy fix near a score badge be lawful while any served-number writer is not.

**MUST — the floor is enforced as paths, not categories (RT-29):** the policy bundle (G0) carries the floor as an **enumerated path/glob deny list**, and QUICK eligibility requires the changed path to match the **allowlist glob set — deny-by-default on path**. Enumerated ESCALATE regardless of line count: the security zone manifest paths · `migrations/**` · `packages/crypto/**` · scoring arithmetic + served-number writers (E6-11 set, enumerated in the bundle) · spend/budget config · **any dependency or manifest declaration (`package.json`, `pnpm-lock.yaml`, workspace files)** · **any register/bootstrap seed data file** · **any compose/env/CI/deploy file (`compose.dev.yaml`, `deploy/**`, env loaders, root scripts)** · **anything under `tools/`** (includes the CI inventory gate and the listener itself) · protocol/spine docs · board state · the obs policy bundle, zone manifest, and obs' own code (OBS-R104). **"Production file" is thereby defined enumeratively:** a file matching the reviewable-product-source allowlist globs (`apps/*/src/**`, `packages/*/src/**`, `apps/ui/{app,components,lib}/**`) minus the deny list. OBS-R105 note: editing an *existing* register seed file is a register-value change and sits in the deny list — the agent can neither invent nor edit ruled values.

- **QUICK (dormant until ROW-GIT; G5):** R-E1 ratified shape — ≤1 production file + 1 test file, ~20 production-line cap (~50 with tests) "for the moment", subsystem allowlist **empty by default** (E6-03), RED→GREEN on a clean base SHA (OBS-R095/R096), per-fix auto-merged PR into `dev`, never `main` (R-E1/R-E2, OBS-R115), auto-merge only while head/base/policy hashes match approvals with fresh checks (OBS-R116), merge-only — no deploy/restart (E6-01, OBS-R120), one revertible commit (OBS-R118), one active mutation per repo and per fingerprint (OBS-R110), notification on every landing (OBS-R121). **MUST (RT-30):** the QUICK RED test must be **derived from an existing human-owned invariant** (an acceptance assertion, contract schema, or catalog-declared property — never freely authored); "the only new test asserts behaviour untraceable to a human-owned invariant" is a deterministic ESCALATE indicator. This closes the self-agreeing agent-test+agent-fix loop that R-E1's auto-merge would otherwise permit.
- **E6-04 scoping, reconciled in the open (FID-07):** E6-04 ("loop-agent PRs reviewed by a human + independent non-author-family reviewer") is an adopted default; R-E1 (a ruling, higher precedence) ratifies **auto-merge** for QUICK. Composition adopted: E6-04 governs every PR-FIX/approval-first landing; for QUICK it is satisfied by the independent deterministic policy approval + post-landing human visibility (OBS-R115/R121). This scoping is put to V (§K row 11) rather than applied silently.
- **Above QUICK = approval-FIRST (R-BIGGER):** approval object is the **proposal**; only after approval is the fix coded; the coded fix lands as a PR into `dev` under OBS-R117 human review/merge + E6-04. Notification path per D.3 — reachable at every severity (FID-06). §K row 9 carries the composition for confirmation.
- **ESCALATE:** OBS-R074/R126/R127/R128; architectural indicators deterministic, route to architecture intake (OBS-R126).
- **Gate mechanics:** deterministic non-LLM policy gate, input-hashed (OBS-R094); blast radius **computed**, `obs.blastRadiusMaxReachable` bound (OBS-R098, RT-31); generated patches re-classified post-generation (OBS-R099); one root per fix (OBS-R100); test-integrity + human-owned command catalog (OBS-R101, mechanized by RT-30's invariant rule + the D.6 sandbox); injection walls (OBS-R102/R103); no self-modification — the enumerated OBS-R104 set includes the policy bundle, allowlist file, zone manifest, obsctl, and the audit writer, by name; register values never invented or edited (OBS-R105 + deny list above); maturity gates fixing only, counted per A.4 (E6-12, RT-14); **fingerprint cooldown AND root-keyed cooldown (RT-17):** no fix authorized while the incident's trace root (file + symbol) matches the root of any incident with an active or recently-landed mutation, regardless of fingerprint or source — closes the double-fix path when the metadata join is absent; **lineage bound (RT-24):** an incident whose first occurrence post-dates a landing and whose trace root lies inside that landing's blast-radius set is attributed to it (`attributed_landing_ref`); more than `obs.lineageDepthMax` attributed incidents (number V's) disables autonomous fixing for that lineage and escalates — the error→fix→new-error walk is bounded in depth, not just rate.
- **Canary (RT-25 — ARCH→REQ, not guessed):** E6-01 (merge-only, no deploy) makes OBS-R119's canary structurally empty as ruled — merged code executes nowhere, so no signal can attribute to the fix and the auto-revert can never fire on evidence. This is a genuine collision between an adopted default and a MUST; per rework rule 3 it goes to V as **§K row 13** with options and my recommendation (deferred canary: fix marked `UNVALIDATED` at merge; the canary window opens at the **next natural deploy**; lineage mutation authority frozen until a deploy observes the fingerprint; exactly one deterministic auto-revert lands as a revert PR — still merge-only). G5 cannot certify canary behaviour until V rules.

### D.5 DUAL-SOURCE: Hatchet read-back (U-01)

Ground (verified): Hatchet is the in-tree dispatcher (`@hatchet-dev/typescript-sdk@1.28.1`); nothing reads state back (`runNoWait`, `apps/api/src/index.ts:369-380`); hatchet-lite REST 8888 / gRPC 7077 (`compose.dev.yaml`); the pinned SDK ships `runs.get/list`, `logs.list`, `workers`, `metrics`, `crons` (`v1/client/features/*.d.ts`).

- **MUST — the shared failure domain is named, not implied (RT-16):** hatchet-lite's database lives **on the same Postgres server** as `obs.*` (`deploy/postgres/init-hatchet.sql`). One Postgres death takes the primary sink AND the second source AND the DB-side gap writes. The pair is complementary for *error classes*, not for *infrastructure*; the survivors are the spool + proof artifacts on their separate volume (A.5), and the trip machinery is designed to stand on exactly those (RT-04). Stated in §J too.
- Ingest: poll `runs.list` (FAILED/CANCELLED, cursor window minus overlap) on `obs.hatchet.pollIntervalMs`; per failed task `logs.list` bounded — **structured fields only cross into obs** (status/kind/attempt/counts/join keys); **log text is never stored anywhere in obs** (FID-08) — a human reads raw logs in Hatchet's own dashboard by run id; read-only by construction; Hatchet never on the capture path (OBS-R141, OBS-R085); anti-corruption mapping (OBS-R142); floor severity on entry (A.3/OBS-R010).
- At-least-once via `obs.consumer_cursor(hatchet-ingest)` + overlap re-read, **idempotent by the UNIQUE `(source, source_event_ref)` constraint with `ON CONFLICT DO NOTHING`** (RT-13); Hatchet retention shorter than ours = counted `CAPTURE_GAP` on the hatchet source (OBS-R143).
- Cross-source merge (OBS-R139/R140, E6-16): evidence = `additionalMetadata.v3RunId/v3WorkItemId` matching `run_ref/work_item_ref` within skew tolerance + compatible class → `obs.source_link` (both retained, ours authoritative); unmatched stays two incidents — **and the root-keyed cooldown (D.4/RT-17) prevents the two-incidents case from becoming two fixes**.
- **U-18, sharpened (RT-15):** correlation never relies on wall-clock equality; both clocks stamped; skew measured continuously; **`obs.skewToleranceMs` may only be ratified from a split-clock measurement** (two hosts/containers, deliberately stepped clocks) — today's compose shares one host clock and would calibrate a fiction; drift-beyond-tolerance is a **trip-eligible signal**, not just a self-event.
- **SPIKE-D1 (bounded; exit criteria + kill criteria, RT-18/RT-39):** half a day, read-only, at G2 entry, against the dev stack. Must answer: retention window · `runs.list` pagination bounds · **read-scope token obtainability** (compose provisions only a worker credential — `HATCHET_CLIENT_TOKEN`, `apps/runner/src/main.ts:18-21`; no read token exists today) · backlog/heartbeat semantics · **attempt-identity stability and `runId` disambiguation** (Hatchet task-run id vs our `v3RunId`; the `hatchet:<runId>:<attempt>` idempotency key and the UNIQUE constraint's columns are contingent on this answer). **Kill criteria:** retention < poll floor, pagination cannot bound a backlog, or no read-scope token obtainable ⇒ **dual-source is not silently narrowed — it returns to V** (§K row 14), because OBS-R137/R138 are V's own rulings; the fallback posture (first-party-only, which error classes lose their second witness — notably worker-crash-before-flush, RT-02) is stated in that row, decided at SPIKE-D1 exit, never discovered at G3.

### D.6 Fix execution surface — sandboxed, or G4 does not open (RT-22)

- **MUST:** the **fix worker** (distinct from the diagnosis worker) runs under a **separate OS user** with no read access to: custodian tokens, the `KILL`/`ARMED`/proof paths, the policy bundle originals, the zone manifest, or any git credential. **Its only output is a patch file.** The daemon — a different process under a different user — validates the patch (path-glob gate, floor list, re-classification per OBS-R099), applies it in its own workspace, runs the human-owned test catalog **inside the same restricted sandbox with no network**, and is the only process that pushes, under the dedicated signed bot identity (OBS-R113). The agent-authored RED test therefore executes with no path from its process to the switches it would need to defeat (dual control, kill, OBS-R104 all survive an adversarial test file). Policy/manifest hash checks are performed by the daemon's process tree, never the worker's.
- **MUST:** clean baseline + pinned base SHA per attempt (OBS-R112); reserved branch namespace from validated hashes (OBS-R113); machine-parseable PR template with RED/GREEN evidence + revert command, no raw error text (OBS-R114/R103).
- **G4 entry gate includes a named verification of this sandbox** (an adversarial fixture test file attempting token/KILL/bundle reads and network egress must be provably contained). All impossible before ROW-GIT (standing gate).

### D.7 Kill switch, caps, trips

- **Kill switch (OBS-R106, E6-02; RT-23):** `KILL` file (either custodian; `obsctl kill`) + **positive `ARMED` token** + proof artifact per A.5 — authority is the **conjunction**; any filesystem/process failure disarms by absence (ENOSPC can no longer preserve authority — it starves the proof). **Polled throughout every worker lifetime, not only pre-spawn:** on trip mid-flight the daemon revokes the worker's lease, withholds the push (the worker never had the credential — D.6), and kills the worker process group. Mutation defaults OFF after supervisor restart.
- **Custody and the meaning of "expansion" (E6-02; RT-32):** either custodian can kill; **expansion requires both custodians' distinct tokens — and "expansion" covers BOTH re-arming after a trip AND any growth of the QUICK allowlist or authority surface.** Allowlist growth is executed only by re-pinning the policy bundle through `obsctl` with both tokens + a recorded evidence packet (OBS-R097's evidence requirement), is audited to `obs.agent_action`, and the allowlist file is in the OBS-R104 forbidden set by name. No agent path can touch it.
- **Caps (OBS-R107, R-E3):** supervisor-enforced register rows: `obs.listener.callsPerDay`, `wallClockPerDiagnosisMs`, `maxConcurrentDiagnoses`, fix-rate caps; numbers at activation.
- **Auto-trip OR-list (E6-14, R-E6-13, OBS-R106/R119; RT-26):** forbidden-path touch (per the D.4 deny list) · **audit-chain break (A.2 definition)** · auto-revert fired · rejected-verdict-rate breach · open capture gap / stale proof (A.5) · budget/rate breach · policy-hash mismatch · store/audit outage · **branch-protection failure — the protection ruleset is fetched and hashed in the pre-dispatch deterministic checks on EVERY dispatch; mismatch against the approved hash = trip** (not a one-time G4-entry check) · cross-source skew beyond tolerance (RT-15) · watchdog anomaly. All deterministic; numbers V's.

---

## E. Zone boundary (U-09) — redesigned per Theme 1

### E.1 Rulings

R-E5: zone-origin errors leave an **anonymous daily counter only** — no codes, no payloads, no traces. Shared-infra errors on auth routes stay fully captured, route reduced to `zone` (OBS-R131). No imports, no inspection inside the zone (OBS-R130/R134).

### E.2 Verified boundary geography (outside-only)

Zone mounts live outside the zone in `buildApi`: `/v1/auth/register|verify-email|resend-verification` calling `options.registration!.*` (`apps/api/src/index.ts:205-234`); service injected from `apps/api/src/main.ts`. Zone-owned reachable files include `apps/api/src/registration.ts`, `apps/api/src/mail-channel.ts`, `packages/db/src/identity.ts` (re-exported by shared db — `packages/db/src/index.ts:590-603`) — which is why route-based classification fails and producing-module classification is required.

### E.3 Classifier — equal-work, chain-walking, six rows, scrubbed output

- **MUST — equal work on the request path (RT-08):** inside `zoneBoundary` context, the request-critical path performs **one fixed-cost operation identical on every branch**: enqueue of an opaque token (pre-serialized error reference + context snapshot) — **no classification, no stack parsing, no manifest matching, no redaction, no counter arithmetic happens before the response is written**. All classification runs on the flusher, off-path. The zone's own pacing discipline (`apps/api/src/registration.ts:429,527,566,594,621,657` — S3b/S3c "equal work", commit `cff3dd5`) is not degraded by capture: **G1 acceptance includes a timing test comparing zone-branch response-time distributions capture-on vs capture-off, failing on any statistically resolvable delta.**
- **MUST — Factor 2 walks the whole cause chain (RT-10):** wrappers re-root stacks (`typedPoolFailure` constructs its error at `packages/db/src/index.ts:17`, so the innermost frame of the *outer* error is always `index.ts`). The classifier therefore walks to the **deepest stack in the cause chain** (bounded by `obs.causeDepthMax`); if ANY stack in the chain has a manifest-matching innermost repo frame, the outcome is ZONE; the producing frame for SHARED outcomes is the innermost repo frame of the deepest stack.
- **MUST — anchored prefix matching (RT-11):** matching is **repo-root-relative anchored PREFIX** match on normalized paths; any frame under `node_modules/` or without a repo-root prefix is excluded from matching; compiled shapes are an **explicit alternate prefix list** (e.g. `dist/…`), never a suffix relaxation. Manifest-reality tests plant a decoy `identity.ts` outside the zone and assert non-match.
- **Decision table — six rows (RT-09; uncertainty defaults to excluded ONLY under zone context):**

| zoneBoundary ctx | deepest-chain frame evidence | Classification |
|---|---|---|
| set | manifest hit (any stack in chain) | **ZONE** → counter only (E.4) |
| set | repo frame, not in manifest | **SHARED** → full capture, route = `zone`, **frames scrubbed (below)** |
| set | no usable repo frame | **ZONE** (default-excluded — OBS-R134) |
| unset | manifest hit | **ZONE** + anonymized drift signal (below) |
| unset | repo frame, not in manifest | ordinary capture |
| **unset** | **no usable repo frame** | **`ORIGIN_UNKNOWN` → captured** with `component = UNKNOWN:<reason>`, counted in a dedicated **`unclassified`** gap class that is **trip-eligible** — never `zone_daily`, never discarded. Covers `throw "string"`/non-Error values (which `packages/db/src/index.ts:20-37` passes through), stackTraceLimit-truncated stacks, and structured-clone boundaries. |

- **MUST — zone frames never survive in ANY stored occurrence (RT-07, FID-10):** before any sink (occurrence, detail, trace evidence, PR bodies — everything), every frame matching the manifest is **dropped and replaced by a single opaque `ZONE_FRAMES_ELIDED:<count>` token**, and the cause walk **terminates at the first zone-owned frame** with `CAUSE_NOT_CAPTURED:ZONE`. A SHARED capture on an auth route therefore carries its shared-code producing frame and nothing of the zone's call path — no `registration.ts:line`, ever, anywhere the listener, a human, or a PR can read (OBS-R133; the S3b enumeration oracle stays closed at trace granularity). `obs.occurrence_detail` is **never written** for zone-context occurrences (A.6).
- **MUST — the drift signal is as anonymous as the counter (RT-12, FID-10):** decision-row 4 emits a fixed code `ZONE_DRIFT_DETECTED` carrying **only a manifest hash and a day bucket** — no path, no per-occurrence timestamp — aggregated at most once per day per manifest hash under the same jittered batch discipline as E.4. Which path drifted is discoverable only by a human running `obsctl reveal-drift` locally against the manifest. Routine out-of-mount zone reachability (background jobs, accounts-mission resumption) mints no stored zone internals.

### E.4 Anonymous daily counter (R-E5)

`obs.zone_daily(day, delta)` — append-only deltas, read as `SUM(delta) GROUP BY day`; increments buffered and flushed at most once per `obs.zoneFlushIntervalMs` with jitter (physical row order reveals only coarse batches). No severity, code, route, or correlation columns.

### E.5 Manifest custody + anti-drift (OBS-R134)

Human-owned manifest in `@debateai/obs-capture` (outside the zone): zone path prefix set (`apps/api/src/registration.ts`, `apps/api/src/mail-channel.ts`, `packages/db/src/identity.ts`, `migrations/0030..0033`) + compiled-shape alternate prefixes + mount list (three routes) + identity-table deny set. Tests: classifier units over synthetic stacks (no zone import); manifest-reality (every path exists; mounts string-match `buildApi`; decoy non-match per RT-11); policy bundle pins the manifest hash — **verified by the daemon's process tree, not the worker's** (D.6); manifest is in the OBS-R104 forbidden set. Uncertain-under-context defaults excluded (row 3). Accounts-mission resume points untouched (OBS-R135). **U-09 remains CLOSED, now with the equal-work, chain-walk, scrub, and sixth-row properties the round-0 design lacked.**

---

## F. Alerting (R-E6-09 channel) + owner routing

- **Requirements:** reaches V's phone and desktop; V's Mac now, `dezbatere.ro` later (OBS-R091); payload = validated ids/codes only (OBS-R103); delivery failure observable, never blocking (OBS-R084); every auto-landing notifies (OBS-R121); **every above-QUICK proposal notifies regardless of severity** (D.3, FID-06).
- **Recommendation, revised (RT-27):** **local-first.** Primary = macOS native notification via `osascript` (desktop, zero dependency, offline) **plus `sendmail` to V's inbox** (phone reach via mail push; the ops daemon shells the system `sendmail` with a fixed template — it does not import the zone-surface `SendmailMailSender`). **ntfy is optional and gated:** only as a third channel, only self-hosted **with publish authentication from day one** (never the public instance — topic knowledge is symmetric publish+subscribe, i.e. a spoofable bearer channel aimed at V's approval judgement), with a documented rotation/compromise procedure, and only after an **explicit V ruling that incident metadata may leave the machine** (zone-adjacent volume/timing is machine-resident data under R-E5's posture) — §K row 7.
- **MUST — one payload, everywhere:** D.3 and this section share one fixed-enumeration template: `severity · incident id · fingerprint prefix · count · tier · verdict code · proposal id/approval handle (when applicable)`. **No free text, no LLM prose** — the "proposal summary" V reads before approving is these enumerated fields; the full FixProposal is read locally via `obsctl` (RT-27c). Notification text is inside the OBS-R102 wall and in G3's injection corpus (RT-21/RT-35).
- **MUST — incident-class → named-owner routing (FID-13, OBS-R128):** the policy bundle carries a routing table: `security/privacy → V (+ nameable security delegate) · persistence/migrations → V · spend → V (+ nameable budget delegate) · scoring/live-data → V · all else → V (default)`. All entries default to V until V names delegates; the structural point is that these classes route **directly to a named human owner and never through general PR generation**. Delivery results land as self-events.

---

## G. Rollout — OBS-R122's ladder, restored verbatim (FID-12)

**Gate numbering is OBS-R122's, unchanged.** Mapping to the goal-packet's compressed names, so PROG inherits one vocabulary: packet-"G1 capture+store" = **G1**; packet-"G2 trace" = **G2 entry criteria** (the tracer is deterministic listener machinery); packet-"G3 listener report-only" = **G2 (deterministic) then G3 (LLM)**; packet-G4/G5 = **G4/G5**; **G6 restored**.

**Rollback vs trip — explicit and non-overlapping (RT-36):** capture, audit, or policy regression ⇒ **mutation authority OFF entirely (report-only), independent of gate level — R-E6-13 wins wherever the two rules overlap.** Gate rollback ("one gate back") applies only to non-capture regressions (e.g. verdict-quality decay at G3 → back to G2). **Rollback never darkens G1-G2 machinery: capture, detectors, the deterministic listener, and the notification path keep running at every rollback depth** — V is never un-alerted by the act of regressing (OBS-R084/R121/R124).

- **G0 — rulings + policy bundle pinned:** overlay landed (done); bundle pins: tier rules, floor path-globs + allowlist (empty), taxonomy vocabulary, code registry seed, severity mapping, zone manifest hash, injection-corpus hash (RT-35), register seed rows with `source_ref`.
- **G1 — capture + tables live; listener OFF.** Ships: `0034_obs_foundation` + Drizzle metadata; LOGIN roles + per-component URLs (RT-28); capture core + all B.2 bindings incl. install-first imports (RT-01), job-lifecycle events (FID-03), suspicious-success detectors' store surface (FID-02); spool on separate volume (RT-16); zone classifier (equal-work build); client seam + hardened `/v1/obs/client-report` (RT-19); OBS-R053 response change; cause retrofit + wrap pass + CI inventory gate; **code registry (machine-readable, OBS-R011 — FID-04)**; hash chains + TRUNCATE triggers (RT-06); authority-proof plumbing (A.5).
  Acceptance: **the runner mis-wiring fixture, stated falsifiably (RT-34):** driving a seeded work item to S04 through the Hatchet task path against today's `apps/runner/src/main.ts` wiring (which omits `judgementPolicy`/`servePolicy`; `CLAIM_TYPE_COMPOSITION_MAP_UNRESOLVED` at `apps/runner/src/index.ts:1220-1224` passes because `compositionRow` IS wired) yields **exactly one occurrence with `code = JUDGEMENT_POLICY_UNRESOLVED` (`:1226-1231`), `capture_point = job`, non-null `run_ref`/`work_item_ref`** — harness: the acceptance runner-path proof family (`acceptance/run-acceptance.ts`); fixing the mis-wiring stays out of scope (§K row 10). **Chaos: all NINE OBS-R061 cases, none dropped (FID-05/RT-03):** DB unavailable · disk full **and read-only filesystem** · **queue full** (exercises `captureQueueMax`/`shedThresholdPct`) · malformed/cyclic error · 10× burst · redactor failure · **recursive writer failure** · **crash during flush** (the case that kills the in-memory gap counter — passes only because authority rests on the positive proof, RT-04) · recovery + idempotent re-ingest. Plus: authority fails CLOSED under every chaos case (proof goes stale ⇒ trip); spool/proof volume separation verified (RT-16); zone-branch timing test (RT-08); privacy canaries + R-E4 schema tests; grant tests against real connections (RT-28); overhead calibration (U-02).
- **G2 — deterministic listener, report-only, no LLM.** Ships: tracer + verdict store; indexes at 10× (OBS-R042); dual-source intake behind SPIKE-D1 (exit + kill criteria, D.5); detectors live; notifications live (owner routing, §F); severity-then-age intake order (OBS-R083).
  Acceptance (**non-vacuous, RT-33**): against a **human-labelled root-cause sample** (size V's, OBS-R123), the tracer's `CODE_ROOT`/`EXTERNAL_ROOT` verdicts agree at a ruled rate; `INSUFFICIENT_EVIDENCE` rate under a ruled **ceiling**; a ruled **floor** on substantive verdicts; 100% closed-vocabulary termination within bounded hops/queries; zero scans in plans; cursor survives kill/restart drills with zero missed occurrences; split-clock skew measurement taken (RT-15).
- **G3 — LLM diagnosis, report-only.** FixProposals flow to notification + approval handles but nothing lands.
  Acceptance: **injection corpus clean, with custody (RT-35):** corpus authored by an **independent adversarial QA seat** (intake roster), version-controlled, hash pinned in the policy bundle (G0), ruled minimum size, scored by a deterministic detector (any tool call, path, or output field not derivable from the validated input set = violation); **targets include the worker prompt, board/ticket text, and notification text** (RT-21). Severe workflow drilled end-to-end incl. live V approval and `obsctl`-emitted tickets on board `observability-loop` with board-id read-back (RT-20); caps/kill/trip drills pass **without database access**.
- **G4 — PR-FIX (approval-first armed).** Hard gates: ROW-GIT landed (standing gate) · branch protection/CODEOWNERS/bot identity/required checks verified AND their ruleset hash entering the continuous pre-dispatch check set (RT-26) · **fix-worker sandbox verification passed (D.6/RT-22)**. Human merge only (OBS-R117, E6-04).
- **G5 — QUICK canary.** Allowlist grows from empty only via dual-custody re-pin with evidence packets (RT-32); auto-merge protections (OBS-R115/R116); auto-disable armed (E6-14); **canary semantics per V's §K row 13 ruling (RT-25) — G5 does not open until that row is ruled**; `obs.blastRadiusMaxReachable` and `obs.fingerprintMaturityN` ratified (fail-closed absent values, RT-31).
  Acceptance, structural (RT-37): measured quantities named — N consecutive QUICK landings with clean canary-valid windows (post-ruling semantics) · zero forbidden-path touches · zero audit-chain breaks · ruled human-agreement rate on sampled QUICK root verdicts · every allowlist entry carrying its evidence packet · one full auto-disable + dual-custody re-arm drill. Numbers V's (OBS-R123).
- **G6 — steady state.** Standing posture: system remains lawful parked at ANY gate forever (OBS-R124); every phase revocable; quarterly (cadence V's) re-drill of kill/trip/injection suites.

**Container-topology gate (decoupled from the ladder — FID-11/RT-38):** SPIKE-U06 is **not in any G-gate's ship list**. U-06 is **closed today on the interim binding** — `tsx`-run processes (verified in every `apps/*/package.json` start script), no supervisor in-tree, launchd as the external liveness owner (§H.2) — which is the only supported topology until further notice. A standalone, cross-mission-order-free gate — "**containerized-topology binding**" (owner: the ops/PROG lane that owns `tools/obs-listener`; kill criterion: not applicable-until-triggered) — must close before **any obs component runs inside a container**: it verifies Node version, container init/signal handling, restart policy, whether unhandled failures reach our handlers before container death, and that health/proof artifacts live on volumes the supervisor provably reads (RT-05). If docker-hatchet never lands, nothing here blocks; if it lands, containers wait on this gate, not the reverse. ROW-TOPOLOGY's "no hard ordering" holds in both directions.

---

## H. Deferred calls

### H.1 E6-15 — PRUNE the three error-shaped members (recommendation, unchanged evidence)

29 declared wire types (`packages/contract/src/index.ts:17-49`, counted) vs 7 storable kinds (`migrations/0021_dr174_cooldown_prune.sql:4-12`); SSE is DB-backed (`apps/api/src/index.ts:333-343`) so only 3 of 29 can reach the wire; `node.failed`/`ledger.failure`/`ledger.attempt` are error-shaped, unproducible, UI branch dead (`apps/ui/app/debateFailureEvents.source-test.mjs.disabled`). Recommend: prune exactly those three (+ dead branch) behind `pnpm generate:contract`; never widen `run_progress_event` into a second error channel (OBS-R028/R136); the remaining 23 are product progress vocabulary, ticketed outside this mission. §K row 4.

### H.2 E6-06 — scheduling + the external liveness owner

`job:*` are one-shot CLIs (`package.json` scripts), no cron in-tree. Interim: **launchd** — three plists for the jobs AND `KeepAlive` agents for the long-lived runtimes (api, runner, obs-daemon, watchdog), which doubles as RT-01's never-started witness; per-job stderr paths; no repo code. Post-containerization: Hatchet cron workflows (`v1/client/features/crons.d.ts`, verified in the pinned SDK) behind the container-topology gate. Cadence expected-vs-observed is detector-observed either way (OBS-R004/R005). §K row 5.

### H.3 Build repoint (R-E6-10)

Root `build` filters `dialectical-engine-web` (`package.json`); repoint to `apps/ui`'s package (`dialectical-engine-v2ui`) + typecheck coverage check — one G1 PROG task. The `v2` name breaches the naming law → separate micro-ticket (rename to `dialectical-engine-ui`), not bundled (OBS-R100 discipline).

### H.4 `web/` leftover

No instrumentation, no build effort; removal rides the parked tree-move commit (ROW-GIT, R-E6-10). Stated so the coverage map is honest.

### H.5 Dev-logger reconciliation (OBS-R136)

The `apps/ui/lib/observability/README.md` prohibition stays true **for those diagnostics** (file-only JSONL); the `obs` store is a separate V-ordered class; neither imports the other's transport. PROG adds one amendment paragraph to that README citing this mission. Its redaction tests seed the obs redactor suite.

---

## I. DDD impact

- **New bounded context `obs`** — owns: Occurrence, Incident, CaptureGap, TraceVerdict, FixProposal, ApprovalRecord, SourceLink, ZoneDailyCount, AuthorityProof (new — A.5), UnclassifiedResidue (new — RT-09), capture-status truth, fingerprint identity, **audit-chain continuity**. Language: *occurrence* vs *incident*; *capture gap*; *zone residue*; *severe workflow*; *trip* (deterministic authority removal); *proof-of-capture-health* (positive artifact whose absence is a trip); *lineage depth* (fix-chain bound).
- **Read-only contexts:** `core`/`ledger`/`serve` via obs-owned column-safe views (sequence authority stays ledger's); `register` (thresholds live there; authority stays register's). **Never touched:** `identity` — no joins, no columns, no view exposure (R-E4, E6-08). **Boundary with `packages/liveness` (FID-17, OBS-R003):** liveness remains the content-staleness owner (`FRESH/UNDER_REVIEW/STALE/…`); obs runtime-health detectors are a separate family that may **consume** liveness outputs as signals but never reuse or extend its states; `obs.component_health` is process health, not content staleness.
- **Anti-corruption:** Hatchet ingestion translates vocabulary at the boundary; Hatchet text never crosses as instructions — or as stored bytes (OBS-R142, FID-08).
- **Invariant ownership:** append-only + chain continuity — `obs` (trigger- and chain-enforced, RT-06); projection consistency — daemon fold + watchdog drift check; zone membership — human-owned manifest (obs enforces, never defines); board custody — Hermes store, written only by `obsctl` under V's identity (RT-20); product failure semantics — unchanged by construction (OBS-R055/R056).

## J. Self-observation matrix

| Component | Observed by |
|---|---|
| capture lib / emit path | health counters + per-runtime receipts (RT-05) + watchdog scrape + G1 chaos (all nine) |
| store / DB sink | non-recursive db channel + `capture_gap` + spool receipts + **hash-chain continuity checks** (RT-06) |
| spool | receipts on re-ingest; unflushed-age detector; **volume separation from Postgres data verified in chaos** (RT-16) |
| boot/import window | **install-first side-effect import** (RT-01) + external liveness owner (launchd KeepAlive + expected-process detector) — never-started has an outside witness |
| SIGKILL/OOM class | acknowledged uncapturable; external liveness owner only (RT-02) |
| zone counter + drift | jittered batch flushes; drift = hash+day aggregate only (RT-12); classifier residue lands in `unclassified`, trip-eligible (RT-09) |
| obs-daemon | heartbeat → `component_health` (display) + **proof artifact (authority)**; watchdog; silence ⇒ stale proof ⇒ authority off + detector occurrence |
| watchdog | daemon watches back (mutual heartbeat); launchd keepalive |
| diagnosis worker | supervisor lease + wall-clock kill; `agent_action` audit; usage telemetry or fail-closed |
| fix worker | **OS-user sandbox (D.6); patch-only output; daemon-held credentials; adversarial fixture at G4 entry** (RT-22) |
| hatchet ingest | cursor-lag self-events + source gaps + skew monitor (trip-eligible, RT-15); shared-failure-domain named (RT-16) |
| notifications | delivery-result self-events; template-only content inside the injection wall (RT-21/RT-27) |
| board writes | `obsctl` (human identity) + board-id read-back + `agent_action` audit (RT-20) |
| kill/arm/proof | positive artifacts; transitions audited when DB up; absence = trip (RT-04/RT-23) |
| policy gate | input-hashed decisions in `policy_decision`; branch-protection hash checked every dispatch (RT-26) |

## K. DECIDE-V table (incl. ARCH→REQ returns per rework rule 3)

| # | Decision | Options / recommendation | Trace |
|---|---|---|---|
| 1 | All numeric bounds — now **including `obs.fingerprintMaturityN` (seed: Grok N=3, FATAL→1) and `obs.blastRadiusMaxReachable` (no seed exists; fail-closed until rated)**, `obs.lineageDepthMax` (RT-24), `obs.authorityProofStalenessMs`, plus overhead/queue/depth/caps/cadences/skew/severe threshold | seeds as marked; ratify after G1 calibration; skew only from split-clock measurement (RT-15) | OBS-R044, DIV-11, RT-31, OBS-R109 |
| 2 | E6-14 auto-trip numbers | structure fixed (OR list, D.7); numbers at activation | E6-14 |
| 3 | Gate-exit sample sizes / rates / calendar minimums — now incl. G2's human-labelled sample size, agreement rate, `INSUFFICIENT_EVIDENCE` ceiling/floor (RT-33) and G5's structural quantities (RT-37) | structure in §G; numbers V's | OBS-R123 |
| 4 | E6-15 prune of 3 error-shaped contract members | PRUNE (H.1) | R-E6 deferred |
| 5 | E6-06 scheduler + liveness-owner hosting | launchd now (jobs + KeepAlive witnesses); Hatchet crons behind the container gate | R-E6 deferred, RT-01 |
| 6 | `obs.occurrence_detail` — re-put with the honest posture (FID-08): structured fields allowlist-gated; **free-text remnant is a denylist-bounded OBS-R048 exception**, human-only, first-party-only, zone-excluded | adopt as specified (A.6) **or** drop the free-text remnant (nothing machine-side reads it) — V's call | OBS-R050, DIV-02, OBS-R048 |
| 7 | Notification channel (RT-27) | **local-first: osascript + sendmail (recommended)**; ntfy only if self-hosted + publish-auth + V explicitly rules incident metadata may leave the machine | R-E6-09, OBS-R103 |
| 8 | `obs.severeThreshold` — restated over the obs severity ladder (RT-41) | seed: `≥ SEVERE` on `INFO<DEGRADED<SEVERE<FATAL`; mapping table in policy bundle; OBS-R008 deviation argued (unordered CONDITION_MARKS cannot carry `≥`) | R-E6-09, OBS-R008 |
| 9 | R-BIGGER × OBS-R117 composition | approval-first proposal; fix lands as human-merged PR into `dev` under E6-04 — confirm | R-BIGGER, E6-04 |
| 10 | Runner mis-wiring fix ticket (out of scope; G1 fixture until fixed) | ticket to product now | synthesis finding 4 |
| 11 | **E6-04 scoping (FID-07):** does "loop-agent PRs reviewed by human + independent reviewer" bind QUICK (which R-E1 ratifies as auto-merged)? | recommended reading: R-E1 (ruling) governs QUICK landing; E6-04 governs PR-FIX/approval-first; QUICK's human element = deterministic independent approval + post-landing visibility — confirm or veto | E6-04, R-E1 |
| 12 | **Client-report fix-eligibility (RT-19c):** `ui_client` occurrences are report-and-count only — structurally outside maturity/tier/fix | keep excluded until a dedicated V ruling opens them (recommended: keep excluded) | RT-19, E6-12 |
| 13 | **ARCH→REQ — E6-01 × OBS-R119 (RT-25):** merge-only means a QUICK merge executes nowhere, so the ruled canary/auto-revert has an empty input set | (a) **deferred canary [REC]:** fix `UNVALIDATED` at merge; canary window opens at next natural deploy; lineage authority frozen until observed; auto-revert = revert PR (still merge-only) · (b) tracked canary environment — requires an E6-01 amendment · (c) drop auto-revert, keep recurrence-escalate only. G5 closed until ruled | E6-01, OBS-R119/R108, RT-25 |
| 14 | **ARCH→REQ — dual-source fallback (RT-39):** if SPIKE-D1 hits a kill criterion (retention < poll floor / unboundable pagination / no read token — none provisioned today), OBS-R137/R138 (V's rulings) cannot be met by facts | (a) V accepts first-party-only with the uncovered classes named (worker-crash-before-flush loses its second witness) · (b) V orders Hatchet-side changes (new mission scope) · decision at SPIKE-D1 exit | OBS-R137/R138/R143, RT-39 |
| 15 | **Reaper build-or-park (FID-14, OBS-R006/DIV-10):** the claim-deadline detector ships with no lawful remediation; alert-fatigue is real | (a) **park + mitigation [REC]:** stall alerts dedup per work item (one incident, recurrence annotated, acknowledged-state mutes) · (b) commission the reaper as a follow-up product mission | OBS-R006, DIV-10 |
| 16 | **Fix cooldown window (FID-14, OBS-R108)** + root-keyed extension (RT-17) | window length V's; root-keyed rule structural (D.4) | OBS-R108, RT-17 |

No requirement conflict remains unrouted: rows 13 and 14 are the two ARCH→REQ returns; rows 9/11 are composition confirmations.

## L. Traceability closure (re-run for round 1)

- **Six ARCH-tagged UNVERIFIED rows:** **U-01** design + SPIKE-D1 with exit AND kill criteria + fallback routed to V (D.5, §K 14) · **U-06** CLOSED on the interim `tsx` binding; container questions live in the standalone container-topology gate, no cross-mission ordering (§G, FID-11/RT-38) · **U-07** CLOSED (D.2) · **U-09** CLOSED on the redesigned classifier (equal-work, chain-walk, scrub, six rows — §E) · **U-11** RE-CLOSED on the ambient-context watermark, three-state, query-free (C.4, RT-40) · **U-18** CLOSED by design; tolerance ratified only from split-clock measurement (D.5, RT-15).
- **Overlay items:** R-E1/R-E2 (D.4), R-BIGGER (D.3/D.4 — reachable at all severities, FID-06), R-E3 (D.1/D.7), R-E4 (A.3/A.7/B.2-client/I), R-E5 (E — strengthened: frame scrub, equal work, anonymous drift), R-E6-09 (D.3/F — actor corrected to obsctl, OBS-R127 unamended), R-E6-13 (A.5 — now fail-closed by positive proof), R-E6-10 (B.2/H.3/H.4), E6-01..E6-16 woven where cited (E6-01 tension routed as §K 13; E6-02 "expansion" now covers allowlist growth, RT-32; E6-04 scoping §K 11; E6-11 inline in D.4's floor; E6-12 counting fixed in A.4).
- **Previously uncited-but-required ids now carried in design:** OBS-R005 (B.2 scheduler), OBS-R007 (A.3 taxonomy), OBS-R010 (A.3 promotion), OBS-R011 (A.3 + G1 registry), OBS-R012 (B.2 detectors), OBS-R083 (D.1 ordering), OBS-R090/DR-179 (D.1), OBS-R093 + E6-11 (D.4 head), OBS-R128 (F routing table), OBS-R003 (I), OBS-R026 (B.1), DR-188 (A.2). §K rows exist for every DECIDE-V-marked item the plan touches: OBS-R044/R109 numbers → row 1 · OBS-R106/E6-14 trip numbers → row 2 · OBS-R123 gate numbers → row 3 · OBS-R108 window → row 16 · OBS-R006 reaper → row 15 · OBS-R119/E6-01 canary → row 13 · OBS-R137/R138 fallback → row 14.

## M. Rework ledger — every finding → resolving section (round 1)

| Finding(s) | Resolution |
|---|---|
| FID-01, RT-29 | §D.4 head: §9 floor verbatim + E6-11 definition + dominance over allowlist; path-glob deny-by-default; "production file" defined enumeratively; §G5 + D.7 reference the same list |
| FID-02 | §A.3 taxonomy (`SUSPICIOUS_SUCCESS` + three subclasses), §B.2 detectors, §G1 ship list |
| FID-03 | §B.2 scheduler row: job-lifecycle occurrences with input counts |
| FID-04 | §A.3: closed taxonomy named + pinned; code registry = G1 deliverable; OBS-R010 promotion MUST |
| FID-05, RT-03 | §G1: all nine OBS-R061 cases restored (incl. read-only fs) |
| FID-06 | §D.3: pipeline serves every above-QUICK proposal; severity = urgency only; §F payload |
| FID-07 | §D.4 E6-04 reconciliation + §K row 11 |
| FID-08 | §A.6 single spec (honest OBS-R048 exception, §K row 6); §D.5 Hatchet text never stored |
| FID-09 | §A.4: `zone_marker` removed from fingerprint; `zone_context` column only |
| FID-10, RT-07 | §E.3: manifest frames scrubbed everywhere (`ZONE_FRAMES_ELIDED`), cause walk stops at zone, no detail for zone-context |
| FID-10(leg 2), RT-12 | §E.3: drift = fixed code + manifest hash + day bucket, jitter-batched; `obsctl reveal-drift` |
| FID-11, RT-38 | §G: SPIKE-U06 removed from the ladder; U-06 closed on interim binding; standalone container-topology gate, order-free both directions |
| FID-12 | §G: OBS-R122 numbering restored, G6 restored, mapping table, rollback never darkens notification |
| FID-13 | §F owner routing table (OBS-R128); §D.1 severity-then-age ordering (OBS-R083) |
| FID-14 | §K rows 15 (reaper + alert-fatigue), 16 (cooldown), 1 (maturity N) |
| FID-15 | §D.1 DR-179 + OBS-R090 non-expansion; §A.2 DR-188 named |
| FID-16 | §B.2 client row: counted client-drop class; transient non-persisted origin key |
| FID-17 | §C.4 three-state watermark; §I liveness boundary (OBS-R003); §B.1 OBS-R026 |
| RT-01 | §B.2 process row: install-first side-effect import + external liveness owner (launchd KeepAlive + presence detector); §H.2 |
| RT-02 | §A.5: writeSync on pre-opened fd; SIGKILL class acknowledged; witness external |
| RT-04, RT-23 | §A.5/§D.7: positive proof-of-health + ARMED conjunction; absence = trip; polled during worker lifetime; revocation |
| RT-05 | §B.2/§A.5: per-runtime health semantics (freshness vs receipt pairs); volumes verified via container gate |
| RT-06 | §A.2: hash chains define "audit gap"; TRUNCATE statement triggers; §D.7 term updated |
| RT-08 | §E.3: fixed-cost opaque enqueue on the request path; off-path classification; G1 timing acceptance test |
| RT-09 | §E.3: sixth row `ORIGIN_UNKNOWN`; default-to-excluded scoped to zone context; `unclassified` trip-eligible counter |
| RT-10 | §E.3/§C.3: classifier and zone check walk the full cause chain |
| RT-11 | §E.3: anchored repo-root prefix match; node_modules excluded; decoy test |
| RT-13 | §A.2/§D.5: UNIQUE `(source, source_event_ref)` + `ON CONFLICT DO NOTHING` |
| RT-14 | §A.4: maturity counts distinct work units; task-exhaustion analogue; `attempt_index` |
| RT-15 | §D.5: split-clock ratification; drift trip-eligible |
| RT-16 | §D.5/§A.5/§J: shared failure domain named; spool/proof on separate volume; chaos-verified |
| RT-17 | §D.4: root-keyed cooldown + root-keyed single-active-mutation |
| RT-18 | §D.5 SPIKE-D1: attempt-identity + runId disambiguation as exit criteria; key contingent |
| RT-19 | §B.2 client row: closed enums, server build_ref, structurally fix-ineligible (§K 12), origin-keyed shared-state limiting |
| RT-20 | §D.3: tickets emitted by `obsctl approve` under V's identity; OBS-R127 unamended; board-id read-back |
| RT-21 | §D.3: board + notifications inside the OBS-R102 wall; template-only text; G3 corpus targets |
| RT-22 | §D.6: OS-user sandbox, patch-only output, daemon-held creds, sandboxed tests, G4 entry verification |
| RT-24 | §D.4/§A.2: lineage attribution + `lineageDepthMax` bound |
| RT-25 | §K row 13 ARCH→REQ (deferred-canary REC); G5 gated on the ruling |
| RT-26 | §D.7: branch-protection hash in continuous pre-dispatch checks + OR list |
| RT-27 | §F: local-first channels; ntfy gated on self-hosting + publish-auth + V egress ruling; one payload template, no prose |
| RT-28 | §A.7: LOGIN roles, per-component connection strings, real-connection grant tests |
| RT-30 | §D.4 QUICK: RED test derived from human-owned invariant; ESCALATE indicator |
| RT-31 | §B.3/§K row 1: `blastRadiusMaxReachable` (fail-closed, no seed) + `fingerprintMaturityN` (seeded) |
| RT-32 | §D.7: allowlist growth = E6-02 expansion, dual-custody re-pin via obsctl; file in OBS-R104 set |
| RT-33 | §G2 acceptance: human-labelled sample, agreement rate, IE ceiling + substantive floor |
| RT-34 | §G1: fixture restated falsifiably (S04 work-item drive, exact code/fields, named harness family) |
| RT-35 | §G3: corpus custody — independent QA author, pinned hash, ruled size, deterministic detector, board+notification targets |
| RT-36 | §G preamble: R-E6-13 wins; rollback only for non-capture regressions; notification never darkened |
| RT-37 | §G5: structural acceptance quantities enumerated, numbers V's |
| RT-39 | §D.5 kill criteria + §K row 14 ARCH→REQ fallback |
| RT-40 | §C.4: ambient-context watermark, query-free, three-state; U-11 re-closed |
| RT-41 | §A.3 severity ladder + separate `condition_mark`; §K row 8 restated; OBS-R008 deviation argued |
| RT-42 | §A.3: per-process-start `UNTRACKED-DEV:<HEAD-sha>:<start>`; regression question deferred to ROW-GIT |

Held-not-charged items (rework rule 4) were not churned: QUICK's R-E1/R-E2 mechanics, R-E4's mechanical exclusion (strengthened only where RT-28 charged the enforcement), `apps/ui` sole-client scoping, U-07's closure, and the OBS-R127 precedence analysis (whose *actor* RT-20 charged and which now holds the ruling unamended — a strict strengthening of the round-0 posture).

*End of Plan.md — FinalPlan and slice decomposition belong to C4 after the plan-review diamond; deliberately absent here.*
