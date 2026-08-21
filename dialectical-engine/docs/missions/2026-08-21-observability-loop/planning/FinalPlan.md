# FinalPlan.md — Observability layer + error-listener loop (ARCHITECTURE, C4 — implementation-ready)

- **Mission:** `2026-08-21-observability-loop` · **Ticket:** ARCH-OBS-C4 · **Seat:** Claude C4 FinalPlan author (FRESH instance, SDK-subagent — spine law: C4 is a different session from C2; nothing of the C2 session was resumed).
- **Status of inputs:** `planning/Plan.md` is **APPROVED** — Lens A (`reviews/H2-plan-fidelity-opus.md`) PASS, Lens B (`planning/PlanReview.md`) PASS, both on round 1. This document does **not** re-litigate the approved design. It (1) folds V's **Batch-3 rulings** (`research/POST-SYNTHESIS-RULINGS.md`, binding overlay — wins on any conflict), (2) applies the two round-1 cleanups (Lens A **REG-01**; Lens B's four **PROG hardening constraints**, carried here as IC-1..IC-4), and (3) adds the implementation layer: per-subsystem deliverables with disjoint file contracts, DDD bounded-context and invariant ownership, dependency order, and the definitive G0–G6 rollout with falsifiable per-gate acceptance — sized so G5 can cut vertical slices with disjoint file contracts. **This document supersedes Plan.md as the single implementation source; where the two texts differ, this one is definitive and §M names why.**
- **Inputs read in full:** Plan.md · POST-SYNTHESIS-RULINGS.md (incl. Batch 3) · H2-plan-fidelity-opus.md · PlanReview.md · H3-merge-rework-packet.md · SYNTHESIS-requirements.md · 00-intake-H0.md · brief.md. Repo anchors the design touches were **re-verified read-only at C4** (2026-08-21): migrations end at `0033` + empty `pending/` (so `0034` is free); roots per `acceptance/README.md:1-9`; `TypedDomainError` still causeless (`packages/kernel/src/index.ts:283-288`); `CONDITION_MARKS` unordered, no FATAL member (`packages/kernel/src/index.ts:69-80`); single-row allocator (`migrations/0000_s00.sql:9-29`); per-table `reject_mutation` block, `BEFORE UPDATE OR DELETE` only (`migrations/0000_s00.sql:314-331`); NOLOGIN role idiom (`:290-296`); runner mis-wiring live (`apps/runner/src/main.ts` wires `compositionRow`, not `judgementPolicy`; throws at `apps/runner/src/index.ts:1226-1232`); repair-packet interpolation live (`:883-890`); task catch + `retries: engineRetries` (`:2494-2526`); `resolveSession` = sha256 of any header (`apps/api/src/index.ts:129-140`); `logger: false` (`:143`); zone mounts outside the zone (`:205-234`); `additionalMetadata v3RunId/v3WorkItemId/sourceOfRecord` (`:363-380`); zero `process.on(` handlers in `apps/*/src` + `packages/*/src`; hatchet-lite pinned by digest on the shared Postgres, ports 8888/7077, no pooler (`compose.dev.yaml`); `deploy/postgres/init-hatchet.sql` = `CREATE DATABASE hatchet;`; SDK `1.28.1` with `v1/client/features/{logs,crons,metrics,…}.d.ts` present; root `build` still filters `dialectical-engine-web` (`package.json:12`); `apps/ui` package is `dialectical-engine-v2ui`; no `apps/ui/app/{error,global-error}.tsx`; `ScoringErrorBoundary.tsx` exists; 7 storable `run_progress_event` kinds (`migrations/0021_dr174_cooldown_prune.sql:4-12`) vs 29 declared wire types; `run_progress_event` has `at_seq` only (`migrations/0000_s00.sql:68-75`); evaluator dispatch binding structurally `UNBOUND` (`packages/evaluator/src/dispatch-binding.ts:6-11`); `tsx` start scripts in `apps/{api,runner}`. Zone-internal citations (`apps/api/src/registration.ts:429,527,566,594,621,657`) are **carried from the approved Plan.md, not re-read** — the zone is read only at its outer mounts (OBS-R130).
- **Precedence:** Batch-3 rulings > earlier ruling ids (`R-E1..R-E5`, `R-BIGGER`, `R-E6-*`) > adopted defaults (`E6-01..E6-16`) > `OBS-Rnnn` rows > this document's judgement. Marks: **MUST** / **SHOULD** / **DECIDE-V** (§K). No new requirement conflict surfaced at C4; §K gains no new rows.
- **Scope law:** design only — no code, no migrations, no config. Excluded zone read only at outer mounts; nothing here proposes changes inside it (OBS-R130/R135).
- **Human review:** H4 next, then G5 vertical slices, then H6 lane plan + planning-graph image → V.

---

## 0. Shape of the whole

One new bounded context, **`obs`**, split across the product/ops seam OBS-R125 fixes:

- **Product side (inside the reachability walk):** capture library `@debateai/obs-capture` + the `obs.*` Postgres tables. Imported by the three production roots (`apps/api/src/main.ts`, `apps/runner/src/main.ts`, `apps/scheduler/src/cli.ts` — roots per `acceptance/README.md:1-9`) plus a thin client seam in `apps/ui` (R-E6-10).
- **Ops side (outside the walk, like `acceptance/`):** `tools/obs-listener/` — deterministic daemon, ephemeral Codex CLI workers (R-E3), watchdog, `obsctl` human CLI. Anything touching a model or git lives here only (OBS-R125, DIV-08). Mission seats' no-push law is untouched: the loop's push authority is a PRODUCT capability granted by V's goal, exercised only by the daemon under the bot identity, never by any mission worker (OBS-R129).
- **Identity separation is real, not nominal (RT-22/RT-28):** every obs component gets its **own OS-level and DB-level identity** — LOGIN database roles with distinct credentials, and (for the fix path) a separate OS user. No obs process ever connects as the product superuser.
- **Topology-neutral core, thin bindings** (ROW-TOPOLOGY): the core knows envelopes and sinks; per-runtime bindings are the only files docker-hatchet can obsolete. **No hard cross-mission ordering exists anywhere in this plan** (FID-11/RT-38 — §G container-topology gate).

Naming: "current algorithm version" throughout; the `dialectical-engine-v2ui` breach is handled in §H.3.

### 0.1 What C4 folded in (delta summary — full mapping in §M)

1. **Batch-3 row 13 — DEFERRED CANARY ruled (option a):** QUICK landings are `UNVALIDATED` at merge; the canary window opens at the **next natural deploy**; root/lineage fix authority is frozen until a deploy confirms; exactly ONE automatic revert PR (still merge-only). E6-01 stands unamended. G5 canary behaviour is now certifiable. → §D.4, §D.7, §A.2, §G5.
2. **Batch-3 row 11 — QUICK review scoping ruled (option a):** E6-04's human + independent review governs PR-FIX and approval-first; for QUICK, "independent review" **is** the automated policy gate (floor + allowlist) plus post-landing human visibility (OBS-R115/R121). QUICK keeps its no-approval property. → §D.4.
3. **Batch-3 row 6 — free-text remnant DROPPED ENTIRELY (option a):** `obs.occurrence_detail` stores **no free-text message remnant**; **no raw message text is stored anywhere in obs**. The OBS-R048 exception is REMOVED, not bounded; OBS-R050's SHOULD is ruled out by V. → §A.6, §A.3, §A.7, §G1 acceptance.
4. **Batch-3 row 14 — Hatchet-readable is a NEW MISSION (option b):** if SPIKE-D1 hits a kill criterion, dual-source is **not** silently narrowed; the listener ships first-party-only as an **EXPLICIT DEFERRAL**, and wiring Hatchet read-back becomes its own scoped mission whose motivating gap is the uncovered worker-crash-before-flush class (RT-02). → §D.5, §G2/§G3 acceptance qualifiers.
5. **Lens A REG-01:** OBS-R046/R047/R054 citations restored; one restored MUST (redaction precedes every durable-sink write; no pre-redaction bytes are ever durably stored); the capture-time→flusher-time relocation is **argued** as the precedence rule requires. → §A.7 (cross-referenced from §E.3).
6. **Lens B PROG hardening constraints IC-1..IC-4** (binding on every G5 slice and H6 ticket): import-light installers; enqueue-holds-a-reference; fix-worker **no access** + forge fixtures; **HMAC-keyed hash chain** with watchdog witness. → §B.1/§B.2, §E.3/§A.7, §D.6, §A.2; gate hooks in §G1/§G4.
7. **ROW-GIT recorded:** the V-owned reconciliation commit lands **immediately before the first coding lane of this mission** — it is the entry precondition of the first G1 lane (and G4's standing gate is thereby trivially satisfied later). → §G preamble, §G1 ENTRY.

---

## A. Error store (`obs` schema)

### A.1 Placement and mechanics

- **MUST** — New Postgres bounded context: schema `obs` via `pgSchema("obs")` beside the existing schema declarations (`packages/db/src/schema.ts:7-15`), tables authored in a **new file** `packages/db/src/obs-schema.ts` (disjoint file contract, §P TP-1/TP-2), created by the next-numbered migration `0034_obs_foundation.sql` under the existing `migrate()` runner (`packages/db/src/index.ts:123-149`; re-verified: `0034` is free and `migrations/pending/` is empty). No column added to `ledger.ledger_entry`, `core.run_progress_event`, `core.work_item` (OBS-R028). Migrations `0030..0033` untouched (OBS-R130/R135).
- **MUST** — **Own ordering, never the global allocator** (OBS-R031, DIV-04): `CREATE SEQUENCE obs.occurrence_seq`. Verified hazard: `ledger.allocate_sequence()` is a single-row locked `UPDATE` (`migrations/0000_s00.sql:9-29`). Sequences are monotonic-with-gaps; the cursor acks rows and never counts them, so sequence gaps are lawful — **and are therefore explicitly NOT the audit-continuity signal** (RT-06; continuity is the keyed hash chain, A.2).
- **MUST** — Immutability where it is audit (OBS-R030, DIV-03): `core.reject_mutation` attached per-table by the explicit-list idiom (`migrations/0000_s00.sql:314-331`) to every append-only obs table, **plus a `BEFORE TRUNCATE … FOR EACH STATEMENT` reject trigger on each** — row-level triggers do not fire on TRUNCATE (RT-06). Mutable tables are enumerated with their reconstruction story (A.2).

### A.2 Table family (logical records per OBS-R029)

Append-only + `reject_mutation` + truncate-reject:

| Table | Holds | Key ids |
|---|---|---|
| `obs.occurrence` | one captured event (all sources); **UNIQUE `(source, source_event_ref)`** so at-least-once ingest is idempotent by constraint, inserted `ON CONFLICT DO NOTHING` — the only lawful ingest form under the immutability trigger (RT-13) | OBS-R029/R032 |
| `obs.occurrence_detail` | human-only structured detail, first-party only, **no free text** (A.6, Batch-3 row 6) | OBS-R050 (ruled), OBS-R048 |
| `obs.delivery` | per-occurrence lease/attempt/ack facts | OBS-R080 |
| `obs.trace` | trace verdict + evidence, persisted before ack | OBS-R075 |
| `obs.agent_action` | every listener/worker/supervisor/obsctl action, incl. landing + canary facts (`QUICK_LANDED{validation_state}`, `CANARY_OPENED`, `CANARY_VALIDATED`, `CANARY_REVERTED` — Batch-3 row 13) | OBS-R111, OBS-R119 |
| `obs.policy_decision` | deterministic gate evaluations, input-hashed | OBS-R094 |
| `obs.budget_usage` | spend facts (calls/day, wall-clock) | OBS-R089/R107, R-E3 |
| `obs.spool_receipt` | idempotent spool re-ingest receipts | OBS-R041 |
| `obs.capture_gap` | counted loss windows per source (incl. `unclassified` and client-drop classes — RT-09, FID-16) | OBS-R058, R-E6-13 |
| `obs.zone_daily` | anonymous zone counter deltas (E.4) | R-E5 |
| `obs.source_link` | evidenced cross-source merges, both retained | OBS-R139/R140, E6-16 |

- **MUST — audit continuity is a KEYED hash chain, not a sequence (RT-06 + IC-4):** `obs.occurrence` and `obs.agent_action` each carry `prev_link`, chained per `(source, writer_identity)`. Each link is **`HMAC-SHA256(K_writer, prev_link ‖ canonical-row-bytes)`** where `K_writer` is a per-writer-identity key held in a key file owned by that writer's OS user (mode 0600), living **outside Postgres** — on the ops volume for ops components, in a per-runtime key path for product writers — and never stored in the database, the repo, or the policy bundle. **"Audit gap" is DEFINED as a broken or non-verifying chain link**, which is what D.7's trip and OBS-R123's "zero audit gaps" gate criterion evaluate. Because the DB superuser cannot read the OS key files, deletion or truncation followed by forward re-computation is not available to any database identity — the "independent of who holds superuser" claim is now **earned, not asserted** (IC-4 closes Lens B's RT-06 overclaim). Verification: the watchdog holds the verify keyring (readable only by the watchdog OS user) and re-verifies chain continuity on its OBS-R086 sweep; additionally it **durably witnesses chain heads** to an append-only local witness log on the ops volume, and the daemon's proof-artifact refresh (A.5) includes the latest witnessed heads — so silent history rewrite requires defeating the DB, a writer key file, AND the watchdog's witness log at once. Key provisioning/rotation is an E6-02 **expansion** event: dual-custody, executed via `obsctl`, audited. Host-root attackers remain out of the threat model.

Mutable, each with a reconstruction story:

| Table | Why mutable | Reconstruction |
|---|---|---|
| `obs.incident` | fingerprint-level projection: first/last seen, distinct-work-unit count (A.4), max severity, state machine (NEW→RESEARCHING→PROPOSED→APPROVED→TICKETED→FIXING→**FIXED_UNVALIDATED→FIXED_VALIDATED** / REGRESSED / ESCALATED / PARKED — the FIXED split implements Batch-3 row 13's deferred canary), source set, cooldown, **`attributed_landing_ref` + `lineage_depth`** (RT-24) | deterministic fold over `occurrence` + `agent_action`; watchdog re-derives a sampled subset daily, drift = self-event (DIV-03 counter answered) |
| `obs.consumer_cursor` | one row per consumer (listener, hatchet-ingest) | replayable from `obs.delivery` / ingest receipts |
| `obs.component_health` | dashboard heartbeat row per component | ephemeral health; every state *transition* is additionally a self-event occurrence. **This table is display, never authority — authority reads the proof artifact (A.5), not this row** |

**MUST** — no automated deletion; no role holds DELETE; retention floor per OBS-R045 under **DR-188** (the intake's banked data-preservation law). E4 stays PARKED AS MOOT (R-E4).

### A.3 Occurrence envelope (OBS-R032/R033/R034/R036/R039)

`occurrence_id` · `occ_seq` · `prev_link` (A.2, keyed) · `occurred_at`/`captured_at` · `environment` · **`build_ref` + `build_dirty`** — interim (pre-ROW-GIT): stamped **once per process start** as `UNTRACKED-DEV:<HEAD-sha>:<process-start>` — cheap, stable within a process lifetime, honest about not identifying a build; **the "did my own fix regress it" question is explicitly unavailable until ROW-GIT lands** (RT-42), and the interim stamp can never open a canary window (D.4) · `runtime` (closed: `api|runner|scheduler|evaluator-lib|ui-client|listener|watchdog|ingest`) · `component` (structural `(process, package, call_site_key?, organ?)` — OBS-R009; `call_site_key` precedent: `migrations/0021_dr174_cooldown_prune.sql:14-16`) · `capture_point` (closed: `process|http|job|provider|db|client|detector|boundary|self`) · `code` (registry member — OBS-R011; **the machine-readable code registry is a named G1 deliverable (§P D06a), pinned in the policy bundle**, FID-04) · `taxonomy_class` + `severity` + `condition_mark` (below) · `disposition` · `fingerprint` + `fingerprint_version` · `redaction_policy_version` + `allowlist_set_id` + `fallback_minimized` (OBS-R054) · `capture_status` (`PERSISTED|SPOOLED|GAP_RECONSTRUCTED`, OBS-R039) · correlation refs (three-state) · cause refs · `at_seq_watermark` (**three-state**, C.4) · `frames` (bounded, repo-relative, normalized — OBS-R051; **zone-scrubbed per E.3 before any sink**) · `safe_template_id` + **typed template parameters** (OBS-R049; Batch-3 row 6 consequence: parameters are the only text-shaped surface left, so each template declares its parameter types in the registry — ids, registry codes, closed-enum members, bounded integers; a parameter failing its declared type is dropped and `fallback_minimized` set; **no string parameter may carry unvalidated input**, OBS-R048/R103) · `source` (`first_party|hatchet|ui_client`) + `source_event_ref` · `zone_context` (boolean column, **not** a fingerprint input — FID-09) · `attempt_index` (evidence for RT-14).

- **MUST — no free-text message field exists anywhere in `obs` (Batch-3 row 6):** the envelope has no `message` column, `occurrence_detail` has none (A.6), and no other obs table carries one. Raw message text is consumed at capture only to derive `code`/`safe_template_id`/typed parameters via registry match, then discarded. Enforced by the schema column-set manifest test (G1) asserting no free-text/message-shaped column in any `obs.*` table.
- **MUST — closed taxonomy, named (FID-04, OBS-R007):** `taxonomy_class` initial closed vocabulary, grounded in present-tree signals and pinned in the policy bundle at G0 (extension = human re-pin, never runtime): `PROCESS_DEATH · HTTP_FAILURE · JOB_FAILURE · PROVIDER_EXHAUSTED · DB_FAILURE · PARSE_SCHEMA_FAILURE` (anchor: `raw_artifact.parse_error` PARSE_FAILED/SCHEMA_FAILED, `migrations/0004_s04.sql`) `· STALL_DETECTED · SILENT_NOOP · SUSPICIOUS_SUCCESS` (first-class per OBS-R012 — subclasses `empty_output`, `missing_required_fields`, `missing_artifact_chain`, seeded from the surviving `apps/ui/lib/observability/suspiciousScoring.ts`, FID-02) `· CLIENT_FAILURE · CAPTURE_SELF · ORIGIN_UNKNOWN` (RT-09).
- **MUST — severity is an obs-owned ordered ladder (RT-41):** `severity ∈ INFO < DEGRADED < SEVERE < FATAL`. `CONDITION_MARKS` (`packages/kernel/src/index.ts:69-80`) is an **unordered** vocabulary whose header reserves minting — obs does not extend or order it; the observed mark rides the separate non-ordering `condition_mark` column. This satisfies OBS-R008's reuse *intent* while arguing the deviation OBS-R008 (SHOULD) permits: `≥` over an unordered set is not evaluable. The code/mark → ladder mapping is a deterministic table in the policy bundle.
- **MUST — severity promotion (FID-04, OBS-R010):** promotion depends only on breadth, duration, recurrence and affected runs — computed over trusted structural fields; **never on model sentiment and never on attacker-influenceable text**. Hatchet-sourced and client-sourced occurrences enter at a floor severity and can only be promoted by those deterministic rules.
- **MUST** — correlation refs three-state (value | `NOT_APPLICABLE` | `UNKNOWN:<reason>`) for `run_ref/work_item_ref/node_ref/attempt_ref/ledger_ref` (OBS-R034); cause explicit (`parent_occurrence_ref` | `NO_CAUSE` | `CAUSE_NOT_CAPTURED:<reason>` + relation, OBS-R036); schema-invalid envelopes go to the spool as `schema_invalid`, never into the cursor (OBS-R038).
- **MUST (R-E4)** — no user-linked identifier anywhere in `obs` — no asker/session/email/IP/user-agent/pseudonym columns, no keyed pseudonyms (R-E4 supersedes OBS-R052's keyed-pseudonym design and the E6-07 default: those columns are OMITTED entirely). Enforced by (i) schema column-set manifest test, (ii) allowlists with no identity fields to admit, (iii) identity-shaped canaries (OBS-R054).

### A.4 Dedup / fingerprint / maturity counting

- **MUST** — `fingerprint_v1 = sha256(version ‖ code ‖ taxonomy_class ‖ component.package ‖ (call_site_key || top_repo_frame) ‖ runtime)`. **No message text** (OBS-R037; motive verified at `apps/runner/src/index.ts:883-890`). **No `build_ref`** (recurrence across builds must group). **No `zone_marker` (FID-09):** a shared-infra failure on an auth route is the *same incident* as the same failure elsewhere — OBS-R131's "ordinary" is preserved; the `zone_context` column carries the residue without splitting the group or minting an auth-path-only incident stream.
- **MUST — anti-inflation on every funnel (RT-14):** the provider rule (one event per **exhausted** call, OBS-R018) gets its job-funnel analogue: the Hatchet task binding records `attempt_index` (`retries: engineRetries` verified at `apps/runner/src/index.ts:2504-2506`) and the incident fold treats retries of one work item as **one work unit**. **Fingerprint maturity (E6-12) counts distinct originating work units** — distinct `work_item_ref`/`run_ref` after cross-source merge — never raw occurrence rows. A single flaky item retried N times, ingested from both sources, contributes exactly 1 to maturity.
- **MUST** — one real-world failure = one incident across layers (OBS-R024) and across sources (`obs.source_link`, E6-16, D.5).

### A.5 CAPTURE_GAP + authority: fail-CLOSED by construction (R-E6-13, OBS-R057/R058; RT-04/RT-02/RT-23)

Backpressure ladder, ordered, hysteresis: **full envelope → minimal occurrence → local spool → counted gap** (OBS-R057). Product requests never wait; the product fails open. The **authority** direction:

- **MUST — positive proof, not absence (RT-04):** fix-agent write authority exists **only while ALL of** the following hold, evaluated by the daemon before AND during every mutation (RT-23): (1) the `KILL` file is absent; (2) a positive **`ARMED` token** exists and is fresh; (3) a **proof-of-capture-health artifact** exists, is signed by the daemon, and is younger than `obs.authorityProofStalenessMs`. The daemon refreshes the proof only after an end-to-end check passes: a synthetic canary occurrence round-trips to `obs`, the spool is writable, no `obs.capture_gap` row is open, required heartbeats are fresh, and the watchdog's latest witnessed chain heads (A.2) verify. **Any failure to refresh — full disk, dead flusher, DB down, crashed process — removes authority by default. Absence and staleness always mean TRIP, never health.**
- **MUST — gap accounting honesty:** the in-memory gap counter flushes as one bounded `obs.capture_gap` row when a sink returns; because the counter itself can die with the process, its loss is covered by the proof mechanism above (no refresh ⇒ no authority), and every gap row is a high-severity incident (DIV-12 mitigation).
- **MUST — exit-path physics (RT-02):** the spool is written with `fs.writeSync` on a **pre-opened fd** and is the only sink reachable from `process.on('exit')` (Node exit handlers are synchronous-only); the "bounded flush deadline" applies to signal paths (`SIGTERM`/`SIGINT`), not `exit`. **SIGKILL / OOM / power-loss is an acknowledged uncapturable class** whose only witness is the external liveness owner (B.2 process row); G1's acceptance states this rather than claiming losslessness (OBS-R058).
- **MUST — storage placement (RT-16):** spool, `KILL`, `ARMED`, proof artifact, chain key files and the witness log live on a **different volume than the Postgres data directory**, so the shared-failure-domain event (Postgres container/disk death) leaves the trip machinery standing. Verified in G1 chaos.

### A.6 Human-only detail channel — structured only, no free text (Batch-3 row 6; FID-08; RT-07)

`obs.occurrence_detail` is **first-party only** and holds ONLY: the structured normalized frame list (post zone-scrub, E.3), cause-chain codes, and the typed template parameters (enumerated fields per A.3). **It stores NO free-text message remnant — V's Batch-3 row 6 ruling drops the remnant entirely.** The OBS-R048 exception the approved plan put to V is **REMOVED, not bounded**: every stored field in every obs table is allowlist-gated; the denylist-bounded surface no longer exists; OBS-R050's SHOULD (a raw-detail field) is ruled OUT by V (ruling > OBS row precedence). Nothing machine-side ever read it; human RCA works from code + safe template + typed parameters + frames + cause codes. Containment stays mechanical and unchanged: separate table; the listener's **real connection** has no grant on it (A.7/RT-28 — defense in depth even with no free text); **never written for zone-context occurrences** (RT-07); **Hatchet log text never enters obs at all** — Hatchet ingestion stores structured fields only, and a human who needs raw Hatchet logs reads them in Hatchet's own dashboard by run id (D.5, FID-08).

### A.7 Write path, roles, redaction law, self-observation of the store

- **MUST** — async write path on a dedicated least-privilege pool, never in a product transaction (OBS-R040); `emit()` enqueues (bounded queue), background flusher batch-inserts; Postgres → spool → gap ladder (OBS-R041/R057).
- **MUST — redaction before every durable sink (OBS-R046 restored; OBS-R047; OBS-R048; REG-01):** redaction is **allowlist-based** (OBS-R048 — unknown fields rejected, event degraded to a minimal fixed-code form with `fallback_minimized` set), runs in **one place** (the single shared redactor invoked by the flusher), and **precedes EVERY durable-sink write — Postgres and spool alike**. The bounded in-memory queue holds only process-local references/handles (IC-2) and is **never persisted**: a crash loses its contents to gap accounting (A.5), never to a sink. The spool accepts **only post-redaction envelopes** (OBS-R041). **No pre-redaction bytes are ever durably stored.** A write path that bypasses the redactor is a defect of the observability layer and is always-escalate (OBS-R046's clause, carried verbatim). The **never-store list is OBS-R047's, verbatim** — debate/question/claim/answer text · private prompts · provider request/response/raw artifacts · parse text derived from raw content · secrets, keys, passwords, tokens, cookies, authorization headers · email/phone/IP/user-agent · absolute local paths · environment values · arbitrary request bodies/headers/query strings · serialized unknown objects — carried as the redactor's canary-test corpus behind the allowlist (the allowlist is the boundary; R047's enumeration is what the canaries fire at). Post-row-6 there is additionally no free-text column for any of it to land in (A.3).
- **Argued MUST deviation (REG-01, as the precedence rule requires):** OBS-R046 says "capture-time, synchronous". This design runs the redactor at **flusher-time**, not on the capturing thread. Why the deviation is lawful: RT-08's equal-work rule forbids any branch-dependent work — classification, stack parsing, redaction, counter arithmetic — on the zone request path, and OBS-R056 forbids synchronous work on every product hot path; a capture-time synchronous redactor would violate both. The protective substance of OBS-R046 — one redactor, before ANY sink, allowlist posture, bypass-is-a-defect — is preserved verbatim; only the thread moves. The pre-redaction window exists solely in process memory, unreachable by any sink except through the redactor; G1's crash-during-flush chaos case verifies that window's loss is counted (gap), never leaked.
- **MUST — roles are LOGIN, containment is tested against real connections (RT-28):** `debateai_obs_writer`, `debateai_obs_listener`, `debateai_obs_watchdog`, `debateai_obs_human` are created **LOGIN with distinct credentials**; each component gets its own connection string (`OBS_WRITER_DATABASE_URL`, `OBS_LISTENER_DATABASE_URL`, `OBS_WATCHDOG_DATABASE_URL`); grants: writer INSERT-only on capture surfaces; listener SELECT on machine-safe tables (**no grant on `occurrence_detail`, none on `identity.*`, none on raw `core.run`**) + INSERT on delivery/trace/agent_action/policy_decision/budget_usage + narrow UPDATE on cursor/incident/component_health; human SELECT all; **no role holds DELETE** (OBS-R043/R045). Acceptance tests connect **as the listener's actual connection string** and assert permission denial on `occurrence_detail`, `identity.*`, `core.run.question_line/asker_id/session_id`; a further test asserts no obs component's connection string equals the product's. The round-0 `NOLOGIN` idiom (`migrations/0000_s00.sql:290-296`) is thereby extended, not merely copied — nothing in-tree assumes those roles today (every process connects as compose superuser `debateai`), which is precisely the vacuity being closed.
- **MUST** — listener joins to product data go through obs-owned column-safe views (`obs.run_correlation_v`: `run_id, created_at_seq, register_version, battery_version, risk_tier` — never `question_line/asker_id/session_id`) (E6-08, R-E4).
- **MUST** — listener-serving indexes incl. the UNIQUE ingest key, with plans-at-10× as gate evidence (OBS-R042).
- **MUST** — DB-failure capture is non-recursive (OBS-R019/R059): `DATABASE_*`-class failures bypass the DB sink (straight to spool + health counters); `createPool`'s `console.error` (`packages/db/src/index.ts:69-72`, re-verified) rebinds to this channel.
- **MUST — privacy canaries at full ruled scope (OBS-R054 restored):** canary tests cover **secrets in keys, values, messages, stacks, causes, URLs and provider output**, plus identity-shaped canaries (R-E4) and the no-free-text-column schema assertion (row 6). Every capture records `redaction_policy_version`, `allowlist_set_id`, `fallback_minimized` (A.3).

---

## B. Capture layer (`@debateai/obs-capture`)

### B.1 Core (topology-neutral)

Exports: `emit(envelope)` (total, non-throwing, no sync I/O on the product path — OBS-R055/R056); `captureHandled(error, ctx)`; `runWithObsContext(fields, fn)` over `AsyncLocalStorage` (precedent `packages/db/src/index.ts:2,8`; OBS-R035) — the context carries run/work-item/node refs, the zone flag, **and the last `at_seq` value this request/job has already observed** (C.4/RT-40); **side-effecting installer modules** `@debateai/obs-capture/install/<runtime>` (RT-01); the redactor; the zone classifier (§E). Third-party throws are captured at the nearest owned boundary — **no monkey-patching of dependency internals** (OBS-R026, FID-17). Subprocess stderr is captured bounded + redacted, never drained (OBS-R027).

- **MUST — IC-1, installers are import-light (Lens B RT-01 constraint):** each `install/<runtime>` module may import **Node built-ins only** at module-evaluation time; obs core, the DB pool, register readers and crypto are **lazily imported on first `emit()`/flush**. Otherwise a transitive `@debateai/db`/`register`/`crypto` import would evaluate — and could throw — *inside the installer's own import subtree, before any handler registers*, reproducing the silent boot-death the install-first pattern exists to close. Enforced by (i) an **import-graph test** over the installer subtree failing on any module-eval-reachable workspace or third-party import, and (ii) a G1 fixture that makes `@debateai/db` throw at import and asserts the process handlers were already installed and the throw was captured to the spool. The external witness (launchd + presence detector, B.2/H.2) remains the independent backstop.
- **MUST — IC-2, enqueue holds a reference (Lens B RT-08 constraint):** `emit()`'s queue entry is an **object reference/handle** (the Error reference + context snapshot pointer) — **no serialization, stringification, stack walk or byte copy happens on the calling thread, on any path, zone or not**. All serialization happens on the flusher. The approved plan's "pre-serialized error reference" wording is corrected here — pre-serialization on the request path is exactly the branch-dependent cost the G1 zone timing test exists to fail.

### B.2 Funnel bindings — exact attach points (verified at C4)

| Runtime | Attach point (evidence) | Binding behaviour |
|---|---|---|
| every process | **zero `process.on(` handlers exist in-tree** (re-verified at C4: count 0 across `apps/*/src`, `packages/*/src`); ESM evaluates the whole import graph before any `main.ts` statement | **MUST (RT-01):** handler installation is a **module-evaluation side effect** — `import "@debateai/obs-capture/install/<runtime>"` is the FIRST import of each root module (`apps/api/src/main.ts`, `apps/runner/src/main.ts`, `apps/scheduler/src/cli.ts`), so uncaught/unhandled capture is registered before `@debateai/db`/`register`/`crypto` module bodies can throw (the scheduler's top-level command throw at `apps/scheduler/src/cli.ts:5-8` included; re-verified present). Installer is import-light per IC-1. Lifecycle events: start, ready, signals, exit code (OBS-R014/R015). **"Never-started" is witnessed from OUTSIDE the process (RT-01):** launchd `KeepAlive` per long-lived runtime (§H.2) plus the daemon's expected-process presence detector (manifest of expected runtimes vs observed start receipts/heartbeats). SIGKILL/OOM class: A.5. |
| api (http) | `buildApi` error handler `apps/api/src/index.ts:158-191` incl. stream-abort branch; `logger: false` at `:143` | capture before reply on every branch (OBS-R016); 500-class responses stop echoing `message`, return correlation id (OBS-R053) |
| runner (job) | Hatchet task catch `apps/runner/src/index.ts:2494-2526`; task declared with `retries: engineRetries` (`:2504-2506`) | capture **before** `recordTerminalFailure` (OBS-R017); ambient context seeded from dispatch input; `attempt_index` recorded so retries fold into one work unit (RT-14/A.4) |
| provider | gateway call loop `packages/providers/src/index.ts:195-290`; `createPostgresProviderGateway` `apps/runner/src/index.ts:2528-2559` | one event per **exhausted** call (OBS-R018); per-attempt artifacts referenced as evidence, never duplicated (OBS-R024) |
| db | pool/query wrappers `packages/db/src/index.ts:14-77` (re-verified: `typedPoolFailure` interpolates upstream text — C.1's first offender; `typedQueryFailure` passes non-objects through unwrapped — the stack-less class E.3 row 6 counts) | non-recursive channel (A.7); pool-failure family is shared-infra by definition (§E) |
| scheduler (one-shot) | `apps/scheduler/src/cli.ts` (three commands, re-verified) | **MUST (FID-03, OBS-R005):** each job run emits a **job-lifecycle occurrence family** — `scheduled(next_due)` / `started` / `succeeded|failed|noop` — where **a no-op is lawful only with its input count recorded** (e.g. liveness-sweep: versions scanned, rows considered, rows archived), so a job that silently skips 40 items is falsifiable. Plus wrap-and-flush-with-deadline before exit (OBS-R014) and one-shot health semantics: a **start/finish receipt pair** — a start receipt without a finish receipt past the job's deadline is the failure signal (RT-05); freshness bounds apply only to long-lived runtimes. |
| evaluator | exported-function boundary of `apps/evaluator-worker/src/index.ts`; dispatch binding structurally `UNBOUND` (`packages/evaluator/src/dispatch-binding.ts:6-11`, re-verified literal type) | library-boundary wrapper only (E6-05) |
| ui client (R-E6-10) | one seam (OBS-R020): new `app/global-error.tsx` + `app/error.tsx` (re-verified: neither exists), `window.onerror`/`unhandledrejection` bootstrap, existing `ScoringErrorBoundary` (`apps/ui/components/ScoringErrorBoundary.tsx`, exists) rewired through the same reporter | **MUST (RT-19a-d, FID-16):** `POST /v1/obs/client-report` accepts **only server-side closed enumerations** for `code/component/route_template/kind` — any unrecognized value is **rejected, not stored**; `build_ref` is **server-assigned from the served bundle**, never client-supplied; occurrences carry `source=ui_client` and are **structurally ineligible for fingerprint maturity, tier eligibility, and every fix path — report-and-count only** until a separate V ruling opens them (§K row 12); rate limiting is shared-state where replicas>1 and keyed on a **transient network-origin hash** (in-memory salt, rotated on restart, never persisted — nothing user-linked enters obs, R-E4); **rate-limited rejections increment a counted client-drop class in `obs.capture_gap`** — never a silent drop (OBS-R057). Free text never leaves the browser. Threat evidence: `resolveSession` is sha256 of any header string (`apps/api/src/index.ts:129-140`, re-verified) — it authenticates nothing, so nothing downstream may treat client reports as trusted. |
| detectors ("does not work") | `core.work_item.state/claim_deadline`; READY age; progress delta via `at_seq`; scheduler cadence; **suspicious-success** signals | daemon-hosted read-only sweeps emitting detector occurrences (OBS-R002/R004): claim-deadline breach, oldest-READY age, missing heartbeat, no-progress delta, WAIT age, cooldown overdue, provider/parse burst, cadence expected-vs-observed, listener cursor lag, **plus the OBS-R012 classes `empty_output` / `missing_required_fields` / `missing_artifact_chain` as first-class `SUSPICIOUS_SUCCESS` detectors (FID-02)**, plus expected-process presence (RT-01) and the `unclassified` counter watch (RT-09). Reaper stays out of scope (OBS-R006; scaffold re-verified at `apps/scheduler/src/index.ts:87-89`) — alert-fatigue consequence handled by incident-level dedup + acknowledged-state muting; build-or-park goes to V (§K row 15). |

- **MUST** — funnels are transport, not coverage (DIV-01, OBS-R021): `captureHandled` at the enumerated catch-and-transform sites, list materialized from the generated inventory; CI inventory gate `tools/obs-inventory` in root `lint` fails on new unclassified throw / bare catch / discarded promise / cause-losing wrapper (OBS-R022). Raw-`throw` lint stays SHOULD (OBS-R023). Fire-and-forget via supervised helper (OBS-R066); swallowed errors carry the captured event id (OBS-R065); subprocess stderr bounded + redacted (OBS-R027).

### B.3 Overhead + failure-isolation budget

- **MUST** — every bound is a register row with provenance (`register.register_row`; reader idiom `packages/register/src/index.ts:74-133`), calibrated in G1 (OBS-R044, DIV-11): `obs.emitP99CeilingMs` · `obs.captureQueueMax` · `obs.envelopeMaxBytes` · `obs.frameMax` · `obs.causeDepthMax` · `obs.shedThresholdPct` · `obs.zoneFlushIntervalMs` · `obs.authorityProofStalenessMs` (A.5) · **`obs.fingerprintMaturityN`** (seed: Grok's E6-12 proposal N=3, FATAL→1 — seed only) · **`obs.blastRadiusMaxReachable`** (no seed exists — **G5 stays closed until V rates it, fail-closed**) (RT-31) · **`obs.canaryWindowMs`** (Batch-3 row 13 window; no seed — V's, §K row 1) · `obs.lineageDepthMax` (RT-24) · `obs.skewToleranceMs` (split-clock-ratified only, RT-15) · plus D-side caps (D.7). Codex/Grok figures remain calibration seeds only; no number in this plan is ratified.
- **MUST** — layer disableable at runtime via auditable register row (OBS-R060); no boot-required dependency (OBS-R056).
- Observed by: health counters (fixed-code, circuit-broken — OBS-R059), per-runtime health receipts (RT-05 semantics), watchdog scrape, G1 chaos (OBS-R061).

---

## C. Traceability

### C.1 Cause-chain retrofit

- **MUST** — `TypedDomainError` gains `options?: { cause?: unknown }` → `super(message, options)` (OBS-R062; re-verified causeless at `packages/kernel/src/index.ts:283-288`). Wrap sites pass `cause` and never interpolate upstream text (OBS-R063); a handler that cannot record still propagates the original error — re-throw never replaces (OBS-R064); first offender `typedPoolFailure` (`packages/db/src/index.ts:14-18`, re-verified interpolating) reworked to fixed template + cause; the repair-packet interpolation (`apps/runner/src/index.ts:883-890`, re-verified live) replaced by stable-code + safe-template (OBS-R049/R102). Note: wrappers re-root stacks — which is why the zone classifier walks the **whole cause chain**, not one stack (E.3/RT-10).
- **MUST** — error identity independent of message text; async joins preserve all rejections (OBS-R067).

### C.2 Correlation

Ambient context (B.1) seeded at funnels (OBS-R035); cross-process linkage via ids already threaded: `additionalMetadata { v3RunId, v3WorkItemId, sourceOfRecord }` (`apps/api/src/index.ts:363-380`, re-verified) — the OBS-R140 join keys.

### C.3 The mechanical trace procedure (deterministic, LLM-free — OBS-R068)

1. Load occurrence; record `capture_status` qualification if not `PERSISTED` (OBS-R039).
2. Cause walk with visited set + `obs.causeDepthMax`; anomalies emit `CAUSE_CYCLE`/`CAUSE_GAP`/`CAUSE_DEPTH_EXCEEDED` evidence (OBS-R069).
3. Zone check **across every stack in the chain** (RT-10): manifest hit ⇒ terminal `ZONE_BOUNDARY` (OBS-R133).
4. Lineage joins, each indexed and bounded (OBS-R070); cross-run / future-sequence / build-mismatch ⇒ `CORRUPT_LINEAGE` evidence (OBS-R071).
5. Root = earliest evidenced condition whose absence would have prevented the failure, at the lowest responsibly-controllable boundary (OBS-R072).
6. Terminal verdict from the closed vocabulary: `CODE_ROOT · EXTERNAL_ROOT · POLICY_ROOT · ZONE_BOUNDARY · CAPTURE_GAP_BOUNDARY · REPLAY_UNSUPPORTED · INSUFFICIENT_EVIDENCE` (OBS-R073/R074/R076/R025 — external and policy roots are never fix targets; `apps/replay` is never extended for tracing).
7. Persist verdict + evidence + visited path + queries + manifest versions to `obs.trace`, **then** ack (OBS-R075/R080).
8. Bounded retries on transient store failure; deterministic poison → dead-letter + human (OBS-R077).

Termination: finite hop cap, indexed bounded joins, closed vocabulary, no unbounded retry. **What makes G2's acceptance non-vacuous is in §G (RT-33): a human-labelled sample with a ruled agreement rate and an `INSUFFICIENT_EVIDENCE` ceiling** — a tracer that always answers "don't know" fails the gate.

### C.4 `at_seq` watermark — U-11 closed on a specified mechanism (RT-40, FID-17)

Verified: `core.run_progress_event` has `at_seq` only, no timestamp (`migrations/0000_s00.sql:68-75`, re-verified). **The ambient context carries the last `at_seq` this request/job has already observed in the course of its own work** (the runner reads/writes progress rows while executing a work item; the api's SSE path streams them) — the watermark is **copied from context, never queried**: no `SELECT max(at_seq)` on the error path, no read of `ledger.sequence_allocator` (one locked row, `migrations/0000_s00.sql:9-29`), no sync I/O in `emit()` (OBS-R056). Field is **three-state** like its siblings (OBS-R034): value | `NOT_APPLICABLE` (flow never observed a sequenced event) | `UNKNOWN:<reason>` (context lost). No retroactive wall-clock is ever synthesized; correlation to pre-store events is a "no later than" ordering join. **U-11 CLOSED on this mechanism.**

### C.5 Remediation order

SHOULD (OBS-R078): boundary capture → cause preservation → correlation propagation → eliminate verbatim error-into-prompt paths → static enforcement.

---

## D. Listener (`tools/obs-listener/`)

### D.1 Process shape (R-E3; OBS-R087)

Four pieces outside the reachability walk (OBS-R125; roots per `acceptance/README.md:1-9`; the orphan audit's known-non-product set gains `tools/obs-listener/`):

1. **obs-daemon** — deterministic, non-LLM, permanent: dual-source intake, incident folding + dedup, detector sweeps, tier gate, notification, approval wait, worker spawn, caps, authority-proof refresh (A.5), canary-window bookkeeping (D.4). Zero model calls at idle (OBS-R089). **Backlog order: highest severity first, oldest-within-severity second; concurrency capped; poison cannot block the cursor** (OBS-R083 — FID-13).
2. **codex-worker (diagnosis)** — ephemeral Codex CLI spawn per eligible incident, fresh session, never resumed (OBS-R087); read-only: no network beyond the CLI's own relay, no credentials, no subagents, fixed tool/query allowlist, bounded paths (OBS-R088); spawn law per `acceptance/relay-core.ts:1-60` precedent (typed loud failures, deadline kill, bounded redacted stdio — OBS-R027); usage telemetry or fail-closed to report-only (OBS-R089).
3. **watchdog** — separate deterministic process: daemon heartbeat, cursor lag, leases, **audit-chain continuity (keyed links + witness log, A.2/IC-4)**, spend counters, policy hash (OBS-R086); can trip, can never modify code; mutual heartbeat with the daemon; host keepalive via launchd.
4. **obsctl** — human CLI: `status`, `kill`, `arm`, `approve` (which **emits the kanban tickets under V's identity** — D.3/RT-20), `deny`, `reveal-drift` (E.5). No LLM anywhere in it.

**MUST (FID-15, OBS-R090):** model access runs under the **DR-179** no-API-keys hold — local authenticated CLI only; **lifting the hold changes the adapter behind the same seam and SHALL NOT expand fix authority** — a DR-179 lift re-opens nothing in §D.4/§D.7. Placement is a config seam (OBS-R091): Postgres URLs (per-role, A.7), Hatchet API URL/token, CLI binary path, worktree path, spool/proof/key paths — V's Mac today, `dezbatere.ro` later.

### D.2 Transport: durable rows first (OBS-R079/R082/R083)

Durable truth = `obs.occurrence`; ack per **occurrence** (`obs.delivery` + cursor), diagnosis/spend/fix per **incident** (OBS-R081, DIV-05); batch acks by `occ_seq` range per fingerprint. `LISTEN/NOTIFY` carries `occ_seq` as wake hint only; startup/reconnect = LISTEN, reconcile cursor, process (OBS-R082). **U-07 stays CLOSED:** LISTEN on a dedicated direct session-mode connection (`OBS_LISTEN_DATABASE_URL`); re-verified no pooler in `compose.dev.yaml`; NOTIFY loss degrades to poll latency only.

### D.3 Severe-error workflow (R-E6-09) and the approval pipeline

**The R-E6-09 pipeline serves EVERY above-QUICK proposal (FID-06):** record → research (read-only diagnosis worker) → structured **FixProposal** (fixed template, validated ids/codes only — no raw text, no LLM prose; OBS-R103/R114) persisted to `obs.agent_action` → **notification to V through §F with an approval handle, regardless of severity** — `obs.severeThreshold` (over the A.3 ladder; seed `≥ SEVERE`, §K row 8) governs **urgency class and routing only**, never whether V is asked. With the QUICK allowlist starting empty (E6-03), the modal incident is above-QUICK and below-severe; it notifies at routine urgency and waits. R-BIGGER is therefore reachable for its whole population.

→ **approval:** `obsctl approve <proposal-id>` binds the proposal **content hash**; the daemon proceeds only while stored hash == approved hash (mirrors OBS-R116).
→ **kanban tickets — created by `obsctl approve`, under V's identity, never by the daemon (RT-20):** OBS-R127 ("the listener SHALL NOT create tickets, mutate the board") holds **unamended** at every point, pre- and post-approval; R-E6-09 names no actor, and the strictly-safer reading — the human's approval command emits the tickets — satisfies its sequence verbatim. Mechanics per wayfinder T05: `hermes kanban --board observability-loop <action>`, ids `t_*`, `link parent child`; **MUST:** every board write asserts the board id by read-back before and after, refusing on mismatch — T05 records the global current-board pointer parked on the sibling docker-hatchet mission, so an unflagged write lands in another live mission's board.
→ **fix loop starts** (D.4/D.6).

**MUST — the board is inside the injection wall (RT-21):** ticket titles and bodies are rendered **exclusively** from a fixed template over server-minted enumerations and ids (incident id, fingerprint prefix, severity, tier, count, verdict code). No free-form field from any occurrence — first-party, Hatchet, or client — may reach board text, notification text, or any surface read by other agents (Hermes dashboard 9119, sibling orchestrators). The board and the notification channel are named members of the OBS-R102 wall, and both are targets in G3's injection corpus (§G).

### D.4 Tiers (R-E1/R-E2/R-BIGGER; OBS-R092-R110)

**MUST — the spine §9 floor, verbatim, dominating everything (FID-01, OBS-R093):** *a one-line change to security, auth, persistence, migrations, spend, scoring semantics, live data, destructive git, architecture, protocol docs or board state is ESCALATE* — this list dominates every size threshold, every tier decision, and **every allowlist entry, present or future**. Per **E6-11**, "scoring semantics" is defined precisely as **arithmetic + served-number writers only** — that definition is the operative floor-clearance test for UI copy/CSS QUICK eligibility.

**MUST — the floor is enforced as paths, not categories (RT-29):** the policy bundle (G0) carries the floor as an **enumerated path/glob deny list**, and QUICK eligibility requires the changed path to match the **allowlist glob set — deny-by-default on path**. Enumerated ESCALATE regardless of line count: the security zone manifest paths · `migrations/**` · `packages/crypto/**` · scoring arithmetic + served-number writers (E6-11 set, enumerated in the bundle) · spend/budget config · **any dependency or manifest declaration (`package.json`, `pnpm-lock.yaml`, workspace files)** · **any register/bootstrap seed data file** · **any compose/env/CI/deploy file (`compose.dev.yaml`, `deploy/**`, env loaders, root scripts)** · **anything under `tools/`** (includes the CI inventory gate and the listener itself) · protocol/spine docs · board state · the obs policy bundle, zone manifest, chain/proof key paths, and obs' own code (OBS-R104). **"Production file" is defined enumeratively:** a file matching the reviewable-product-source allowlist globs (`apps/*/src/**`, `packages/*/src/**`, `apps/ui/{app,components,lib}/**`) minus the deny list. OBS-R105 note: editing an *existing* register seed file is a register-value change and sits in the deny list — the agent can neither invent nor edit ruled values.

- **QUICK (dormant until ROW-GIT; armed at G5):** R-E1 ratified shape — ≤1 production file + 1 test file, ~20 production-line cap (~50 with tests) "for the moment", subsystem allowlist **empty by default** (E6-03), RED→GREEN on a clean base SHA (OBS-R095/R096), per-fix auto-merged PR into `dev`, never `main` (R-E1/R-E2, OBS-R115), auto-merge only while head/base/policy hashes match approvals with fresh checks (OBS-R116), merge-only — no deploy/restart (E6-01, OBS-R120), one revertible commit (OBS-R118), one active mutation per repo and per fingerprint (OBS-R110), notification on every landing (OBS-R121). **MUST (RT-30):** the QUICK RED test must be **derived from an existing human-owned invariant** (an acceptance assertion, contract schema, or catalog-declared property — never freely authored); "the only new test asserts behaviour untraceable to a human-owned invariant" is a deterministic ESCALATE indicator.
- **RULED — QUICK review scoping (Batch-3 row 11, option a — FID-07 settled):** E6-04's "human + independent non-author-family reviewer" governs the PR-FIX and approval-first tiers. For QUICK, **"independent review" is satisfied by the automated policy gate (floor + allowlist, deterministic, input-hashed — OBS-R094) plus post-landing human visibility (OBS-R115/R121)**. QUICK keeps its no-approval property. The composition is no longer put to V — V confirmed the reading; §K row 11 is closed RULED.
- **Above QUICK = approval-FIRST (R-BIGGER):** approval object is the **proposal**; only after approval is the fix coded; the coded fix lands as a PR into `dev` under OBS-R117 human review/merge + E6-04. Notification path per D.3 — reachable at every severity (FID-06). §K row 9 carries the composition for confirmation.
- **ESCALATE:** OBS-R074/R126/R127/R128; architectural indicators deterministic, route to architecture intake (OBS-R126); ESCALATE produces a structured mission-intake candidate, never a board write by the daemon (OBS-R127).
- **Gate mechanics:** deterministic non-LLM policy gate, input-hashed (OBS-R094); blast radius **computed**, `obs.blastRadiusMaxReachable` bound (OBS-R098, RT-31, fail-closed); generated patches re-classified post-generation (OBS-R099); one root per fix (OBS-R100); test-integrity + human-owned command catalog (OBS-R101, mechanized by RT-30's invariant rule + the D.6 sandbox); injection walls (OBS-R102/R103); no self-modification — the enumerated OBS-R104 set includes the policy bundle, allowlist file, zone manifest, obsctl, the audit writer, and the chain/proof keys, by name; register values never invented or edited (OBS-R105 + deny list above); maturity gates fixing only, counted per A.4 (E6-12, RT-14); **fingerprint cooldown AND root-keyed cooldown (RT-17):** no fix authorized while the incident's trace root (file + symbol) matches the root of any incident with an active, recently-landed, or **UNVALIDATED** mutation, regardless of fingerprint or source; **lineage bound (RT-24):** an incident whose first occurrence post-dates a landing and whose trace root lies inside that landing's blast-radius set is attributed to it (`attributed_landing_ref`); more than `obs.lineageDepthMax` attributed incidents disables autonomous fixing for that lineage and escalates.
- **RULED — DEFERRED CANARY (Batch-3 row 13, option a — RT-25 collision settled by V; E6-01 stands unamended; OBS-R119 satisfied on deferred semantics):**
  1. **At auto-merge** the landing fact (`obs.agent_action` row `QUICK_LANDED`) carries `validation_state = UNVALIDATED`; the incident projection enters `FIXED_UNVALIDATED` (A.2). Merge deploys nothing (E6-01).
  2. **Freeze:** while any landing on a root is UNVALIDATED, the root-keyed cooldown holds — **the agent may not make further fixes to that same code** (root file+symbol, and its lineage) until a deploy confirms the first worked.
  3. **The canary window opens at the next natural deploy.** Deploy observation is deterministic: the first occurrence/heartbeat/receipt arriving with a `build_ref` whose commit **contains the landing's merge commit** (git ancestry check by the daemon's read-only git access). This requires real build identity and is therefore possible only post-ROW-GIT (which G4's standing gate guarantees before any QUICK exists); the interim `UNTRACKED-DEV` stamp can never open a window (RT-42).
  4. **Window:** `obs.canaryWindowMs` (register row, number V's — §K row 1) of observation on fix-bearing builds, watching the original fingerprint plus adjacent error/latency/test signals (OBS-R119).
  5. **Clean window** ⇒ append `CANARY_VALIDATED`; incident → `FIXED_VALIDATED`; root cooldown reverts to the time-based window (§K row 16).
  6. **Fingerprint recurs on a fix-bearing build** (or adjacent-signal breach per ruled rules) ⇒ **exactly ONE deterministic automatic revert PR lands — still merge-only, still into `dev`, under the same OBS-R115/R116 protections**; append `CANARY_REVERTED`; incident → REGRESSED; the auto-revert fires the E6-14 trip ⇒ mutation authority OFF; humans own recovery (OBS-R119's "exactly one").
  7. **If no deploy ever comes**, the landing stays UNVALIDATED and the root stays frozen indefinitely — fail-closed, lawful, and visible on the dashboard. Nothing here deploys anything.
  G5 certifies canary behaviour on these semantics (§G5); §K row 13 is closed RULED.

### D.5 DUAL-SOURCE: Hatchet read-back (U-01) — with the ruled fallback posture

Ground (re-verified at C4): Hatchet is the in-tree dispatcher (`@hatchet-dev/typescript-sdk@1.28.1` in `apps/{api,runner}`); nothing reads state back (`runNoWait`, `apps/api/src/index.ts:363-380`); hatchet-lite REST 8888 / gRPC 7077 (`compose.dev.yaml:19-20`); the pinned SDK ships `runs.get/list`, `logs.list`, `workers`, `metrics`, `crons` (`v1/client/features/*.d.ts`, present in the pnpm store).

- **MUST — the shared failure domain is named, not implied (RT-16):** hatchet-lite's database lives **on the same Postgres server** as `obs.*` (`deploy/postgres/init-hatchet.sql` = `CREATE DATABASE hatchet;`, re-verified). One Postgres death takes the primary sink AND the second source AND the DB-side gap writes. The pair is complementary for *error classes*, not for *infrastructure*; the survivors are the spool + proof artifacts on their separate volume (A.5), and the trip machinery stands on exactly those (RT-04). Stated in §J too.
- Ingest: poll `runs.list` (FAILED/CANCELLED, cursor window minus overlap) on `obs.hatchet.pollIntervalMs`; per failed task `logs.list` bounded — **structured fields only cross into obs** (status/kind/attempt/counts/join keys); **log text is never stored anywhere in obs** (FID-08; and post-row-6 there is no column it could land in) — a human reads raw logs in Hatchet's own dashboard by run id; read-only by construction; Hatchet never on the capture path (OBS-R141, OBS-R085); anti-corruption mapping (OBS-R142); floor severity on entry (A.3/OBS-R010).
- At-least-once via `obs.consumer_cursor(hatchet-ingest)` + overlap re-read, **idempotent by the UNIQUE `(source, source_event_ref)` constraint with `ON CONFLICT DO NOTHING`** (RT-13); Hatchet retention shorter than ours = counted `CAPTURE_GAP` on the hatchet source (OBS-R143).
- Cross-source merge (OBS-R139/R140, E6-16): evidence = `additionalMetadata.v3RunId/v3WorkItemId` matching `run_ref/work_item_ref` within skew tolerance + compatible class → `obs.source_link` (both retained, ours authoritative); unmatched stays two incidents — **and the root-keyed cooldown (D.4/RT-17) prevents the two-incidents case from becoming two fixes**.
- **U-18, sharpened (RT-15):** correlation never relies on wall-clock equality; both clocks stamped; skew measured continuously; **`obs.skewToleranceMs` may only be ratified from a split-clock measurement** (two hosts/containers, deliberately stepped clocks) — today's compose shares one host clock and would calibrate a fiction; drift-beyond-tolerance is a **trip-eligible signal**, not just a self-event.
- **SPIKE-D1 (bounded; exit criteria + kill criteria, RT-18/RT-39):** half a day, read-only, at G2 entry, against the dev stack. Must answer: retention window · `runs.list` pagination bounds · **read-scope token obtainability** (compose provisions only a worker credential — `HATCHET_CLIENT_TOKEN`, `apps/runner/src/main.ts:18-22`, re-verified; no read token exists today) · backlog/heartbeat semantics · **attempt-identity stability and `runId` disambiguation** (Hatchet task-run id vs our `v3RunId`; the `hatchet:<runId>:<attempt>` idempotency key and the UNIQUE constraint's columns are contingent on this answer). **Kill criteria:** retention < poll floor, pagination cannot bound a backlog, or no read-scope token obtainable.
- **RULED — fallback posture (Batch-3 row 14, option b — RT-39 settled by V):** on any kill-criterion hit, **dual-source is NOT narrowed silently and OBS-R137/R138 are NOT re-scoped by this mission**. Instead: (1) the listener ships **first-party-only as an EXPLICIT DEFERRAL**, recorded in the policy bundle as `hatchet_ingest: DEFERRED_TO_MISSION` — auditable, visible on the dashboard, changeable only by re-pin; (2) **wiring Hatchet read-back becomes its OWN scoped new mission**: SPIKE-D1's exit report includes a structured mission-intake candidate (OBS-R126/R127 shape) citing OBS-R137/R138 and the motivating gap — **worker-crash-before-flush loses its second witness (RT-02 class)** — routed to V through standard intake, never self-fired and never quietly dropped; (3) until that mission lands, every G2/G3 acceptance statement quantifies over **first-party sources only, saying so explicitly** — no acceptance text may claim all-source coverage while the deferral holds; (4) the cross-source machinery (source_link, skew monitor, merge rules) ships **dormant behind the same bundle flag**, not deleted, so the new mission wires a source, not a redesign. The uncovered class is tracked as the new mission's motivating gap — never accepted as a permanent hole. §K row 14 is closed RULED; decision executes at SPIKE-D1 exit, never discovered at G3.

### D.6 Fix execution surface — sandboxed, or G4 does not open (RT-22 + IC-3)

- **MUST:** the **fix worker** (distinct from the diagnosis worker) runs under a **separate OS user** with **NO ACCESS — read, write, create, traverse or stat (Lens B's RT-22 hardening: not merely "no read access")** — to: custodian tokens, the `KILL`/`ARMED`/proof paths, the chain/proof key files and witness log, the policy bundle originals, the zone manifest, and any git credential. Enforced by OS ownership + 0700 directories on the daemon/watchdog users' paths + the sandbox profile denying traversal. **Its only output is a patch file.** The daemon — a different process under a different user — validates the patch (path-glob gate, floor list, re-classification per OBS-R099), applies it in its own workspace, runs the human-owned test catalog **inside the same restricted sandbox with no network**, and is the only process that pushes, under the dedicated signed bot identity (OBS-R113). The agent-authored RED test therefore executes with no path from its process to the switches it would need to defeat (dual control, kill, OBS-R104 all survive an adversarial test file). Policy/manifest hash checks are performed by the daemon's process tree, never the worker's.
- **MUST:** clean baseline + pinned base SHA per attempt (OBS-R112); reserved branch namespace from validated hashes (OBS-R113); machine-parseable PR template with RED/GREEN evidence + revert command + canary window fields, no raw error text (OBS-R114/R103).
- **MUST — G4 entry fixture extended (IC-3):** the named sandbox verification now includes **write/forge attempts, not only reads**: an adversarial fixture test file attempts (a) reads of tokens/`KILL`/`ARMED`/proof/bundle/keys, (b) **writes/forges** — minting a fake `ARMED` token, overwriting/planting a proof artifact, planting git credentials, minting a fake policy bundle — and (c) network egress. All must be provably contained, AND any artifact it somehow plants must be **detectably invalid** (the daemon-signed proof and keyed chain make forged artifacts fail verification — the signed-proof conjunction is what the fixture demonstrates). All impossible before ROW-GIT (standing gate).

### D.7 Kill switch, caps, trips

- **Kill switch (OBS-R106, E6-02; RT-23):** `KILL` file (either custodian; `obsctl kill`) + **positive `ARMED` token** + proof artifact per A.5 — authority is the **conjunction**; any filesystem/process failure disarms by absence (ENOSPC can no longer preserve authority — it starves the proof). **Polled throughout every worker lifetime, not only pre-spawn:** on trip mid-flight the daemon revokes the worker's lease, withholds the push (the worker never had the credential — D.6), and kills the worker process group. Mutation defaults OFF after supervisor restart.
- **Custody and the meaning of "expansion" (E6-02; RT-32):** either custodian can kill; **expansion requires both custodians' distinct tokens — and "expansion" covers re-arming after a trip, any growth of the QUICK allowlist or authority surface, AND chain/proof key provisioning or rotation (IC-4).** Allowlist growth is executed only by re-pinning the policy bundle through `obsctl` with both tokens + a recorded evidence packet (OBS-R097), is audited to `obs.agent_action`, and the allowlist file is in the OBS-R104 forbidden set by name. No agent path can touch it.
- **Caps (OBS-R107, R-E3):** supervisor-enforced register rows: `obs.listener.callsPerDay`, `wallClockPerDiagnosisMs`, `maxConcurrentDiagnoses`, fix-rate caps; numbers at activation.
- **Auto-trip OR-list (E6-14, R-E6-13, OBS-R106/R119; RT-26):** forbidden-path touch (per the D.4 deny list) · **audit-chain break or non-verifying link (A.2 keyed definition)** · **auto-revert fired (deferred-canary semantics, D.4)** · rejected-verdict-rate breach · open capture gap / stale proof (A.5) · budget/rate breach · policy-hash mismatch · store/audit outage · **branch-protection failure — the protection ruleset is fetched and hashed in the pre-dispatch deterministic checks on EVERY dispatch; mismatch against the approved hash = trip** (not a one-time G4-entry check) · cross-source skew beyond tolerance (RT-15) · watchdog anomaly. All deterministic; numbers V's (§K row 2).

---

## E. Zone boundary (U-09) — final

### E.1 Rulings

R-E5: zone-origin errors leave an **anonymous daily counter only** — no codes, no payloads, no traces (R-E5 tightens OBS-R132's E5 options to the strictest shape; OBS-R132 is thereby superseded-settled). Shared-infra errors on auth routes stay fully captured, route reduced to `zone` (OBS-R131). No imports, no inspection inside the zone (OBS-R130/R134).

### E.2 Verified boundary geography (outside-only)

Zone mounts live outside the zone in `buildApi`: `/v1/auth/register|verify-email|resend-verification` calling `options.registration!.*` (`apps/api/src/index.ts:205-234`, re-verified at the mount lines only); service injected from `apps/api/src/main.ts`. Zone-owned reachable files include `apps/api/src/registration.ts`, `apps/api/src/mail-channel.ts`, `packages/db/src/identity.ts` (re-exported by shared db — `packages/db/src/index.ts:590-603`, re-verified) — which is why route-based classification fails and producing-module classification is required.

### E.3 Classifier — equal-work, chain-walking, six rows, scrubbed output

- **MUST — equal work on the request path (RT-08 + IC-2):** inside `zoneBoundary` context, the request-critical path performs **one fixed-cost operation identical on every branch**: enqueue of an opaque **reference/handle** (the Error object reference + context snapshot pointer — **no serialization of any kind on-path**; IC-2 corrects the approved plan's "pre-serialized" wording, which named exactly the branch-dependent cost this rule forbids) — **no classification, no stack parsing, no manifest matching, no redaction, no counter arithmetic happens before the response is written**. All classification and all serialization run on the flusher, off-path. The zone's own pacing discipline (`apps/api/src/registration.ts:429,527,566,594,621,657` — S3b/S3c "equal work", commit `cff3dd5`; citation carried from the approved plan, zone not re-read) is not degraded by capture: **G1 acceptance includes a timing test comparing zone-branch response-time distributions capture-on vs capture-off, failing on any statistically resolvable delta** (sample size V's per OBS-R123).
- **MUST — Factor 2 walks the whole cause chain (RT-10):** wrappers re-root stacks (`typedPoolFailure` constructs its error at `packages/db/src/index.ts:17`, so the innermost frame of the *outer* error is always `index.ts`). The classifier walks to the **deepest stack in the cause chain** (bounded by `obs.causeDepthMax`); if ANY stack in the chain has a manifest-matching innermost repo frame, the outcome is ZONE; the producing frame for SHARED outcomes is the innermost repo frame of the deepest stack.
- **MUST — anchored prefix matching (RT-11):** matching is **repo-root-relative anchored PREFIX** match on normalized paths; any frame under `node_modules/` or without a repo-root prefix is excluded from matching; compiled shapes are an **explicit alternate prefix list** (e.g. `dist/…`), never a suffix relaxation. Manifest-reality tests plant a decoy `identity.ts` outside the zone and assert non-match.
- **Decision table — six rows (RT-09; uncertainty defaults to excluded ONLY under zone context):**

| zoneBoundary ctx | deepest-chain frame evidence | Classification |
|---|---|---|
| set | manifest hit (any stack in chain) | **ZONE** → counter only (E.4) |
| set | repo frame, not in manifest | **SHARED** → full capture, route = `zone`, **frames scrubbed (below)** |
| set | no usable repo frame | **ZONE** (default-excluded — OBS-R134) |
| unset | manifest hit | **ZONE** + anonymized drift signal (below) |
| unset | repo frame, not in manifest | ordinary capture |
| **unset** | **no usable repo frame** | **`ORIGIN_UNKNOWN` → captured** with `component = UNKNOWN:<reason>`, counted in a dedicated **`unclassified`** gap class that is **trip-eligible** — never `zone_daily`, never discarded. Covers `throw "string"`/non-Error values (which `packages/db/src/index.ts:20-37` passes through unwrapped — re-verified), stackTraceLimit-truncated stacks, and structured-clone boundaries. |

- **MUST — zone frames never survive in ANY stored occurrence (RT-07, FID-10):** before any sink (occurrence, detail, trace evidence, PR bodies — everything), every frame matching the manifest is **dropped and replaced by a single opaque `ZONE_FRAMES_ELIDED:<count>` token**, and the cause walk **terminates at the first zone-owned frame** with `CAUSE_NOT_CAPTURED:ZONE`. A SHARED capture on an auth route therefore carries its shared-code producing frame and nothing of the zone's call path — no `registration.ts:line`, ever, anywhere the listener, a human, or a PR can read (OBS-R133; the S3b enumeration oracle stays closed at trace granularity). `obs.occurrence_detail` is **never written** for zone-context occurrences (A.6).
- **MUST — the drift signal is as anonymous as the counter (RT-12, FID-10):** decision-row 4 emits a fixed code `ZONE_DRIFT_DETECTED` carrying **only a manifest hash and a day bucket** — no path, no per-occurrence timestamp — aggregated at most once per day per manifest hash under the same jittered batch discipline as E.4. Which path drifted is discoverable only by a human running `obsctl reveal-drift` locally against the manifest. Routine out-of-mount zone reachability (background jobs, accounts-mission resumption) mints no stored zone internals.

### E.4 Anonymous daily counter (R-E5)

`obs.zone_daily(day, delta)` — append-only deltas, read as `SUM(delta) GROUP BY day`; increments buffered and flushed at most once per `obs.zoneFlushIntervalMs` with jitter (physical row order reveals only coarse batches). No severity, code, route, or correlation columns.

### E.5 Manifest custody + anti-drift (OBS-R134)

Human-owned manifest in `@debateai/obs-capture` (outside the zone): zone path prefix set (`apps/api/src/registration.ts`, `apps/api/src/mail-channel.ts`, `packages/db/src/identity.ts`, `migrations/0030..0033`) + compiled-shape alternate prefixes + mount list (three routes) + identity-table deny set. Tests: classifier units over synthetic stacks (no zone import); manifest-reality (every path exists; mounts string-match `buildApi`; decoy non-match per RT-11); policy bundle pins the manifest hash — **verified by the daemon's process tree, not the worker's** (D.6); manifest is in the OBS-R104 forbidden set. Uncertain-under-context defaults excluded (row 3). Accounts-mission resume points untouched (OBS-R135). **U-09 remains CLOSED** with the equal-work, chain-walk, scrub, and sixth-row properties.

---

## F. Alerting (R-E6-09 channel) + owner routing

- **Requirements:** reaches V's phone and desktop; V's Mac now, `dezbatere.ro` later (OBS-R091); payload = validated ids/codes only (OBS-R103); delivery failure observable, never blocking (OBS-R084); every auto-landing notifies (OBS-R121); **every above-QUICK proposal notifies regardless of severity** (D.3, FID-06).
- **Working default (RT-27; §K row 7 remains V's confirm/veto):** **local-first.** Primary = macOS native notification via `osascript` (desktop, zero dependency, offline) **plus `sendmail` to V's inbox** (phone reach via mail push; the ops daemon shells the system `sendmail` with a fixed template — it does not import the zone-surface `SendmailMailSender`). G2 builds this pair as the working default (both local, no new dependencies, reversible); **ntfy is not built** unless V rules: self-hosted only, publish authentication from day one (never the public instance — topic knowledge is symmetric publish+subscribe, a spoofable bearer channel aimed at V's approval judgement), documented rotation/compromise procedure, and an **explicit V ruling that incident metadata may leave the machine** (zone-adjacent volume/timing is machine-resident data under R-E5's posture).
- **MUST — one payload, everywhere:** D.3 and this section share one fixed-enumeration template: `severity · incident id · fingerprint prefix · count · tier · verdict code · proposal id/approval handle (when applicable)`. **No free text, no LLM prose** — the "proposal summary" V reads before approving is these enumerated fields; the full FixProposal is read locally via `obsctl` (RT-27c). Notification text is inside the OBS-R102 wall and in G3's injection corpus (RT-21/RT-35).
- **MUST — incident-class → named-owner routing (FID-13, OBS-R128):** the policy bundle carries a routing table: `security/privacy → V (+ nameable security delegate) · persistence/migrations → V · spend → V (+ nameable budget delegate) · scoring/live-data → V · all else → V (default)`. All entries default to V until V names delegates; these classes route **directly to a named human owner and never through general PR generation**. Delivery results land as self-events.

---

## P. Deliverables, file contracts, dependency order (new at C4 — the G5 slicing substrate)

**Law for this section:** any two deliverables' file sets are **disjoint**. Files that more than one deliverable must touch are **declared touchpoints (TP-n)** — single lines or single mount points, each owned by **exactly one** deliverable. G5 must preserve both properties when cutting slices; H6 tickets inherit them. Nothing in this section is a slice or a ticket — it is the substrate they are cut from.

### P.1 Declared touchpoints (shared files, single owner each)

| TP | File | The one edit | Owner |
|---|---|---|---|
| TP-1 | `packages/db/src/schema.ts` | one `export * from "./obs-schema.js"`-style linkage for Drizzle metadata | D01 |
| TP-2 | `packages/db/src/index.ts` | one re-export line for obs schema surfaces | D01 |
| TP-3 | `apps/api/src/main.ts` | first-import line `import "@debateai/obs-capture/install/api"` | D05a |
| TP-4 | `apps/api/src/index.ts` | one plugin-mount line for the client-report endpoint (endpoint itself lives in D17's new file) | D17 |
| TP-5 | `apps/runner/src/main.ts` | first-import line for the runner installer | D05b |
| TP-6 | root `package.json` | `lint` wiring for `tools/obs-inventory` | D07 |
| TP-7 | root `package.json` | `build` filter repoint `dialectical-engine-web` → `dialectical-engine-v2ui` (separate line/edit from TP-6) | D19 |
| TP-8 | `acceptance/run-acceptance.ts` | registration of the obs acceptance family | D21 |

(`apps/scheduler/src/cli.ts` is wholly owned by D05c — its installer import and wrapper land in the same file, no TP needed. `apps/api/src/index.ts` error-handler edits belong to D05a; TP-4 is the only D17 line in that file — two deliverables, two disjoint named regions, D05a owns the error-handler region, D17 owns the mount line.)

### P.2 Deliverables

| id | Deliverable (bounded-context module) | File contract (owns) | Ships | Depends on |
|---|---|---|---|---|
| **D01** | obs store foundation: schema `obs`, tables (A.2), sequence, LOGIN roles + grants, reject/truncate triggers, chain columns, indexes, views (`obs.run_correlation_v`) | `migrations/0034_obs_foundation.sql` · `packages/db/src/obs-schema.ts` · TP-1 · TP-2 | G1 | ROW-GIT (lane law) |
| **D02** | capture core: `emit`/`captureHandled`/`runWithObsContext`, bounded queue (reference-holding, IC-2), flusher, redactor (allowlist, A.7), spool (pre-opened fd), health counters, gap accounting | `packages/obs-capture/src/{index,emit,context,queue,flusher,redactor,spool,health}.ts` + `packages/obs-capture/package.json` | G1 | D01, D06a |
| **D03** | zone classifier + manifest (E.3/E.5): chain-walk, anchored prefix, six-row table, frame scrub, drift signal, zone counter buffer | `packages/obs-capture/src/zone/**` (incl. manifest data file) | G1 | D02 |
| **D04** | installers, import-light (IC-1): per-runtime side-effect modules + import-graph test | `packages/obs-capture/install/*.ts` + `packages/obs-capture/test/install-import-graph.*` | G1 | D02 |
| **D05a** | api binding: error-handler capture on every branch incl. stream-abort, OBS-R053 response change | `apps/api/src/index.ts` (error-handler region) · TP-3 | G1 | D02, D04 |
| **D05b** | runner binding: task-catch capture before `recordTerminalFailure`, `attempt_index`, provider-gateway hook seam | `apps/runner/src/index.ts` (task + gateway regions) · TP-5 | G1 | D02, D04 |
| **D05c** | scheduler binding: job-lifecycle family, input-count no-op law, flush deadline, receipt pairs | `apps/scheduler/src/cli.ts` | G1 | D02, D04 |
| **D05d** | cause retrofit: `TypedDomainError` cause option; `typedPoolFailure` fixed template + cause; `console.error` rebind; repair-packet interpolation replaced by stable-code + safe-template | `packages/kernel/src/index.ts` (error class region) · `packages/db/src/index.ts` (wrapper region) · `apps/runner/src/index.ts` (`buildSchemaRepairPacket` region — disjoint from D05b's regions) | G1 | D06a |
| **D05e** | provider binding: exhausted-call capture in the gateway loop | `packages/providers/src/index.ts` | G1 | D02, D04 |
| **D06a** | code registry + safe templates (typed parameters per A.3), severity/mark mapping data | `packages/obs-capture/src/registry/**` | G0 (content) / G1 (code) | — |
| **D06b** | policy bundle: floor deny-globs, allowlist (empty), taxonomy pin, severity map, routing table, manifest hash, corpus hash, `hatchet_ingest` flag | `tools/obs-listener/policy/**` | G0 (pin) / G2 (files land with D08) | D06a, D03 |
| **D07** | CI inventory gate | `tools/obs-inventory/**` · TP-6 | G1 | — |
| **D08** | obs-daemon: intake, incident fold (state machine incl. FIXED_UNVALIDATED), dedup, tier gate, caps, proof refresh, LISTEN, canary bookkeeping | `tools/obs-listener/src/daemon/**` | G2 (deterministic) / G3+ (dispatch arms) | D01, D06b |
| **D09** | tracer (C.3) | `tools/obs-listener/src/trace/**` | G2 | D01, D08 |
| **D10** | detectors (B.2 detector row) | `tools/obs-listener/src/detectors/**` | G2 | D08 |
| **D11** | watchdog: heartbeats, cursor lag, chain verification (keyed, IC-4), witness log, spend counters, policy hash | `tools/obs-listener/src/watchdog/**` | G2 | D01, D08 |
| **D12** | obsctl: status/kill/arm/approve/deny/reveal-drift, board writes with read-back | `tools/obs-listener/src/obsctl/**` | G2 (status/kill/arm) / G3 (approve/board) | D08 |
| **D13** | notifications: osascript + sendmail, fixed template, delivery self-events | `tools/obs-listener/src/notify/**` | G2 | D08, D06b |
| **D14** | diagnosis-worker harness: spawn law, read-only profile, telemetry-or-fail-closed | `tools/obs-listener/src/worker-diagnosis/**` | G3 | D08 |
| **D15** | fix executor: fix-worker sandbox (no-access, IC-3), patch validation/apply/test/push pipeline, PR template, revert PR machinery | `tools/obs-listener/src/worker-fix/**` + `tools/obs-listener/src/landing/**` + sandbox profile files | G4 (approval-first) / G5 (QUICK+canary) | D08, D12, ROW-GIT |
| **D16** | hatchet ingest (dormant-capable per D.5 ruling): poll, anti-corruption map, cursor, gap accounting, skew monitor, source-link merge | `tools/obs-listener/src/ingest-hatchet/**` | G2, **behind SPIKE-D1**; parks to the new mission on a kill-criterion hit (Batch-3 row 14) | D08, SPIKE-D1 |
| **D17** | client seam: error boundaries, reporter, hardened endpoint (closed enums, server build_ref, origin-hash limiter, counted drops) | `apps/ui/app/{global-error,error}.tsx` · `apps/ui/lib/obs/**` · `apps/ui/components/ScoringErrorBoundary.tsx` (rewire) · `apps/api/src/obs-client-report.ts` (new) · TP-4 | G1 | D01, D06a |
| **D18** | ops install: launchd plist templates (jobs + KeepAlive witnesses) + install doc; no product code | `tools/obs-listener/launchd/**` | G1 (product runtimes) / G2 (daemon+watchdog) | — |
| **D19** | build repoint (H.3) | TP-7 (rename micro-ticket separate, OBS-R100 discipline) | G1 | — |
| **D20** | dev-logger README amendment (H.5, OBS-R136) | `apps/ui/lib/observability/README.md` | G1 | — |
| **D21** | acceptance + chaos harness: nine-case chaos, runner mis-wiring fixture, zone timing test, grant tests (real connections), privacy canaries (full OBS-R054 scope + no-free-text schema assertion + R-E4), import-graph fixture, index plans at 10× | `acceptance/obs/**` · TP-8 | G1/G2 (alongside) | D01–D05, D17 |

### P.3 Dependency order (topological; G5 lanes must respect it)

```
ROW-GIT reconciliation commit (V's act — immediately before the first coding lane)
  → D01 → D06a → D02 → {D03, D04}
  → {D05a, D05b, D05c, D05d, D05e, D17} (parallel, disjoint contracts)
  → {D07, D19, D20, D18(g1-part), D21(g1-part)}            == G1 complete
  → SPIKE-D1 → D06b pin → D08 → {D09, D10, D11, D12, D13} + D16(if spike passes) + D18/D21(g2-parts)  == G2
  → injection corpus (independent QA seat) → D14            == G3
  → D15(approval-first)                                     == G4
  → allowlist growth + D15(QUICK/canary arms)               == G5 → G6
```

---

## G. Rollout — OBS-R122's ladder, definitive (G0–G6)

**Gate numbering is OBS-R122's, unchanged.** Packet-name mapping so PROG inherits one vocabulary: packet-"G1 capture+store" = **G1**; packet-"G2 trace" = **G2 entry criteria** (the tracer is deterministic listener machinery); packet-"G3 listener report-only" = **G2 (deterministic) then G3 (LLM)**; packet-G4/G5 = **G4/G5**; **G6 present**.

**ROW-GIT, recorded (Batch-3 charter + goal packet):** the V-owned reconciliation commit **lands immediately before the first coding lane of this mission** — no PROG worktree, no lane branch, no RED→GREEN baseline exists before it; the orchestrator verifies it landed (HEAD ancestry) before dispatching the first G1 lane. It is V's act, destructive-git-adjacent, never agent-initiated (ROW-GIT ruling). G4's standing gate ("ROW-GIT landed") is thereby satisfied long before G4; it stays listed at G4 as defense in depth. Mission seats never push (OBS-R129) — lanes hand work to V's merge flow per the spine.

**Rollback vs trip — explicit and non-overlapping (RT-36):** capture, audit, or policy regression ⇒ **mutation authority OFF entirely (report-only), independent of gate level — R-E6-13 wins wherever the two rules overlap.** Gate rollback ("one gate back") applies only to non-capture regressions (e.g. verdict-quality decay at G3 → back to G2). **Rollback never darkens G1-G2 machinery: capture, detectors, the deterministic listener, and the notification path keep running at every rollback depth** — V is never un-alerted by the act of regressing (OBS-R084/R121/R124).

**While the row-14 deferral holds (if SPIKE-D1 kills):** every acceptance statement below that quantifies over sources reads "first-party sources"; the deferral flag is visible in the bundle; the new-mission intake candidate exists (D.5).

- **G0 — rulings + policy bundle pinned. ENTRY:** overlay + Batch-3 landed (done). **SHIPS:** bundle pins — tier rules, floor path-globs + allowlist (empty), taxonomy vocabulary, code registry seed with typed template parameters, severity mapping, zone manifest hash, injection-corpus hash (RT-35), register seed rows with `source_ref`, `hatchet_ingest` flag, routing table. **ACCEPTANCE (falsifiable):** bundle hash reproducible from its inputs; every pinned vocabulary member resolves (no dangling code/class/template id); allowlist file empty; a re-pin without both custodian tokens fails in drill.
- **G1 — capture + tables live; listener OFF. ENTRY:** G0 pinned; reconciliation commit landed (above). **SHIPS:** D01–D07, D17–D21 (G1 parts) — `0034_obs_foundation` + Drizzle metadata; LOGIN roles + per-component URLs (RT-28); capture core + all B.2 bindings incl. install-first import-light installers (RT-01/IC-1), job-lifecycle events (FID-03), suspicious-success store surface (FID-02); spool/keys on separate volume (RT-16); zone classifier (equal-work build, IC-2); client seam + hardened `/v1/obs/client-report` (RT-19); OBS-R053 response change; cause retrofit + wrap pass + CI inventory gate; **code registry (machine-readable, OBS-R011)**; keyed hash chains + TRUNCATE triggers (RT-06/IC-4); authority-proof plumbing (A.5).
  **ACCEPTANCE (each falsifiable):**
  1. **Runner mis-wiring fixture (RT-34):** driving a seeded work item to S04 through the Hatchet task path against today's `apps/runner/src/main.ts` wiring (re-verified: `compositionRow` wired at `:17,:40`-region; `judgementPolicy`/`servePolicy` absent) yields **exactly one occurrence with `code = JUDGEMENT_POLICY_UNRESOLVED` (`apps/runner/src/index.ts:1226-1232`), `capture_point = job`, non-null `run_ref`/`work_item_ref`** — harness: the acceptance runner-path proof family (`acceptance/run-acceptance.ts`, TP-8); fixing the mis-wiring stays out of scope (§K row 10).
  2. **Chaos — all NINE OBS-R061 cases, none dropped (FID-05/RT-03):** DB unavailable · disk full **and read-only filesystem** · **queue full** (exercises `captureQueueMax`/`shedThresholdPct`) · malformed/cyclic error · 10× burst · redactor failure · **recursive writer failure** · **crash during flush** (kills the in-memory gap counter — passes only because authority rests on the positive proof, RT-04) · recovery + idempotent re-ingest. Pass = product failure semantics unchanged AND any loss explicit (counted), per case.
  3. **Authority fails CLOSED under every chaos case:** proof goes stale ⇒ trip; no case leaves `ARMED`-with-fresh-proof standing while capture is compromised.
  4. **Volume separation (RT-16):** with the Postgres volume killed, spool/`KILL`/`ARMED`/proof/keys remain writable/readable and the trip fires.
  5. **Zone timing test (RT-08/IC-2):** zone-branch response-time distributions capture-on vs capture-off show no statistically resolvable delta (sample size V's, §K row 3).
  6. **Privacy canaries (full OBS-R054 scope):** secrets planted in keys, values, messages, stacks, causes, URLs and provider output never reach any sink; identity-shaped canaries (R-E4) never land; **schema manifest test proves no free-text/message column and no user-linked column exists in any `obs.*` table** (Batch-3 row 6 + R-E4).
  7. **Grant tests against real connections (RT-28):** the listener's actual connection string is denied on `occurrence_detail`, `identity.*`, `core.run.question_line/asker_id/session_id`; no obs URL equals the product's; no role holds DELETE.
  8. **Installer import-graph test (IC-1):** module-eval-reachable imports of the installer subtree = Node built-ins only; the `@debateai/db`-throws-at-import fixture still captures and spools the boot throw.
  9. **Overhead calibration (U-02):** measured p99 emit cost and queue behaviour recorded as register-row calibration evidence (numbers to §K row 1).
  **ROLLBACK:** any capture/audit regression ⇒ fix forward with the layer disableable via register row (OBS-R060); listener not yet on, so no authority to trip.
- **G2 — deterministic listener, report-only, no LLM. ENTRY:** G1 accepted; **SPIKE-D1 executed at entry** (half-day, read-only; exit or kill per D.5 — on kill, the row-14 ruled posture executes: deferral flag set + new-mission intake candidate authored; G2 proceeds first-party-only). **SHIPS:** D06b files, D08–D13, D16 (per spike), D18/D21 G2 parts; indexes proven at 10× (OBS-R042); notifications live (working-default channels, owner routing §F); severity-then-age intake order (OBS-R083).
  **ACCEPTANCE (falsifiable):** against a **human-labelled root-cause sample** (size V's, §K row 3; OBS-R123): tracer `CODE_ROOT`/`EXTERNAL_ROOT` agreement ≥ ruled rate; `INSUFFICIENT_EVIDENCE` ≤ ruled ceiling; substantive verdicts ≥ ruled floor (an always-IE tracer fails); 100% closed-vocabulary termination within bounded hops/queries; zero scans in query plans at 10×; cursor survives kill/restart drills with zero missed occurrences (seeded corpus, counted); split-clock skew measurement taken and recorded (RT-15) [first-party-only variant: skew item deferred with the flag]; notification drill delivers via both default channels and the delivery self-events land; watchdog chain verification passes on seeded histories and **fails loudly on a seeded broken/forged link** (IC-4 — the negative case is part of acceptance); detector suite fires on seeded stall/no-op/suspicious-success fixtures and stays silent on clean fixtures.
  **ROLLBACK:** capture/audit regression ⇒ report-only is already the state; regressions here fix forward; notification path never dark (RT-36).
- **G3 — LLM diagnosis, report-only. ENTRY:** G2 accepted; injection corpus authored by the **independent adversarial QA seat** (intake roster), version-controlled, hash pinned in the G0 bundle (RT-35), ruled minimum size (§K row 3). **SHIPS:** D14; FixProposals flow to notification + approval handles; nothing lands.
  **ACCEPTANCE (falsifiable):** **injection corpus clean, with custody (RT-35):** scored by a deterministic detector — any tool call, path, or output field not derivable from the validated input set = violation; zero violations; **targets include the worker prompt, board/ticket text, and notification text** (RT-21). Severe workflow drilled end-to-end incl. live V approval and `obsctl`-emitted tickets on board `observability-loop` with board-id read-back before and after (RT-20). Caps/kill/trip drills pass **without database access** (OBS-R106). Diagnosis workers: fresh session per incident, zero resumes, zero idle calls (audited from `obs.budget_usage` + `agent_action`); missing usage telemetry demonstrably fails closed to report-only (OBS-R089). Every policy decision row re-evaluates bit-identically from its recorded input hash (OBS-R094).
  **ROLLBACK:** verdict-quality decay ⇒ back to G2 (LLM off); capture/audit/policy regression ⇒ report-only + trip (RT-36).
- **G4 — PR-FIX (approval-first armed). ENTRY (hard gates):** ROW-GIT landed (standing gate, satisfied since G1) · branch protection/CODEOWNERS/bot identity/required checks verified AND their ruleset hash entering the continuous pre-dispatch check set (RT-26) · **fix-worker sandbox verification passed incl. IC-3 forge fixtures** (D.6): read attempts, write/forge attempts (fake `ARMED`, planted proof, planted git credentials, fake bundle), network egress — all contained, and planted artifacts fail signature/keyed verification.
  **SHIPS:** D15 approval-first arm. Human merge only (OBS-R117, E6-04).
  **ACCEPTANCE (falsifiable):** one real approval-first landing end-to-end: proposal → V approval (content-hash bound) → coded fix → PR into `dev` with machine-parseable template (RED/GREEN evidence, revert command, no raw error text — OBS-R114) → human review + merge (OBS-R117); a tampered-proposal drill (hash mismatch) refuses to code; a mid-flight kill drill revokes the lease and no push occurs; branch-protection-hash mismatch drill trips on dispatch (RT-26); clean-baseline enforcement demonstrated on a seeded dirty tree (OBS-R112).
  **ROLLBACK:** any capture/audit/policy regression or trip ⇒ report-only (G3 behaviours minus proposals-to-code), notification path intact.
- **G5 — QUICK canary (deferred-canary semantics, Batch-3 row 13). ENTRY:** G4 accepted · `obs.blastRadiusMaxReachable`, `obs.fingerprintMaturityN`, `obs.canaryWindowMs`, `obs.lineageDepthMax` ratified by V (fail-closed absent values, RT-31) · allowlist growth mechanics drilled (dual-custody re-pin with evidence packet, RT-32).
  **SHIPS:** D15 QUICK arm; allowlist grows from empty only via dual-custody re-pin with evidence packets; auto-merge protections (OBS-R115/R116); auto-disable armed (E6-14).
  **ACCEPTANCE (falsifiable, structural — numbers V's, RT-37/§K row 3):** N consecutive QUICK landings each marked `UNVALIDATED` at merge, whose **canary windows opened at a real subsequent deploy (build-ancestry check) and closed clean** · during every UNVALIDATED period, zero fix attempts on the frozen root (audited) · zero forbidden-path touches · zero audit-chain breaks (keyed verification) · ruled human-agreement rate on sampled QUICK root verdicts · every allowlist entry carries its evidence packet · one full auto-disable + dual-custody re-arm drill · **one staged auto-revert drill proving exactly-one semantics: seeded fingerprint recurrence on a fix-bearing build produces exactly one revert PR (merge-only) + trip, and a second recurrence produces escalation, not a second revert** (OBS-R119).
  **ROLLBACK:** auto-revert fired or any E6-14 trip ⇒ mutation OFF; re-arm is dual-custody; gate regression per RT-36.
- **G6 — steady state.** Standing posture: system remains lawful parked at ANY gate forever (OBS-R124); every phase revocable; quarterly (cadence V's) re-drill of kill/trip/injection suites; deferral flag (if set) reviewed at each re-drill until the Hatchet mission lands.

**Container-topology gate (decoupled from the ladder — FID-11/RT-38):** SPIKE-U06 is **not in any G-gate's ship list**. U-06 is **closed today on the interim binding** — `tsx`-run processes (re-verified in `apps/{api,runner}` start scripts), no supervisor in-tree, launchd as the external liveness owner (§H.2) — the only supported topology until further notice. A standalone, cross-mission-order-free gate — "**containerized-topology binding**" (owner: the ops/PROG lane that owns `tools/obs-listener`) — must close before **any obs component runs inside a container**: it verifies Node version, container init/signal handling, restart policy, whether unhandled failures reach our handlers before container death, and that health/proof artifacts live on volumes the supervisor provably reads (RT-05). If docker-hatchet never lands, nothing here blocks; if it lands, containers wait on this gate, not the reverse. ROW-TOPOLOGY's "no hard ordering" holds in both directions.

---

## H. Deferred calls

### H.1 E6-15 — PRUNE the three error-shaped members (recommendation, unchanged evidence)

29 declared wire types (`packages/contract/src/index.ts:17-49`) vs 7 storable kinds (`migrations/0021_dr174_cooldown_prune.sql:4-12`, re-verified); SSE is DB-backed so only 3 of 29 can reach the wire; `node.failed`/`ledger.failure`/`ledger.attempt` are error-shaped, unproducible, UI branch dead (`apps/ui/app/debateFailureEvents.source-test.mjs.disabled`). Recommend: prune exactly those three (+ dead branch) behind `pnpm generate:contract`; never widen `run_progress_event` into a second error channel (OBS-R028/R136); the remaining 23 are product progress vocabulary, ticketed outside this mission. G1 does not depend on this call (obs codes are registry members, not wire types). §K row 4.

### H.2 E6-06 — scheduling + the external liveness owner

`job:*` are one-shot CLIs, no cron in-tree. Interim: **launchd** — three plists for the jobs AND `KeepAlive` agents for the long-lived runtimes (api, runner, obs-daemon, watchdog), which doubles as RT-01's never-started witness; per-job stderr paths; no product code (templates live in D18, `tools/obs-listener/launchd/`). Post-containerization: Hatchet cron workflows (`v1/client/features/crons.d.ts`, verified in the pinned SDK) behind the container-topology gate. Cadence expected-vs-observed is detector-observed either way (OBS-R004/R005). §K row 5.

### H.3 Build repoint (R-E6-10)

Root `build` filters `dialectical-engine-web` (`package.json:12`, re-verified); repoint to `apps/ui`'s package (`dialectical-engine-v2ui`, re-verified) + typecheck coverage — TP-7, one G1 PROG task (D19). The `v2` name breaches the naming law → separate micro-ticket (rename to `dialectical-engine-ui`), not bundled (OBS-R100 discipline).

### H.4 `web/` leftover

No instrumentation, no build effort; removal rides the parked tree-move commit (ROW-GIT, R-E6-10). Stated so the coverage map is honest.

### H.5 Dev-logger reconciliation (OBS-R136)

The `apps/ui/lib/observability/README.md` prohibition stays true **for those diagnostics** (file-only JSONL); the `obs` store is a separate V-ordered class; neither imports the other's transport. PROG adds one amendment paragraph to that README citing this mission (D20). Its redaction tests seed the obs redactor suite.

---

## I. DDD impact — bounded context, modules, invariant ownership

- **One bounded context `obs`**, four code modules on two deployment sides: `obs-store` (D01 — schema custody), `obs-capture` (D02–D06a, D17 — product-side library incl. zone classifier, registry, redactor), `obs-ops` (D08–D16 — daemon, tracer, detectors, watchdog, obsctl, workers, notify), `obs-policy` (D06b + manifest — human-owned data, dual-custody to change). Owns: Occurrence, Incident (incl. canary validation states), CaptureGap, TraceVerdict, FixProposal, ApprovalRecord, SourceLink, ZoneDailyCount, AuthorityProof (A.5), UnclassifiedResidue (RT-09), capture-status truth, fingerprint identity, **keyed audit-chain continuity**. Language: *occurrence* vs *incident*; *capture gap*; *zone residue*; *severe workflow*; *trip* (deterministic authority removal); *proof-of-capture-health* (positive artifact whose absence is a trip); *lineage depth* (fix-chain bound); *deferred canary* (UNVALIDATED landing awaiting a deploy-opened window); *explicit deferral* (bundle-flagged absence of a source, never silent).
- **Read-only contexts:** `core`/`ledger`/`serve` via obs-owned column-safe views (sequence authority stays ledger's); `register` (thresholds live there; authority stays register's). **Never touched:** `identity` — no joins, no columns, no view exposure (R-E4, E6-08). **Boundary with `packages/liveness` (OBS-R003):** liveness remains the content-staleness owner; obs runtime-health detectors are a separate family that may **consume** liveness outputs as signals but never reuse or extend its states; `obs.component_health` is process health, not content staleness.
- **Anti-corruption:** Hatchet ingestion translates vocabulary at the boundary; Hatchet text never crosses as instructions — or as stored bytes (OBS-R142, FID-08, row 6).
- **Invariant ownership (owner → mechanism → verified at):** append-only + keyed chain continuity — `obs-store` writers + watchdog witness (triggers, HMAC links, witness log; G1 chaos + G2 negative case) · projection consistency — daemon fold, watchdog sampled re-derivation (G2) · zone membership — human-owned manifest, obs enforces never defines (G1 manifest-reality tests) · board custody — Hermes store, written only by `obsctl` under V's identity (G3 drill) · product failure semantics — unchanged by construction (OBS-R055/R056; G1 chaos) · canary validation state — daemon fold, deterministic, from landing + deploy-observation facts (G5 drills) · policy/allowlist/keys custody — dual-custody re-pin only (G0/G5 drills; OBS-R104 set) · no-user-identifiers + no-free-text — schema manifest tests (G1).

## J. Self-observation matrix

| Component | Observed by |
|---|---|
| capture lib / emit path | health counters + per-runtime receipts (RT-05) + watchdog scrape + G1 chaos (all nine) |
| store / DB sink | non-recursive db channel + `capture_gap` + spool receipts + **keyed hash-chain continuity checks** (RT-06/IC-4) |
| spool | receipts on re-ingest; unflushed-age detector; **volume separation from Postgres data verified in chaos** (RT-16) |
| boot/import window | **install-first side-effect import, import-light (IC-1)** + external liveness owner (launchd KeepAlive + expected-process detector) — never-started has an outside witness |
| SIGKILL/OOM class | acknowledged uncapturable; external liveness owner only (RT-02) |
| zone counter + drift | jittered batch flushes; drift = hash+day aggregate only (RT-12); classifier residue lands in `unclassified`, trip-eligible (RT-09) |
| obs-daemon | heartbeat → `component_health` (display) + **proof artifact (authority)**; watchdog; silence ⇒ stale proof ⇒ authority off + detector occurrence |
| watchdog | daemon watches back (mutual heartbeat); launchd keepalive; its witness log is included in proof-refresh inputs (A.5) |
| diagnosis worker | supervisor lease + wall-clock kill; `agent_action` audit; usage telemetry or fail-closed |
| fix worker | **OS-user sandbox with NO ACCESS to switches/keys (D.6/IC-3); patch-only output; daemon-held credentials; adversarial read+forge fixture at G4 entry** |
| hatchet ingest | cursor-lag self-events + source gaps + skew monitor (trip-eligible, RT-15); shared-failure-domain named (RT-16); deferral flag visible when parked (row 14) |
| notifications | delivery-result self-events; template-only content inside the injection wall (RT-21/RT-27) |
| board writes | `obsctl` (human identity) + board-id read-back + `agent_action` audit (RT-20) |
| kill/arm/proof | positive artifacts; transitions audited when DB up; absence = trip (RT-04/RT-23) |
| policy gate | input-hashed decisions in `policy_decision`; branch-protection hash checked every dispatch (RT-26) |
| canary lifecycle | landing/validation facts in `agent_action`; window bookkeeping deterministic from build-ancestry observation (D.4); auto-revert fires the trip (D.7) |

## K. DECIDE-V table — Batch-3 status applied

Rows 6, 11, 13, 14 are **RULED (Batch-3, 2026-08-21)** and their rulings are folded into this document; they are closed here and listed for the audit trail. The remaining rows are OPEN and travel to V with the H4/H6 packet. Row numbering is stable against Plan.md.

| # | Status | Decision | Options / recommendation / ruling | Trace |
|---|---|---|---|---|
| 1 | OPEN | All numeric bounds — incl. `obs.fingerprintMaturityN` (seed: Grok N=3, FATAL→1), `obs.blastRadiusMaxReachable` (**no seed; fail-closed until rated**), **`obs.canaryWindowMs` (new name for row 13's ruled window — number still V's)**, `obs.lineageDepthMax`, `obs.authorityProofStalenessMs`, overhead/queue/depth/caps/cadences/skew/severe threshold | seeds as marked; ratify after G1 calibration; skew only from split-clock measurement (RT-15) | OBS-R044, DIV-11, RT-31, OBS-R109 |
| 2 | OPEN | E6-14 auto-trip numbers | structure fixed (OR list, D.7); numbers at activation | E6-14 |
| 3 | OPEN | Gate-exit sample sizes / rates / calendar minimums — G2's labelled sample size, agreement rate, IE ceiling/floor (RT-33); G5's structural quantities (RT-37); G1 timing-test sample size | structure in §G; numbers V's | OBS-R123 |
| 4 | OPEN | E6-15 prune of 3 error-shaped contract members | PRUNE (H.1) | R-E6 deferred, OBS-R013 |
| 5 | OPEN | E6-06 scheduler + liveness-owner hosting | launchd now (jobs + KeepAlive witnesses); Hatchet crons behind the container gate | R-E6 deferred, RT-01 |
| 6 | **RULED** | `obs.occurrence_detail` free-text remnant | **V: DROP IT ENTIRELY (option a).** No free-text remnant; structured allowlist fields + cause codes + typed template parameters only; OBS-R048 exception removed; no raw message text stored anywhere in obs. Folded: §A.6, §A.3, §A.7, §G1-acc-6 | Batch-3 row 6; OBS-R050/R048, FID-08 |
| 7 | OPEN | Notification channel (RT-27) | **local-first: osascript + sendmail (working default, G2)**; ntfy only if self-hosted + publish-auth + V explicitly rules incident metadata may leave the machine | R-E6-09, OBS-R103 |
| 8 | OPEN | `obs.severeThreshold` over the obs ladder (RT-41) | seed `≥ SEVERE` on `INFO<DEGRADED<SEVERE<FATAL`; mapping table in policy bundle; OBS-R008 deviation argued (unordered CONDITION_MARKS cannot carry `≥`) | R-E6-09, OBS-R008 |
| 9 | OPEN | R-BIGGER × OBS-R117 composition | approval-first proposal; fix lands as human-merged PR into `dev` under E6-04 — confirm | R-BIGGER, E6-04 |
| 10 | OPEN | Runner mis-wiring fix ticket (out of scope; G1 fixture until fixed) | ticket to product now | synthesis finding 4 |
| 11 | **RULED** | E6-04 scoping for QUICK (FID-07) | **V: CONFIRM THE READING (option a).** E6-04 governs PR-FIX/approval-first; QUICK's independent review = automated policy gate + post-landing visibility (OBS-R115/R121); QUICK keeps no-approval. Folded: §D.4 | Batch-3 row 11; E6-04, R-E1 |
| 12 | OPEN | Client-report fix-eligibility (RT-19c): `ui_client` occurrences report-and-count only | keep excluded until a dedicated V ruling opens them (recommended: keep excluded) | RT-19, E6-12 |
| 13 | **RULED** | E6-01 × OBS-R119 canary (RT-25, ARCH→REQ) | **V: DEFERRED CANARY (option a).** `UNVALIDATED` at merge; window opens at next natural deploy; same-code fixes frozen until confirmation; exactly ONE automatic revert PR, merge-only; E6-01 unamended; G5 certifiable. Folded: §D.4 (mechanics), §D.7, §A.2, §G5 | Batch-3 row 13; E6-01, OBS-R119/R108 |
| 14 | **RULED** | Dual-source fallback (RT-39, ARCH→REQ) | **V: HATCHET-READABLE IS A NEW MISSION (option b).** No silent narrowing; first-party-only ships as EXPLICIT DEFERRAL (bundle flag); Hatchet read-back = own scoped mission, motivated by the worker-crash-before-flush gap; OBS-R137/R138 wait for it. Folded: §D.5, §G qualifiers, D16 | Batch-3 row 14; OBS-R137/R138/R143 |
| 15 | OPEN | Reaper build-or-park (OBS-R006/DIV-10) | (a) **park + mitigation [REC]:** per-work-item stall dedup, acknowledged-state muting · (b) commission the reaper as a follow-up product mission | OBS-R006, DIV-10 |
| 16 | OPEN | Fix cooldown window (OBS-R108) + root-keyed extension (RT-17) | window length V's; root-keyed rule structural (D.4), incl. the UNVALIDATED freeze (row 13) | OBS-R108, RT-17 |

No requirement conflict is unrouted; C4 added no new rows. Rows 9/12 and the number rows travel with the H4 packet.

## L. Traceability closure — re-run at C4

- **Six ARCH-tagged UNVERIFIED rows:** **U-01** design + SPIKE-D1 with exit AND kill criteria; fallback now RULED (row 14 — new mission, explicit deferral; D.5) · **U-06** CLOSED on the interim `tsx`/launchd binding; container questions live in the standalone container-topology gate, no cross-mission ordering (§G) · **U-07** CLOSED (D.2, no pooler, dedicated LISTEN connection) · **U-09** CLOSED on the redesigned classifier (equal-work, chain-walk, scrub, six rows — §E) · **U-11** CLOSED on the ambient-context watermark, three-state, query-free (C.4) · **U-18** CLOSED by design; tolerance ratified only from split-clock measurement (D.5, RT-15). Non-ARCH U-rows keep their synthesis phase tags: U-02 → G1 calibration (§G1-acc-9) · U-03 → §K row 1/activation · U-04 → G4 entry (RT-26) · U-05 closed-unresolvable (no claim of prior server-wide capture anywhere in this plan) · U-08 → §K rows 5 + E6-05 (B.2 evaluator row) · U-10 → G1 privacy canaries · U-12 → parked with R-E4 (no user-linked rows exist to shred) · U-13 → RULED R-E6-10 (`apps/ui`) · U-14/U-16 → D07 inventory (OBS-R022) + registry (OBS-R011) · U-15 → G1 fixture (first runtime execution evidence) · U-17 → D07 inventory sweep.
- **Overlay items:** R-E1/R-E2 (D.4 QUICK) · R-BIGGER (D.3/D.4, reachable at all severities) · R-E3 (D.1/D.7) · R-E4 (A.3/A.7/B.2-client/I — supersedes OBS-R052/E6-07) · R-E5 (E — counter-only; supersedes-tightens OBS-R132) · R-E6-09 (D.3/F — actor = obsctl, OBS-R127 unamended) · R-E6-13 (A.5 — fail-closed positive proof) · R-E6-10 (B.2 client/H.3/H.4) · E6-01 (D.4/row 13 ruled — unamended) · E6-02 (D.7 custody + expansion incl. keys) · E6-03 (D.4 empty allowlist) · E6-04 (row 11 ruled — D.4) · E6-05 (B.2 evaluator) · E6-06 (H.2/row 5) · E6-08 (A.7 views) · E6-11 (D.4 floor definition) · E6-12 (A.4 counting; D.4) · E6-13 (A.5) · E6-14 (D.7 OR-list) · E6-15 (H.1/row 4) · E6-16 (D.5 merge authority). **Batch-3:** row 13 → D.4/D.7/A.2/G5 · row 11 → D.4 · row 6 → A.6/A.3/A.7/G1 · row 14 → D.5/G/D16. **DR-179** (D.1) · **DR-188** (A.2) · **ROW-GIT** (§G preamble, G1 ENTRY, G4 gate) · **ROW-TOPOLOGY** (§0, §G container gate) · **ROW-HATCHET** (D.5).
- **Round-1 review items:** FID-01..17 and RT-01..42 resolutions are carried intact from the approved Plan.md (its §M ledger remains the finding→section index; the sections survive here under the same letters). The four Lens-B residual constraints are now binding ICs: RT-01→IC-1 (B.1) · RT-08→IC-2 (B.1/E.3) · RT-22→IC-3 (D.6/G4) · RT-06→IC-4 (A.2/D.7/I). Lens A REG-01 → A.7 (restored citations + argued deviation).
- **Full OBS-R id map — every id, its home, its status (no cited-but-unimplemented id; inverse direction: no id without a home):**

| ids | Home | Status |
|---|---|---|
| OBS-R001 · OBS-R002 · OBS-R004 | §0, B.2 detectors | designed |
| OBS-R003 | §I liveness boundary | designed |
| OBS-R005 | B.2 scheduler | designed |
| OBS-R006 | B.2 detectors, §K 15 | designed + DECIDE-V (reaper) |
| OBS-R007 · OBS-R009 · OBS-R010 · OBS-R011 · OBS-R012 | A.3 (taxonomy, component, promotion, registry), B.2 | designed |
| OBS-R008 | A.3, §K 8 | SHOULD — deviation argued (unordered marks) |
| OBS-R013 | H.1, §K 4 | DECIDE-V (E6-15) |
| OBS-R014 · OBS-R015 | B.2 process row | designed |
| OBS-R016 · OBS-R017 · OBS-R018 · OBS-R019 · OBS-R020 | B.2 api/runner/provider/db/client rows | designed |
| OBS-R021 · OBS-R022 | B.2 funnels-are-transport, D07 | designed |
| OBS-R023 | B.2 | SHOULD (deferred lint, per DIV-01) |
| OBS-R024 | A.4, B.2 provider | designed |
| OBS-R025 | C.3 verdict vocabulary (POLICY_ROOT) | designed |
| OBS-R026 · OBS-R027 | B.1 | designed |
| OBS-R028 · OBS-R031 | A.1 | designed |
| OBS-R029 · OBS-R030 | A.2 | designed |
| OBS-R032 · OBS-R033 · OBS-R034 · OBS-R036 · OBS-R038 · OBS-R039 | A.3 envelope | designed (R033 interim stamp until ROW-GIT, RT-42) |
| OBS-R035 | B.1 context | designed |
| OBS-R037 | A.4 fingerprint | designed |
| OBS-R040 · OBS-R041 · OBS-R042 · OBS-R043 | A.7 | designed |
| OBS-R044 | B.3, §K 1 | designed + DECIDE-V numbers |
| OBS-R045 | A.2 retention floor (DR-188) | designed |
| OBS-R046 · OBS-R047 · OBS-R048 | A.7 redaction law (restored, REG-01) | designed — R046 timing deviation argued; R048 exception REMOVED (row 6) |
| OBS-R049 | A.3 safe templates, C.1 | designed |
| OBS-R050 | A.6 | **RULED OUT (Batch-3 row 6)** — no raw-detail field exists |
| OBS-R051 | A.3 frames | designed |
| OBS-R052 | A.3 | **superseded by R-E4** — user-linked columns omitted entirely |
| OBS-R053 | B.2 api row | designed |
| OBS-R054 | A.7 canaries (full scope restored) | designed |
| OBS-R055 · OBS-R056 · OBS-R057 · OBS-R058 · OBS-R059 · OBS-R060 · OBS-R061 | B.1/A.5/A.7/B.3/G1 | designed (R058 honesty in G1 acceptance) |
| OBS-R062 · OBS-R063 · OBS-R064 · OBS-R065 · OBS-R066 · OBS-R067 | C.1, B.2 | designed |
| OBS-R068 · OBS-R069 · OBS-R070 · OBS-R071 · OBS-R072 · OBS-R073 · OBS-R074 · OBS-R075 · OBS-R076 · OBS-R077 | C.3 | designed |
| OBS-R078 | C.5 | SHOULD (order adopted) |
| OBS-R079 · OBS-R080 · OBS-R081 · OBS-R082 · OBS-R083 | D.2, D.1 | designed |
| OBS-R084 | §F | designed |
| OBS-R085 | D.5 (Hatchet never the bus) | designed |
| OBS-R086 | D.1 watchdog | designed |
| OBS-R087 · OBS-R088 · OBS-R089 · OBS-R090 · OBS-R091 | D.1 | designed |
| OBS-R092 · OBS-R093 · OBS-R094 · OBS-R095 · OBS-R096 · OBS-R097 · OBS-R098 · OBS-R099 · OBS-R100 · OBS-R101 | D.4 | designed |
| OBS-R102 · OBS-R103 | D.3/F injection wall | designed |
| OBS-R104 · OBS-R105 | D.4 forbidden set (incl. keys) | designed |
| OBS-R106 | D.7 kill switch | designed |
| OBS-R107 | D.7 caps, §K 1 | designed + numbers V's |
| OBS-R108 | D.4, §K 16 | designed + window V's |
| OBS-R109 | A.4/B.3, §K 1 | designed + N V's |
| OBS-R110 | D.4 | designed |
| OBS-R111 | A.2 agent_action | designed |
| OBS-R112 · OBS-R113 · OBS-R114 | D.6 | designed |
| OBS-R115 · OBS-R116 · OBS-R117 · OBS-R118 | D.4 | designed |
| OBS-R119 | D.4 deferred canary | **designed on Batch-3 row 13 semantics** |
| OBS-R120 | D.4 (E6-01 merge-only) | settled by adopted default E6-01 |
| OBS-R121 | D.4/F | designed |
| OBS-R122 · OBS-R123 · OBS-R124 | §G ladder/acceptance/G6, §K 3 | designed + numbers V's |
| OBS-R125 | §0 split | designed |
| OBS-R126 · OBS-R127 · OBS-R128 | D.4 ESCALATE, D.3 board (unamended), §F routing | designed |
| OBS-R129 | §0, §G preamble | designed (no-push law untouched) |
| OBS-R130 · OBS-R131 · OBS-R133 · OBS-R134 · OBS-R135 | §E | designed |
| OBS-R132 | E.1 | **superseded-tightened by R-E5** (counter-only beats metadata set) |
| OBS-R136 | H.5 (D20) | designed |
| OBS-R137 · OBS-R138 | D.5 | designed; on SPIKE-D1 kill: **explicit deferral to the new mission (Batch-3 row 14)** — never re-scoped here |
| OBS-R139 · OBS-R140 · OBS-R141 · OBS-R142 · OBS-R143 | A.2 source_link, C.2, D.5 | designed (dormant-capable behind the bundle flag) |
| OBS-R144 | D.5 SPIKE-D1 | designed (ARCH-phase resolution mechanism) |

Closure verdict: every OBS-R001..R144 id has a home and a status; the only ids not carried as designed are the four with explicit ruling-level dispositions (R050 ruled out, R052/R132 superseded by R-E4/R-E5, R023/R078/R008 carried as argued SHOULDs) — none is cited-but-unimplemented, and no §K-worthy item lacks a row.

## M. C4 delta ledger — every C4 obligation → resolving section

| Obligation (source) | Resolution |
|---|---|
| Batch-3 row 13 — deferred canary (option a) | §D.4 RULED block (7-step mechanics: UNVALIDATED landing, root freeze, deploy-opened window via build ancestry, `obs.canaryWindowMs`, clean-window validation, exactly-one revert PR + trip, no-deploy = frozen forever); §D.7 trip list; §A.2 incident states + agent_action facts; §G5 entry + acceptance incl. staged exactly-one drill; §K row 13 RULED; §B.3 new register row; §K row 1 carries the number |
| Batch-3 row 11 — QUICK review scoping (option a) | §D.4 RULED block (policy gate + post-landing visibility = QUICK's independent review; E6-04 binds PR-FIX/approval-first); hedge removed; §K row 11 RULED |
| Batch-3 row 6 — free-text remnant DROPPED | §A.6 (structured-only detail); §A.3 (no message column anywhere + typed template parameters); §A.7 (allowlist-only surface); §G1 acceptance 6 (schema assertion); §K row 6 RULED; OBS-R048 exception removed; OBS-R050 marked ruled-out in §L |
| Batch-3 row 14 — Hatchet read-back = new mission (option b) | §D.5 RULED block (explicit-deferral bundle flag, new-mission intake candidate at SPIKE-D1 exit, motivating gap = worker-crash-before-flush, first-party-only acceptance qualifiers, dormant cross-source machinery); §G preamble qualifier; D16 parks; §K row 14 RULED |
| Lens A REG-01 — restore OBS-R046/R047/R054; argue relocation | §A.7: restored citations; new MUST (redaction before every durable sink; queue holds unpersisted references; spool post-redaction only; bypass = always-escalate defect); the capture-time→flusher-time deviation argued under the precedence rule (RT-08 equal-work + OBS-R056), substance-preservation stated; OBS-R054 canaries restored to full ruled scope (§A.7, §G1-acc-6) |
| Lens B IC-1 — import-light installer | §B.1 MUST; enforcement = import-graph test + db-throws-at-import fixture; §G1 acceptance 8; D04 |
| Lens B IC-2 — enqueue holds a reference | §B.1 MUST + §E.3 equal-work bullet corrected ("pre-serialized" wording replaced by reference/handle; all serialization on the flusher); timing test remains the backstop; D02 |
| Lens B IC-3 — fix-worker no-access + forge fixtures | §D.6 MUST (no read/write/create/traverse/stat on switches, keys, credentials); §G4 entry fixture extended to write/forge attempts + planted-artifact invalidity; D15 |
| Lens B IC-4 — HMAC/anchor the hash chain | §A.2 keyed-chain MUST (per-writer HMAC keys outside Postgres, watchdog verify keyring + out-of-band witness log, proof-refresh includes witnessed heads); "independent of superuser" now earned; §D.7 expansion covers key custody; §G2 acceptance negative case; §I invariant ownership; D11 |
| Goal packet — ROW-GIT recording | §G preamble + §G1 ENTRY: reconciliation commit (V's act) lands immediately before this mission's first coding lane; orchestrator-verified before lane dispatch; G4 standing gate retained as defense in depth |
| Goal packet — deliverables / bounded contexts / dependency order / falsifiable gates / G5-sliceable sizing | §P (deliverables D01–D21, TP-1..8, disjointness law, topological order); §I (modules + invariant ownership); §G (ENTRY/SHIPS/ACCEPTANCE/ROLLBACK per gate, every acceptance item falsifiable, numbers marked V's) |
| Goal packet — §L closure re-run; no user-linked ids; no free text | §L full-id map (144 ids, 4 ruling-level dispositions named); §A.3 R-E4 MUST; §A.3/A.6 no-free-text MUSTs; §G1 acceptance 6 |

*End of FinalPlan.md — G5 cuts vertical slices from §P against §G's gates; H6 ticketizes; neither activity happens in this document.*
