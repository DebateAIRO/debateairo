# FixAgent — requirements (observability-agents)

Seat REQ-FIX (Fable 5.1) · ticket `t_80ef9dec` · 2026-09-01/02 · tree `dev @ 8d38185c` (+111 `ui-overhaul` dirty entries, untouched) · binding overlays: intake C1/C3/C4/C7, V rulings R-E1..R-E6, Batch 3–9, DoD D1–D12. Per-slice files: `docs/missions/observability-agents/slices/FIX-01 … FIX-16/{SPEC,PLAN,PROGRESS,DECISIONS}.md`.

## Verdict summary
1. The predecessor's ratified set STANDS almost whole: of 144 `OBS-R` rows, **129 STAND, 13 CHANGE, 2 are REMOVED** (both already struck by V rulings) — the FixAgent is the predecessor's listener loop with the model's hands tied until V unties them.
2. Under C1 every phase-1 action is approval-first: trace → **file a ticket carrying the root** → propose → **wait**; nothing merges. The QUICK auto-merge arm becomes a policy-bundle switch `quick_arm`, born **OFF** in FIX-09, with seven V-checkable preconditions frozen in FIX-14 before V may flip it.
3. Under C4 the FixAgent consumes ONLY error-shaped input: `obs.occurrence` rows (first-party, later Hatchet run failures) and detector signals that name a code defect; stalls, blind periods and infrastructure health move to the ObservationAgent (Q2 table, diffable against REQ-OBS).
4. **Measured state corrects the intake:** `obs` schema, 15 tables and 5 roles are LIVE on the dev Postgres; `apps/runner/src/main.ts:1` already imports the installer (S06 PARTIAL, not absent); `apps/api/src/index.ts:490` already stops echoing messages on 500s; S13 build repoint is already true; ROW-GIT is resolved (3,566 tracked files, 0 phantom deletions). Still absent: `packages/obs-capture/src/runtime/**`, every emit call, `tools/obs-listener/**`.
5. **16 slices.** FIX-01 is the smallest complete proof: `pnpm job:liveness-sweep` against a database that does not exist, with a planted password, and one `docker exec … psql` query shows the row and proves the password never landed. Nine slices are parallel-safe on day one; two are V-gated by design (FIX-14 QUICK, FIX-15 Hatchet); one is held by a cross-mission collision (FIX-06 browser client vs `ui-overhaul`).
6. Three custodian acts shape slices without blocking FIX-01: RP-0 (blocks FIX-05's Done), `audit:source` V-6 (recorded, never gating), stage-16 D6 (a suspected demo-rule defect; FIX-16 exempts the manifest by construction).
7. `psql` is not on this Mac's PATH — every V acceptance step uses `docker exec debateai-v3-postgres-1 psql …`; this is written into every SPEC.

## Q1 Re-scope under V-in-charge
Legend: **STANDS** (unchanged; slice that lands it) · **CHANGES** (C1 approval-first / C4 ownership split / measured state) · **REMOVED** (struck). Predecessor row text: `research/SYNTHESIS-requirements.md` §4; rulings: `research/POST-SYNTHESIS-RULINGS.md`; D-criteria: `planning/DEFINITION-OF-DONE.md`.

| Predecessor requirement | Disposition | Why / where it lands |
|---|---|---|
| OBS-R001 new store + capture layer | STANDS | store live; FIX-01 makes capture real |
| OBS-R002 thrown AND "does not work" both covered | CHANGES (C4) | thrown → FixAgent (FIX-01..06); "does not work" → ObservationAgent |
| OBS-R003 `packages/liveness` stays the staleness owner | CHANGES (owner) | boundary is REQ-OBS's to state; FixAgent never reads it |
| OBS-R004 independent detectors (deadline breach, READY age, heartbeat, …) | CHANGES (owner) | ObservationAgent; the FixAgent consumes their typed signal (Q2 row 2) |
| OBS-R005 every job persists scheduled/started/succeeded-failed-noop with input count | STANDS | producer side stays in capture — FIX-01-R06 |
| OBS-R006 stall detection ships; reaper out of scope | CHANGES (owner) | detection → ObservationAgent; reaper stays out (§K row 15) |
| OBS-R007 closed taxonomy + severity + component | STANDS | 0034 CHECK constraints live; registry landed |
| OBS-R008 severity reuses `CONDITION_MARKS` band | STANDS | pinned Pg0-a ladder `INFO<DEGRADED<SEVERE<FATAL` |
| OBS-R009 structural component attribution | STANDS | `component` jsonb, FIX-04 `route_template` |
| OBS-R010 promotion never on model sentiment | STANDS | FIX-09 deterministic gate |
| OBS-R011 machine-readable code registry | STANDS | landed (`src/registry`, 276-code seed); RP-0 pending for 9 gap codes |
| OBS-R012 suspicious-success classes first-class | CHANGES (owner) | classes stay in the shared taxonomy; detection → ObservationAgent |
| OBS-R013 reconcile 29 declared vs 7 producible event kinds | STANDS (DECIDE-V) | §K row 4 open; carried in Q7 F-15 |
| OBS-R014 process-level capture, one-shot CLIs flush before exit | STANDS | installers landed; FIX-01-R06 flush-with-deadline |
| OBS-R015 process lifecycle recorded | STANDS | installers' boot/exit capture + FIX-07 heartbeats |
| OBS-R016 HTTP boundary records before replying incl. stream-abort | STANDS | FIX-04 |
| OBS-R017 job wrapper captures BEFORE terminal-failure write | STANDS | FIX-03-R01 |
| OBS-R018 one event per exhausted provider call | STANDS | FIX-05 |
| OBS-R019 DB-error capture via non-recursive channel | STANDS | FIX-02-R03 |
| OBS-R020 one UI reporting seam | STANDS (held) | FIX-06, dispatch held (F-7) |
| OBS-R021 capture at funnels AND enumerated catch-and-transform sites | STANDS | FIX-03/04/05 + FIX-16 inventory |
| OBS-R022 CI throw/catch/fire-and-forget inventory fails on new violations | STANDS | FIX-16 |
| OBS-R023 lint forbidding raw `throw` (SHOULD) | STANDS | FIX-16 |
| OBS-R024 idempotent, deduplicating capture (one incident) | STANDS | FIX-05 one event; FIX-09 fold |
| OBS-R025 domain refusals recorded, never paged or fixed | STANDS | FIX-09 gate excludes them from any fix path |
| OBS-R026 third-party throws captured at owned boundary | STANDS | binding slices |
| OBS-R027 subprocess stderr bounded and redacted | STANDS | FIX-12 worker stdio |
| OBS-R028 new bounded context; no columns on ledger/core tables | STANDS | 0034 live |
| OBS-R029 separate records (occurrence, incident, links, delivery, trace, actions, budget, policy, receipts) | STANDS | 15 tables live |
| OBS-R030 occurrences/actions append-only; incident reconstructable | STANDS | triggers live; FIX-09 fold is a projection |
| OBS-R031 own sequence, not `ledger.allocate_sequence()` | STANDS | `obs.occurrence_seq` live |
| OBS-R032 mandatory envelope fields | STANDS | 0034 NOT NULL set |
| OBS-R033 `build_ref` stamped at build time | STANDS | installers seed `UNTRACKED-DEV`; real identity is ARCH's (ROW-GIT now resolved) |
| OBS-R034 three-state correlation fields | STANDS | FIX-03 kinds (`UNKNOWN:DECLARED_KIND_REQUIRED` / `NOT_APPLICABLE` / ref) |
| OBS-R035 ambient correlation | STANDS | `context.ts` landed; seams in FIX-03/04/05 |
| OBS-R036 explicit causality | STANDS | FIX-02/03 |
| OBS-R037 fingerprints from code/location/class, never text | STANDS | redactor landed |
| OBS-R038 schema-invalid events to fallback sink | STANDS | redactor `fallback_minimized` |
| OBS-R039 capture status PERSISTED/SPOOLED/GAP_RECONSTRUCTED | STANDS | FIX-01 |
| OBS-R040 async write path, separate least-privilege pool | STANDS | FIX-01-R03/R09 |
| OBS-R041 pre-opened append-only spool, idempotent re-ingest | STANDS | FIX-01-R04 |
| OBS-R042 listener-serving indexes, 10× plans | STANDS | indexes live; plan check FIX-08/09 |
| OBS-R043 least-privilege roles, no DELETE | STANDS | roles live; FIX-01-R09, FIX-08-R06 |
| OBS-R044 register-ruled bounds, calibrated | STANDS | seeds per slice; V ratifies at each acceptance (F-11) |
| OBS-R045 no automated deletion absent V law | STANDS | DR-188 |
| OBS-R046 redaction once, before every sink | STANDS | landed; FIX-01 proves live |
| OBS-R047 never-store list | STANDS | FIX-01-R08, FIX-08 |
| OBS-R048 allowlist-based redaction | STANDS | landed |
| OBS-R049 no raw text in prompts or listener projection | STANDS | FIX-03-R07, FIX-12-R03 |
| OBS-R050 raw-detail field (SHOULD) | REMOVED | struck by Batch-3 row 6 (V): no free text anywhere |
| OBS-R051 normalized repo-relative frames | STANDS | landed; FIX-11 roots |
| OBS-R052 keyed pseudonyms for user/session | REMOVED | superseded by R-E4 (V): omit entirely |
| OBS-R053 no internal messages on 500s; correlation id | STANDS | partially true on dev (`index.ts:490`); FIX-04 adds the id + capture |
| OBS-R054 redaction policy version + canaries | STANDS | FIX-08 |
| OBS-R055 total, non-throwing capture path | STANDS | landed; FIX-01-R10 |
| OBS-R056 no hot-path blocking, no sync I/O | STANDS | FIX-01-R10 |
| OBS-R057 backpressure ladder | STANDS | FIX-01/07 |
| OBS-R058 fail open + counted gap + trip mutation | STANDS | FIX-07 gaps; trip in FIX-09/13 |
| OBS-R059 non-recursive health channel | STANDS | landed |
| OBS-R060 runtime disable via auditable switch | STANDS | FIX-07-R03 |
| OBS-R061 chaos acceptance (nine cases) | STANDS | FIX-08 |
| OBS-R062 `TypedDomainError` carries `cause` | STANDS | FIX-02 |
| OBS-R063 wrap preserves cause, never interpolates | STANDS | FIX-02/03 |
| OBS-R064 re-throw never replaces | STANDS | FIX-03-R02 (relocated from S07, ARCH 2026-08-26) |
| OBS-R065 swallowed error only with event id | STANDS | FIX-16 lint |
| OBS-R066 supervised fire-and-forget | STANDS | FIX-16 |
| OBS-R067 identity independent of text; joins keep all rejections | STANDS | FIX-02-R05 |
| OBS-R068 deterministic LLM-free trace, closed vocabulary | STANDS | FIX-11 |
| OBS-R069 visited set, hop limit | STANDS | FIX-11 |
| OBS-R070 indexed bounded lineage joins | STANDS | FIX-11 |
| OBS-R071 corruption flags on bad joins | STANDS | FIX-11 |
| OBS-R072 root definition | STANDS | FIX-11-R03 |
| OBS-R073 external roots never fix targets | STANDS | FIX-11/13 |
| OBS-R074 terminal non-root verdicts escalate | STANDS | FIX-11 |
| OBS-R075 trace persisted before ack | STANDS | FIX-11-R04 |
| OBS-R076 `apps/replay` never extended | STANDS | FIX-11 |
| OBS-R077 bounded retries, dead-letter | STANDS | FIX-09-R06 |
| OBS-R078 remediation order | STANDS | = FIX-01 → 02/03 → 04/05 → 16 |
| OBS-R079 durable rows first; NOTIFY as hint | STANDS | FIX-09 |
| OBS-R080 at-least-once delivery, ack after verdict | STANDS | FIX-09/11 |
| OBS-R081 cursor per occurrence; fix per incident | STANDS | FIX-09 |
| OBS-R082 LISTEN → reconcile → process | STANDS | FIX-09-R03 |
| OBS-R083 severity-then-age; poison cannot block | STANDS | FIX-09-R06 |
| OBS-R084 notification failure never fails product | STANDS | FIX-12-R05 |
| OBS-R085 Hatchet is not the error bus | STANDS | FIX-15 |
| OBS-R086 deterministic watchdog, cannot modify code | STANDS | FIX-09-R08 |
| OBS-R087 deterministic daemon + fresh CLI worker | STANDS | FIX-09/12 |
| OBS-R088 read-only diagnosis sandbox | STANDS | FIX-12-R02 |
| OBS-R089 zero idle cost; telemetry or fail closed | STANDS | FIX-09-R07, FIX-12-R07 |
| OBS-R090 DR-179 relay; lift expands no authority | STANDS | FIX-12-R10 |
| OBS-R091 placement is a config seam | STANDS | FIX-09-R11 |
| OBS-R092 three tiers, machine-checkable | CHANGES (C1) | tiers become SIZE LABELS; QUICK and PR-FIX both approval-first while `quick_arm` OFF; ESCALATE unchanged |
| OBS-R093 spine §9 floor dominates size | STANDS | FIX-09 floor deny globs |
| OBS-R094 deterministic policy gate | STANDS | FIX-09-R05 |
| OBS-R095 RED on base, GREEN after, mandatory | STANDS | FIX-13-R05 |
| OBS-R096 QUICK may add a test file | STANDS | FIX-14 shape |
| OBS-R097 allowlist empty by default | STANDS | FIX-09-R01 |
| OBS-R098 computed blast radius | STANDS | FIX-12-R04 (daemon computes) |
| OBS-R099 patch re-classified after generation | STANDS | FIX-13-R04 |
| OBS-R100 one root per fix | STANDS | FIX-13-R04 |
| OBS-R101 no test weakening; human-owned catalog | STANDS | FIX-13-R04 |
| OBS-R102 error text is untrusted data | STANDS | FIX-11/12 |
| OBS-R103 no raw text in args/SQL/paths/branches/PR fields | STANDS | FIX-11-R07, FIX-13-R06 |
| OBS-R104 never self-modify | STANDS | FIX-13 sandbox |
| OBS-R105 never invent register values | STANDS | FIX-09 deny list |
| OBS-R106 out-of-band kill switch, no DB | STANDS | FIX-10 |
| OBS-R107 supervisor-enforced caps | STANDS | FIX-12-R07 |
| OBS-R108 fix cooldown | STANDS | FIX-14 (root-keyed) |
| OBS-R109 fingerprint maturity gates fixing | STANDS | FIX-14 preconditions |
| OBS-R110 one active mutation per repo/fingerprint | STANDS | FIX-13-R02 |
| OBS-R111 every agent act appended to the store | STANDS | FIX-10/12/13 |
| OBS-R112 clean baseline, base SHA match | STANDS | FIX-13-R05 |
| OBS-R113 reserved branch namespace, bot identity | STANDS | FIX-13 (bot identity only in the remote form, F-14) |
| OBS-R114 machine-parseable PR template | STANDS | FIX-13-R06 |
| OBS-R115 QUICK never direct to `main`; auto-merge after policy approval | CHANGES (C1) | applies only when `quick_arm` ON (FIX-14); phase 1 nothing auto-merges |
| OBS-R116 auto-merge only while hashes match | CHANGES (C1) | same — FIX-14 |
| OBS-R117 PR-FIX human review + merge; agent never merges | STANDS | FIX-13-R07 — V merges |
| OBS-R118 one revertible commit | STANDS | FIX-13-R06 |
| OBS-R119 canary + exactly one automatic revert | CHANGES (C1) | exists only under `quick_arm` ON (FIX-14); phase 1 has no automatic revert |
| OBS-R120 merge ≠ deploy | STANDS | FIX-14-R04 |
| OBS-R121 notification on every auto-landing | CHANGES (C1) | phase 1: notification on every PROPOSAL (FIX-12-R05); landing notification returns with FIX-14 |
| OBS-R122 gate ladder G0–G6, fail-closed | CHANGES (C1) | ladder stands; G5 opens on V's flip, not on evidence alone (Q5) |
| OBS-R123 evidence-based gate exits; numbers V's | STANDS | Q5 |
| OBS-R124 lawful parked at report-only forever | STANDS | phase 1 IS this posture |
| OBS-R125 ops agent outside the reachability walk | STANDS | `tools/obs-listener/**` |
| OBS-R126 deterministic architecture indicators → intake | STANDS | FIX-11-R08 |
| OBS-R127 listener creates no tickets, no board mutation, no `.hermes/**` | CHANGES (D9 + V-1) | the FixAgent files ONE ticket per incident via a templated module on one board (FIX-11-R06..R08); `.hermes/**` and status changes stay forbidden |
| OBS-R128 security/privacy/persistence/spend incidents → named humans | STANDS | FIX-11 ESCALATE → V |
| OBS-R129 mission seats never push | STANDS | unchanged; the FixAgent's own push is F-14 |
| OBS-R130 no capture inside the zone | STANDS | classifier landed |
| OBS-R131 classify by producing module | STANDS | S04 landed |
| OBS-R132 zone events: opaque marker only | STANDS | R-E5 anonymous daily counter |
| OBS-R133 zone events always ESCALATE | STANDS | FIX-11-R02 |
| OBS-R134 human-owned manifest outside the zone | STANDS | landed; RP-1 re-pin pending |
| OBS-R135 do not disturb the accounts mission | STANDS | zone widened per COMMON §3 (mfa, recovery, sessions, erasure, legacy-claim, crypto, 0038–0049) |
| OBS-R136 README reconciled by amendment | STANDS | FIX-06 (S15) |
| OBS-R137 own layer regardless of Hatchet | STANDS | FIX-01 |
| OBS-R138 dual-source listener | CHANGES (C4 + Batch-3 row 14) | Hatchet RUN FAILURES → FixAgent ingest (FIX-15, behind SPIKE-D1); Hatchet INFRA health → ObservationAgent |
| OBS-R139 cross-source dedup | STANDS | FIX-15-R04 |
| OBS-R140 evidenced correlation keys | STANDS | FIX-15 |
| OBS-R141 read-only ingest; Hatchet never on capture path | STANDS | FIX-15-R06 |
| OBS-R142 same redaction for Hatchet rows | STANDS | FIX-15 |
| OBS-R143 at-least-once with gap accounting | STANDS | FIX-15-R03 |
| OBS-R144 Hatchet unknowns → ARCH/SPIKE | STANDS | FIX-15-R01 |
| R-E1 QUICK shape (≤1+1 files, ~20/50 lines, allowlist, RED→GREEN, auto-merged into `dev`) | CHANGES (C1) | shape stands as the BOUND; auto-merge deferred behind `quick_arm`; "~20" must become a register number before the flip (FIX-14-R02c) |
| R-E2 per-fix auto-merged PR into `dev` | CHANGES (C1) | FIX-14 only |
| R-BIGGER approval-first for anything above QUICK | STANDS | now universal in phase 1 (FIX-12/13) |
| R-E3 daemon + spawned Codex CLI worker; caps per calls/day + wall-clock | STANDS | FIX-09/12 |
| R-E4 no user-linked identifiers | STANDS | everywhere |
| R-E6-09 severe error → research → notify V → approval → tickets → fix | CHANGES (D9) | ticket at TRACE time (FIX-11), proposal after research (FIX-12), approval binds hash; sequence otherwise kept |
| R-E6-13 fail open + counted gap + authority trips | STANDS | FIX-07/09 |
| R-E6-10 `apps/ui` is live; build repoint | STANDS (done) | repoint already true on `dev` |
| R-E5 anonymous daily counter for zone errors | STANDS | landed (`zone/counter.ts`) |
| E6-01 merge-only | STANDS | FIX-14 |
| E6-02 custody | STANDS (amended) | single custodian V |
| E6-03 allowlist empty | STANDS | FIX-09 |
| E6-04 human + independent reviewer for agent PRs | CHANGES (C1) | phase 1: V is reviewer and merger; a second reviewer is V's option |
| E6-05 evaluator-worker | STANDS | out of scope (G5-V1) |
| E6-06 nothing schedules the scheduler jobs | CHANGES (owner) | ObservationAgent / ops |
| E6-08 listener never reads debate content | STANDS | grants live |
| E6-11 QUICK may touch UI copy/CSS if floor-clear | STANDS | when `quick_arm` ON |
| E6-12 maturity gates fixing, never capture | STANDS | FIX-14 |
| E6-14 auto-disable OR-list | STANDS | FIX-14-R06 |
| E6-16 evidenced cross-source merge | STANDS | FIX-15 |
| Batch-3 row 6 (no free text) · row 13 (deferred canary) · row 14 (Hatchet = new mission on kill) | STANDS | FIX-08 / FIX-14 / FIX-15 |
| Batch-3 row 11 QUICK keeps its no-approval property | CHANGES (C1) | suspended while `quick_arm` OFF |
| D1 break it, see it (five surfaces) | STANDS | FIX-01/03/04/05/06 (+15) |
| D2 identity plus cause chain | STANDS | FIX-03 (identity) + FIX-02 (cause) |
| D3 catch "it just doesn't work" | CHANGES (C4) | ObservationAgent |
| D4 it says when it is blind | CHANGES (C4 split) | counting and the quiet/off query stay in capture (FIX-07); ALERTING on blindness → ObservationAgent |
| D5 it cannot leak | STANDS | FIX-01 (one token) → FIX-08 (corpus, raw bytes) |
| D6 never touches the zone, machine-checked | STANDS | FIX-16 gate; stage-16 finding → Q6 |
| D7 one action turns it all off | STANDS | FIX-10 + FIX-07 (two agents ⇒ two switches, C3) |
| D8 alive and survives reboot | STANDS | FIX-09 |
| D9 files a ticket carrying the root | STANDS | FIX-11 (the agent files it — R127 amended) |
| D10 opens a PR and waits | STANDS | FIX-12 (proposal waits) + FIX-13 (PR waits; form per F-14) |
| D11 QUICK merges unattended into `dev` | CHANGES (C1) | V-flipped later phase — FIX-14 |
| D12 one scripted demo V runs | STANDS | `t_40c2cc1b` stays the narrative; ownership recommendation R-9 |

## Q2 Input contract
The FixAgent consumes **error-shaped input only**. One table, diffable against REQ-OBS's Q2: same columns, same row ids where the interface is shared.

| id | Signal | Where it lives (typed) | Producer | Consumer obligation | Owner under C4 |
|---|---|---|---|---|---|
| IF-1 | Thrown-error occurrence | `obs.occurrence` row, `source='first_party'`, `capture_point ∈ {process,http,job,provider,db,client,boundary,self}`, `taxonomy_class ∈ {PROCESS_DEATH,HTTP_FAILURE,JOB_FAILURE,PROVIDER_EXHAUSTED,DB_FAILURE,PARSE_SCHEMA_FAILURE,CLIENT_FAILURE,CAPTURE_SELF,ORIGIN_UNKNOWN}` | capture layer inside product runtimes (FIX-01..06) | FixAgent folds, traces, tickets, proposes; reads as `debateai_obs_listener`; needs: `occ_seq, code, taxonomy_class, severity, fingerprint(+version), run_ref, work_item_ref, attempt_ref, ledger_ref, parent_occurrence_ref, cause_relation, frames (normalized), safe_template_id, template_parameters, source, source_event_ref, build_ref, zone_context, attempt_index`; chain codes reachable without `occurrence_detail` (ARCH mechanism, FIX-09 DECISIONS) | FixAgent |
| IF-2 | **Detector signal naming a suspected code defect** | `obs.occurrence` row, `capture_point='detector'`, `taxonomy_class ∈ {STALL_DETECTED, SILENT_NOOP, SUSPICIOUS_SUCCESS}`, `runtime` = the affected runtime, `writer_identity='observation-agent'`, `source='first_party'`, `source_event_ref` = the ObservationAgent's idempotency key, `code` = a registry code, `component` = `{package, call_site_key}` of the suspected defect or `{}` when unknown, `severity`, `template_parameters.impact` = an enumerated impact class (never free text) | **ObservationAgent** (writes as `debateai_obs_writer` through the same redactor — zero schema change: the 0034 CHECK constraints already admit these values) | FixAgent consumes ONLY rows whose `component` names a code location; rows with `component = {}` are infrastructure — the FixAgent never wakes on them (the ObservationAgent alerts V) | shared row; ObservationAgent produces, FixAgent consumes |
| IF-3 | Capture gap (blind period) | `obs.capture_gap` rows (`source, gap_class ∈ {QUEUE_FULL, SPOOL_FAILURE, POSTGRES_FAILURE, REDACTOR_FAILURE, GAP_WRITE_FAILURE, DISABLED, client-drop}`, `lost_count`, `opened_at, closed_at`) | capture layer (FIX-01/07) | FixAgent: **authority only** — an open gap keeps mutation OFF (fail closed); it never alerts on gaps | produced by capture; consumed by BOTH (OBS alerts, FIX trips) |
| IF-4 | Capture heartbeat | `obs.component_health` rows `component='capture:<runtime>'`, `state ∈ {ARMED,SPOOL_ONLY,DRAINING,OFF,STOPPED}`, `observed_at` | capture runtime (FIX-07) | FixAgent: authority-proof input (stale ⇒ mutation OFF); ObservationAgent: blind-period detection and alert | both consume |
| IF-5 | FixAgent's own liveness | `obs.component_health` rows `fixagent-daemon`, `fixagent-watchdog`; `obs.consumer_cursor('fixagent-daemon')` | FixAgent (FIX-09) | ObservationAgent observes the FixAgent as one more process (no coupling; C3) | FixAgent produces |
| IF-6 | FixAgent actions | `obs.agent_action` (`PROPOSAL, APPROVED, DENIED, PR_PRESENTED, KILL, ARM, QUICK_ARM_CHANGED, …`), `obs.incident.state`, `obs.budget_usage` | FixAgent (FIX-10..14) | ObservationAgent may surface counts/spend to V; never acts on them | FixAgent produces |
| IF-7 | Hatchet failed/cancelled RUN records | `obs.occurrence` `source='hatchet'`, `runtime='ingest'` (FIX-15, behind SPIKE-D1) | FixAgent ingest | folded/deduped with first-party (`obs.source_link`) | FixAgent (error-shaped) |
| IF-8 | Hatchet infrastructure health (workers registered, queue depth, dispatch latency), Postgres/host metrics, product throughput | REQ-OBS's storage decision (own schema or `obs.*`) | ObservationAgent | **OUT for the FixAgent** — never read | ObservationAgent |
| IF-9 | Kill switches | FixAgent: `KILL`/`ARMED` files + `quick_arm` slot (FIX-10/14); ObservationAgent: its own | each agent | neither switch affects the other (C3) | separate |
| IF-10 | Ticket board | one dedicated Kanban board (default `fixagent`, F-2) | FixAgent writes tickets (FIX-11); V reads/moves | ObservationAgent never writes it | FixAgent |

Disagreement protocol: where REQ-OBS's Q2 table names a different transport for IF-2 (e.g., its own schema), that difference is row V-3's evidence — the FixAgent's requirement is the ROW SHAPE above, not the table name; REQ-SYNTH reconciles or escalates.

## Q3 Vertical slices
Files created for every slice (Q4): `slices/FIX-nn/SPEC.md` (frozen), `PLAN.md` (scaffold: SPEC→PLAN trace with one row per requirement, quantifiability law, cluster headers), `PROGRESS.md` (empty skeleton), `DECISIONS.md` (13 common seeds + slice-specific rulings). Test partition: `tests/<suite>/fix<NN>-*.test.ts(x)`.

| Code | Name | Absorbs (S-tickets) | D-criteria | Seam obligations | V acceptance in one line | Parallel-safe with (files) · must NOT overlap | Gate · dispatch |
|---|---|---|---|---|---|---|---|
| FIX-01 | First row — scheduler surface | S05b `t_3a04cc06` · S10 `t_6c5e1a6e` | D1, D4(part), D5(part), D6 | O-1..O-4 | `pnpm job:liveness-sweep` against a nonexistent database with a planted password exits 1; one `docker exec psql` query shows the new `scheduler/job/PERSISTED` row and zero copies of the password | all except FIX-07 (same `src/runtime/**`) | G1 · now |
| FIX-02 | Root survives the wrapper | S07 `t_9f4e5bfb` (kernel + db regions) | D2 (cause) | — | the same fault's row shows ≥2 chain codes and `cause_relation` non-null; `console.error` gone from `createPool` | all (no overlap) | G1 · now; accept after FIX-01 |
| FIX-03 | Runner job surface + identity | S06 `t_5504afe0` (remainder) · S03c (kinds) · S07 repair-packet region · OBS-R064 | D1, D2 (identity), D6 | — | a debate against an unreachable provider fails; its runner rows carry real `run_ref`/`work_item_ref` that join `obs.run_correlation_v`; the original error is re-thrown, never replaced | all (no overlap) | G1 · now; accept after FIX-01 |
| FIX-04 | API request surface | S08 `t_c1651ebb` + §4A context hook | D1, D2 (identity on 3 routes), D6 | — | a 500 returns `{error, correlation_id}` with no message; the id resolves to an `api/http` row; the zone-mount block is absent from the diff | all except FIX-06 (same `apps/api/src/index.ts`) | G1 · now; accept after FIX-01 |
| FIX-05 | Provider call surface | S11 `t_7efcd635` + `attempt`/`ledger_entry` kinds | D1, D2 | — | one exhausted call → exactly one `provider/PROVIDER_EXHAUSTED/PROVIDER_CALL_FAILED` row with run/attempt/ledger refs; the planted question line is nowhere | all (no overlap) | G1 · now; Done waits on RP-0 |
| FIX-06 | Browser client surface | S09 `t_3c54fdeb` · S15 | D1, D5 | — | a real client fault posts only enumerations; an unknown member is rejected 400; flooding yields 429 + a counted gap row | overlaps FIX-04 (api index.ts) and `ui-overhaul` (`apps/ui`) | G1 · HELD (F-7, after FIX-04) |
| FIX-07 | Blind-period visibility + capture OFF | D4 remainder · OBS-R060 | D4, D7 (capture half) | O-1..O-4 | one query labels each runtime QUIET / OFF / BLIND correctly after V stops the stack; the OFF switch suppresses rows but writes `DISABLED` gap rows | all except FIX-01 | G1 · after FIX-01 merges |
| FIX-08 | Secrets never stored + nine chaos cases | S16 `t_aab2d3d2` (G1 families; acc-1 replaced) | D5, D1, D4, D6 | — | one acceptance command prints PASS per case; V pastes the printed byte-search and gets 0; DB-down case shows `lost = 0` | all (no overlap) | G1 exit · now; accept after FIX-01 |
| FIX-09 | Listener alive | S17 `t_f6593842` · S18 `t_220330f5` · S21 `t_0cd47a46` · S25 `t_af6161bf` (+ `quick_arm=OFF` slot) | D8 | — | `launchctl` shows daemon + watchdog; a FIX-01 fault advances `obs.consumer_cursor` and creates one `obs.incident`; `kill -9` → back in 10 s; zero `budget_usage` rows | all product slices, FIX-10, FIX-11, FIX-16 · FIX-12 waits | G2 · now |
| FIX-10 | One switch | S22 `t_37f2f56f` | D7 | — | `obsctl kill` stops daemon + capture within 5 s with Postgres down; the job still runs identically; `obsctl arm` restores; mutation stays OFF | all · FIX-12 waits (adds obsctl regions) | G2 · now; accept after FIX-07/09 |
| FIX-11 | Root traced, ticket filed | S19 `t_f4439c53` · S28 board-write mechanics | D9, D2 | — | within 10 s of the fault one ticket appears on board `fixagent` naming the root (`path:symbol` or boundary) with no raw text; a repeat adds one comment, not a ticket | all (own subtrees) | G2 · now; accept after FIX-09 |
| FIX-12 | Diagnosis proposal, notify, approve/deny | S27 · S18b · S23 (ids not in the D12 log) · S28 `t_28c5c2e2` regions · RP-3 corpus | D10 (half), D9 | — | a macOS notification names the proposal; `obs.agent_action` holds it with a hash; `obsctl approve` binds it; `git status`/branches unchanged; injection drill 0 violations | product slices, FIX-11, FIX-16 · waits FIX-09 + FIX-10 | G3 · after FIX-09/10 |
| FIX-13 | Approval-first fix; it waits | S29 `t_8cf81861` | D10 | — | one `fixagent/<hash>` branch with one commit; RED-on-base and GREEN pasted on the ticket; `dev` unchanged until V merges; kill mid-flight leaves no branch; forge fixture CONTAINED | product slices, FIX-16 · waits FIX-12 | G4 · after FIX-12 + G4 entry acts |
| FIX-14 | QUICK arm behind V's switch | S30 `t_af2a1c41` | D11 | — | OFF: a QUICK label still waits (FIX-13 path). ON (V's re-pin only): one QUICK fix lands in `dev` UNVALIDATED, above-bound refused, one revert then escalation | dispatched alone | G5 · GATED on V flip |
| FIX-15 | Hatchet failed-run ingest | S24 (id not in log) · RP-2 `t_fbefa222` · SPIKE-D1 | D1 (second source) | — | `kill -9` the runner mid-task → Hatchet FAILED → a `hatchet/ingest` row within the poll interval, linked to its first-party twin if any; no log text stored | all (own subtree) | G2 · GATED on SPIKE-D1 pass |
| FIX-16 | CI inventory gate + D6 machine check | S12 `t_a0ce760a` (S13 already true) | D6, D2 | — | `pnpm audit:obs-inventory` PASSes the baseline, FAILs a scratch bare-catch and a scratch zone import with `path:line`, and never touched a zone file | all (own subtree; root `package.json` lint line) | G1 tail · accept after FIX-02..05 |

Handed to the ObservationAgent (not FIX slices, boundary in Q2): S20 detectors · S14 product-runtime launchd witnesses · E6-06 scheduling · alerting V on blind periods. Folded: S26 listener acceptance → FIX-09/11/12 §5. Done already on `dev`: S13.

Day-one parallel set (nine worktrees): FIX-01, FIX-02, FIX-03, FIX-04, FIX-05, FIX-08, FIX-09, FIX-10, FIX-11 (+ FIX-16 if capacity). Second wave: FIX-07 (after FIX-01), FIX-06 (after FIX-04 + F-7), FIX-12 (after FIX-09/10). Third: FIX-13. Gated: FIX-14, FIX-15.

## Q5 Phase gates
Restated as V-observable checkpoints. Demo stage numbers refer to `logs/d12-demo-2026-09-01.log` (today: PASSED 6 / FAILED 1 / SKIPPED 21).

| Gate | V observes (after these slices are vetoed) | D-criteria proved | Demo stages SKIPPED → PASSED |
|---|---|---|---|
| **G1 capture** | FIX-01 (+02, 03, 04, 05, 07, 08, 16; 06 when released): a fault on each surface is one row; the cause chain and real ids are in the row; the planted corpus is absent from raw bytes; one query says QUIET/OFF/BLIND; `pnpm audit:obs-inventory` guards the tree | D1, D2, D4, D5, D6 (machine-checked), D7 (capture half) | 02 (store live — `OBS_DEMO_DATABASE_URL` set), 03, 04, 05 (FIX-04), 06 (FIX-03), 07 (FIX-05), 08 (FIX-01), 09 (FIX-06), 11 (FIX-03), 12 (FIX-02), 14 (FIX-07), 15 (FIX-08), 17 (zone-fault driver — demo revision), **16 FAILED → PASSED on AUDIT-STATE's ruling (Q6)** |
| **G2 listener** | FIX-09, FIX-10, FIX-11 (+15 if SPIKE-D1 passes): daemon and watchdog under launchd; `kill -9` recovers; cursor follows every fault; one ticket per incident naming the root; `obsctl kill` stops everything and the product does not notice | D7, D8, D9 | 18 (FIX-10), 19 (FIX-09), 20 (FIX-11) |
| **G3 dispatch** | FIX-12: a proposal exists, V is notified, approval binds a hash, nothing lands; injection drill clean | D10 (proposal waits) | 21 (first half: "a proposal that STOPS") |
| **G4 approval-first fixes** | FIX-13: after V's approval a branch/PR with RED→GREEN evidence is presented and WAITS; V merges | D10 (fully) | 21 (fully) |
| **G5 QUICK** — **V-flipped** | FIX-14, only after `quick_arm` ON: unattended QUICK landing into `dev`, above-bound refused, deferred canary, exactly one revert | D11 | 10 (numbers ratified — a G5 precondition), 22, 23 |
| G6 steady state | no new slice; quarterly re-drill of kill/trip/injection; deferral flags reviewed | — | — |

Rollback law stands (RT-36): a capture/audit/policy regression ⇒ mutation OFF regardless of gate; G1–G2 machinery never darkens.

## Q6 Custodian acts and their slices
| Pending act | Slice(s) it blocks or shapes | What the slice does if V has not ruled by dispatch |
|---|---|---|
| **RP-0** `t_4deda7ab` — ratify the `declared_gap` hash (9 codes) | Shapes **FIX-05** (its Done needs `PROVIDER_CALL_FAILED` registered) and the honesty of every code in FIX-01..04 (unregistered codes land as `OBS_CAPTURE_SELF`, `fallback_minimized=true`) | Dispatch anyway; every acceptance step that reads `code` records the observed value and marks `UNVERIFIED — RP-0 unratified` where it is the minimized code; FIX-05 Done waits. Row V-5 carries it; AUDIT-STATE posts an independent derivation |
| **`audit:source` collision** `t_d821f99e` (V-6) | Shapes **FIX-01** (adds `runtime/config.ts`, `sink.ts` rows), FIX-09..15 (every env-reading listener file) | `pnpm lint` is NOT a Done criterion; each handoff pastes the `blocking` array verbatim; no seat touches `tools/orphan-audit/**` (floor-deny). Recommendation: option (A) now |
| **Stage-16 D6 finding** (demo rule flags the zone manifest) | Shapes **FIX-16** (the gate must exempt manifest path strings by construction) and **FIX-08** (D6 evidence); the demo file itself is `t_40c2cc1b`'s | FIX slices treat the manifest as lawful path-string data (predecessor GLOBAL-FORBID text); the demo's rule is `UNVERIFIED — suspected checker defect` until AUDIT-STATE charge D rules; no FIX slice edits the demo |
| RP-1 zone manifest re-pin · RP-2 `hatchet_ingest` · RP-3 injection corpus hash | RP-1: FIX-09 bundle slot; RP-2: FIX-15 dispatch; RP-3: FIX-12 acceptance | Slots stay explicitly UNSET with their gate id (FIX-09-R01); FIX-15 not dispatched; FIX-12 dispatches but its injection acceptance step is `PENDING RP-3` |
| SPIKE-D1 (half-day read-only, G2 entry) | FIX-15 | not dispatched; on kill → deferral posture (Batch-3 row 14) |
| G4 entry acts (branch protection, bot identity, ruleset hash — remote form only) | FIX-13 | default local form (F-14) needs none of them; the remote form waits |

## Q7 Contested decisions for V
Collected, not asked. Rows V-1, V-3, V-5, V-6 already exist on `V-DECISIONS-PACKET.md` and are cited, not duplicated.

| id | Question in plain words | Options | Pick | Conf. | Strongest counter |
|---|---|---|---|---|---|
| F-1 | How does the ObservationAgent hand a suspected code defect to the FixAgent? | (a) an `obs.occurrence` row with `capture_point='detector'` (zero schema change) · (b) a new `obs.signal` table · (c) a file/queue outside Postgres | (a) | high | writing into the same table weakens "standalone"; answer: C3 defines standalone at the process level, and 0034 already reserved `detector` for exactly this |
| F-2 | Which board does the FixAgent write tickets to, and how many per incident? | (a) a dedicated board `fixagent`, one ticket per incident, comments for recurrences · (b) the mission board · (c) tickets only after V approves (predecessor R127/S28) | (a) | high | (c) keeps the daemon board-blind; but D9 and V-1's text say the agent files the ticket, and a dedicated board contains the blast radius |
| F-3 | Which surface is FIX-01? | (a) scheduler one-shot CLI · (b) runner job · (c) API request | (a) | high | the scheduler jobs are not scheduled today (E6-06) so it is the least "live" surface; answer: FIX-01 proves the pipeline, FIX-03/04 prove the live surfaces in parallel |
| F-4 | What is the QUICK switch? | (a) a bundle slot `quick_arm` re-pinned by V alone · (b) an env var · (c) a register row | (a) | high | a bundle re-pin is heavier than a flag; that weight is the point — it is audited and single-custody |
| F-5 | Keep three tiers in phase 1? | (a) keep QUICK/PR_FIX/ESCALATE as size labels, all non-ESCALATE approval-first · (b) collapse to PROPOSE/ESCALATE | (a) | high | labels nobody acts on rot; answer: V asked the agent to "size the fix", and the labels are what FIX-14 later acts on |
| F-6 | Which model codes the fix worker? | (a) Codex CLI relay (matches coders, R-E3) · (b) Fable subagent · (c) any, adapter-swappable | (a) now, (c) as the seam | medium | Fable reviews; a Fable coder would put author and reviewer in one house |
| F-7 | Dispatch FIX-06 (browser client) while `ui-overhaul` has 111 uncommitted `apps/ui` entries? | (a) hold until ui-overhaul lands · (b) dispatch in a worktree, take merge conflicts (spine v3.4.0 item 6) | (a) | medium | item 6 says shared-file fear does not serialize slices; answer: that law covers slices of ONE mission on committed state, not another mission's uncommitted tree |
| F-8 | Who watches the FixAgent's liveness? | (a) its own watchdog (S21) plus the ObservationAgent observing it as a process · (b) ObservationAgent only | (a) | high | two watchers is redundancy cost; answer: standalone means it can be killed and restarted without the other agent |
| F-9 | Who maintains the D12 demo now? | (a) a non-implementer seat updates it per gate (adversarial authorship kept) · (b) slice acceptance steps replace it · (c) implementers update it | (a) | medium | (b) is cheaper; answer: the demo is the only artifact V reads end-to-end |
| F-10 | Hatchet failed-run records — whose input? | (a) FixAgent ingest (error-shaped), infra health to OBS · (b) all Hatchet to OBS · (c) both ingest | (a) | medium | Hatchet is infrastructure; answer: a FAILED run is an error about product code and dedups with our row |
| F-11 | How are the numeric seeds ratified? | (a) per slice at V's acceptance · (b) one G1 calibration ceremony (predecessor §K row 1) | (a) | medium | per-slice ratification fragments the register; answer: V is testing each slice anyway |
| F-12 | Confirm the narrowing "each error traceable to root" → "each error whose root lies outside the security zone" (terminal `ZONE_BOUNDARY`) | (a) confirm · (b) zone roots named by code only | (a) | high | V's sentence says "each"; answer: V's own exclusion of the W.I.P. features implies it |
| F-13 | Phase-1 notification channel for proposals | (a) macOS notification + ticket comment; sendmail optional · (b) email only · (c) board only | (a) | medium | notifications are lost when the Mac sleeps; answer: the ticket comment is durable |
| F-14 | What is a "pull request" in phase 1, given pushes are V-gated and `dev` is 86 commits ahead of origin? | (a) local branch + template on the ticket, V merges locally · (b) remote PR into `dev` under a bot identity | (a) | medium-high | D10 says "pull request"; answer: (a) keeps every D10 property (proposes, waits, V decides) without a push the repo's law forbids; (b) becomes lawful the day V says so |
| F-15 | E6-15: 29 declared vs 7 producible event kinds — prune or widen? | (a) prune the 3 error-shaped members (FinalPlan H.1) · (b) widen | (a) | medium | pruning removes UI branches; answer: they are unreachable today |

## Ranked recommendations
1. **Dispatch FIX-01 first and alone for the first hour, then the eight parallel slices.** VERDICT: the pipeline's one central defect (drop-everything queue) is proven fixed before anyone builds on it. CONFIDENCE high. COUNTER: an hour of serialization; accepted, it is the smallest complete proof.
2. **Rule F-14 before FIX-13 is architected.** VERDICT: local-branch PR form for phase 1. CONFIDENCE medium-high. COUNTER: V may want GitHub PRs for review tooling.
3. **Adopt option (A) on V-6 now.** VERDICT: a named-file exemption keeps `audit:source` meaningful and unblocks `pnpm lint` as a signal. CONFIDENCE medium. COUNTER: hand-maintained set drifts; revisit (C) when the ObservationAgent needs validated config.
4. **Ratify RP-0 this week.** VERDICT: it gates FIX-05's Done and the honesty of provider codes everywhere. CONFIDENCE high. COUNTER: none — it is a one-liner V runs.
5. **Keep every number a labelled seed until V ratifies it at the slice's acceptance** (F-11). VERDICT: no tilde ever reaches a criterion. CONFIDENCE high. COUNTER: register fragmentation.
6. **Give the ObservationAgent the three detector families and both liveness witnesses** (S20, S14). VERDICT: one owner per signal class. CONFIDENCE high. COUNTER: REQ-OBS may size them differently — that is row V-3's evidence.
7. **Hold FIX-06 until V rules F-7.** VERDICT: do not fight another mission's uncommitted tree. CONFIDENCE medium. COUNTER: the browser surface stays dark longer; client errors are fix-ineligible anyway.
8. **Author the injection corpus (RP-3) during G1**, by an independent QA seat. VERDICT: it is on FIX-12's critical path and needs no code. CONFIDENCE high. COUNTER: corpus authored before the worker exists may miss its real tool surface; the scorer is deterministic, so extend later.
9. **Keep the D12 demo as V's narrative, revised per gate by a non-implementer** (F-9), and let AUDIT-STATE's charge D settle stage 16 before anyone edits it. CONFIDENCE medium. COUNTER: duplication with slice §5 steps.
10. **Re-run the D12 demo with `OBS_DEMO_DATABASE_URL` set after FIX-01 lands** — stage 02 turns PASSED with no code. CONFIDENCE high. COUNTER: none.

## UNVERIFIED / gaps
- U-F1 Whether the runner mis-wiring (`JUDGEMENT_POLICY_UNRESOLVED`) is fixed: `apps/runner/src/main.ts:97` wires `judgementPolicy`, but no runtime was executed by this seat — UNVERIFIED-as-fixed; FIX-03/08 use a real failed run instead.
- U-F2 Ticket ids for S27, S18b, S23, S24 — not present in the D12 log or the packet; the orchestrator/AUDIT-STATE resolve them before FIX-12/15 tickets are minted.
- U-F3 Whether `debateai_obs_writer` holds UPDATE on `obs.component_health` (FIX-07 heartbeat upsert) — the 0034 grant block was not read line-by-line; ARCH confirms or specifies append-only.
- U-F4 How the tracer reaches chain codes given the listener role is denied `occurrence_detail` — ARCH mechanism (linked occurrences vs a listener-readable projection).
- U-F5 The exact real client-side fault V can cause in unmodified `apps/ui` code (FIX-06 §5 step 2) — ARCH names the site with `path:line`.
- U-F6 The 0-byte dead-pid spool file rule (S05b carry-forward) — ARCH states it in FIX-01 PLAN.
- U-F7 The obs-lane-3 worktree's uncommitted S06 work vs `e8d99d33` — AUDIT-STATE charge E; this seat found the checkpoint commit merged (`1c9578a2`) and no emit call in `apps/runner/src/index.ts`.
- U-F8 `pnpm audit:source` current `blocking` array length — not run by this seat (AUDIT-STATE charge C runs it); the ticket `t_d821f99e` says 4 rows on 2026-08-27 in lane 2.
- U-F9 Whether `sendmail` is configured on this Mac — FIX-12 makes it optional.
- U-F10 `fixagent-state-audit.md` did not exist when this file was written; nothing here waited for it (packet §2 item 8).
