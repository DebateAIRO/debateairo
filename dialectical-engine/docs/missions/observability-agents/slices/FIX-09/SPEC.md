# FIX-09 — The listener is alive: a permanent, restart-surviving, LLM-free daemon folds rows into incidents and V can see it breathing

**FROZEN at creation — 2026-09-01, seat REQ-FIX (Fable 5.1). No agent edits this file. Scope changes are a new SPEC version ratified by V.**
Gate: **G2 listener** · Depends-on for dispatch: none (new tree `tools/obs-listener/**`) · Depends-on for acceptance: **FIX-01 merged** (rows to consume).
Absorbs predecessor tickets: **S17 `t_f6593842`** (policy bundle format/loader + Pg0-a data: tier rules, floor path-glob deny list, EMPTY allowlist, taxonomy pin, severity map, routing table, register seeds; the three deferred slots `zone_manifest_hash`/`hatchet_ingest`/`injection_corpus_hash`; PLUS a new slot `quick_arm` default `OFF` — C1) · **S18 `t_220330f5`** (obs-daemon deterministic core: first-party intake, incident fold, dedup, deterministic tier gate used for SIZING only in phase 1, cursor, LISTEN, backlog order, poison isolation, authority-proof refresh; dispatch OFF) · **S21 `t_0cd47a46`** (watchdog: daemon heartbeat, cursor lag, keyed audit-chain verification + witness log) · **S25 `t_af6161bf`** (launchd KeepAlive for daemon + watchdog). NOT absorbed (C4 → ObservationAgent): **S20** detectors, **S14** product-runtime KeepAlive witnesses. S26's listener acceptance items are folded into §5 here and into FIX-11/12.
D-criteria evidenced: **D8** (alive, restarts, externally observable). Prepares D9/D10.
Seam obligations: O-3's spirit binds — the daemon never writes to any runtime's spool file; it reads the store only as `debateai_obs_listener` (session-mode connection, no pooler — U-07).

## 1. Intent
V's sentence: "an agent that sits in a permanent loop and listens for the moment errors are thrown." FIX-09 is that loop with the model switched OFF: a deterministic daemon that wakes on `LISTEN/NOTIFY`, reconciles its cursor, folds occurrences into incidents by fingerprint and work unit, sizes each incident with the deterministic tier gate (a LABEL in phase 1 — every non-ESCALATE incident is approval-first, C1), and proves it is alive from the outside. The QUICK switch is born here, OFF.

## 2. Requirements
- **FIX-09-R01** `tools/obs-listener/policy/**` holds the bundle: format + loader; floor deny list as path globs (security zone manifest paths, `migrations/**`, `packages/crypto/**`, scoring arithmetic/served-number writers, spend config, dependency manifests, register seeds, compose/env/CI/deploy files, `tools/**`, protocol docs, board state, obs' own code); allowlist EMPTY; taxonomy pin; severity ladder `INFO < DEGRADED < SEVERE < FATAL`; routing table; register seeds; slots `zone_manifest_hash`, `hatchet_ingest`, `injection_corpus_hash` present and explicitly UNSET with their re-pin gate ids; slot `quick_arm = OFF`.
- **FIX-09-R02** Bundle hash is reproducible from its inputs by a party who never saw the loader (content pinned via a canonical projection, Pg0-b); a re-pin without the single custodian's token fails in drill; the bundle records exactly ONE custodian (E6-02 as amended 2026-08-22).
- **FIX-09-R03** The daemon consumes `obs.occurrence` as `debateai_obs_listener` over `OBS_LISTENER_DATABASE_URL`; startup and every reconnect do LISTEN → reconcile cursor → process; `LISTEN/NOTIFY` carries `occ_seq` only as a wake hint; the cursor row `obs.consumer_cursor('fixagent-daemon')` advances only after the occurrence is folded.
- **FIX-09-R04** Incident fold is a deterministic re-derivable projection: one `obs.incident` per `(fingerprint, fingerprint_version)`; `distinct_work_unit_count` counts distinct `(run_ref, work_item_ref)` pairs (never rows); state machine `NEW → RESEARCHING → PROPOSED → APPROVED → TICKETED → FIXING → FIXED_UNVALIDATED → FIXED_VALIDATED | REGRESSED`, plus `ESCALATED`, `PARKED`; `source_set` records sources; `ui_client` rows fold but are flagged fix-ineligible.
- **FIX-09-R05** The tier gate is deterministic, non-LLM, input-hashed (`obs.policy_decision` rows re-evaluate bit-identically); its output in phase 1 is a SIZE LABEL `{QUICK, PR_FIX, ESCALATE}` plus the floor verdict; ESCALATE (floor path, zone, unknown class, external root) never enters any fix path; QUICK and PR_FIX both route to approval-first while `quick_arm = OFF`.
- **FIX-09-R06** Backlog order is severity-then-age; concurrency is capped; a poison occurrence cannot block the cursor (dead-letter + human notification via FIX-12's channel; until then a `component_health` row `state = 'POISON'`).
- **FIX-09-R07** Zero model calls: `obs.budget_usage` receives no rows from the daemon; the daemon has no model adapter linked (resolve-hook trace shows no CLI spawn module).
- **FIX-09-R08** The watchdog is a separate process as `debateai_obs_watchdog`: verifies the daemon heartbeat, cursor lag, and the keyed hash chain of `obs.occurrence.prev_link`/`obs.agent_action.prev_link`; passes on real histories and FAILS LOUDLY on a seeded forged link; appends chain heads to an append-only witness log on the ops volume; can trip, can never modify code.
- **FIX-09-R09** launchd `KeepAlive` plists for daemon and watchdog exist under `tools/obs-listener/launchd/**`, distinct files, validated by `plutil -lint`; after `kill -9` of either process it is running again within `obs.daemonRestartMs` (seed 10 000 ms; number V's).
- **FIX-09-R10** Both processes upsert `obs.component_health` rows (`fixagent-daemon`, `fixagent-watchdog`) each cycle, so V's FIX-07 query covers them.
- **FIX-09-R11** Configuration is a seam: Postgres URLs per role, spool/proof/key paths, CLI binary path, worktree path — V's Mac now, a server later; the daemon holds no product credential and no `@debateai/db` import.
- **FIX-09-R12** Dispatch arm ABSENT (FIX-12); mutation ABSENT (FIX-13); `quick_arm` OFF (FIX-14).
- **FIX-09-R13** A green suite is a milestone; Done is V's veto after §5.

## 3. States
Daemon: `STARTING → LISTENING → RECONCILING → PROCESSING ⇄ IDLE → STOPPED(kill) → (launchd) STARTING`. Incident: as R04. Cursor: `last_occ_seq` monotonic.

## 4. Copy and vocabulary
"daemon" (the permanent deterministic loop) · "fold" · "incident" (one fingerprint) · "work unit" · "size label" (QUICK/PR_FIX/ESCALATE — a label, not an authority, in phase 1) · "quick_arm" (the V-flipped switch). Never "the agent decided" for anything the gate did.

## 5. Acceptance — V runs this personally (FIX-01 merged)
1. Install per the slice README (`launchctl bootstrap gui/$(id -u) tools/obs-listener/launchd/<daemon>.plist`, same for watchdog) → `launchctl list | grep -i obs` → two entries with PIDs.
2. `docker exec debateai-v3-postgres-1 psql -U debateai -d debateai -At -c "SELECT last_occ_seq FROM obs.consumer_cursor WHERE consumer='fixagent-daemon'"` → an integer C.
3. Run FIX-01 step 4's failing job → within 5 s the same query → `> C` and equal to `SELECT max(occ_seq) FROM obs.occurrence`.
4. `docker exec debateai-v3-postgres-1 psql -U debateai -d debateai -At -c "SELECT state, distinct_work_unit_count, max_severity, source_set FROM obs.incident WHERE fingerprint = (SELECT fingerprint FROM obs.occurrence ORDER BY occ_seq DESC LIMIT 1)"` → `NEW|1|SEVERE or FATAL|["first_party"]`; run the job again → `distinct_work_unit_count` stays `1`? NO — the scheduler has no run/work item, so each run is its own work unit: it becomes `2`; the row count in `obs.incident` for that fingerprint stays `1`.
5. `docker exec debateai-v3-postgres-1 psql -U debateai -d debateai -At -c "SELECT decision FROM obs.policy_decision ORDER BY evaluated_at DESC LIMIT 1"` → a size label and floor verdict (e.g. `PR_FIX|FLOOR_CLEAR`); `SELECT count(*) FROM obs.budget_usage` → `0`.
6. `kill -9 $(launchctl list | awk '/obs-daemon/ {print $1}')` → within 10 s `launchctl list | grep obs-daemon` shows a NEW pid; step 3 still works afterwards.
7. `docker exec debateai-v3-postgres-1 psql -U debateai -d debateai -At -c "SELECT component, state, observed_at FROM obs.component_health WHERE component LIKE 'fixagent-%'"` → two rows, `observed_at` within the last cycle.
8. Forged link (test drill run by V): `pnpm exec vitest run tests/integration/fix09-watchdog-chain.test.ts` → the seeded-forgery case prints `CHAIN_BREAK` and the suite passes because the break was DETECTED.
V vetoes Done only after steps 1–8 match.

## 6. Out of scope
Stall/no-op/suspicious-success detectors (ObservationAgent) · tracer and tickets (FIX-11) · notifications, proposals, dispatch (FIX-12) · any mutation (FIX-13) · QUICK (FIX-14) · Hatchet ingest (FIX-15) · `obsctl` (FIX-10).

## 7. File surface (single-writer) and parallel safety
Allowed: `tools/obs-listener/policy/**`, `tools/obs-listener/src/daemon/**` (excluding the `dispatch-arm` region reserved for FIX-12), `tools/obs-listener/src/watchdog/**`, `tools/obs-listener/launchd/**`, `tools/obs-listener/README.md` · tests `tests/unit/fix09-*.test.ts`, `tests/integration/fix09-*.test.ts`.
Read-only: `obs.*` via the listener/watchdog roles · `packages/obs-capture/src/registry/**` · `compose.dev.yaml`.
Forbidden: any product source · `tools/obs-listener/src/{obsctl,trace,board,notify,worker-diagnosis,worker-fix,landing,ingest-hatchet}/**` (other slices) · `occurrence_detail`, `identity.*`, raw `core.run` · populating any deferred slot (custodian acts).
Parallel-safe with: every product slice (FIX-01..08), FIX-10, FIX-11, FIX-16. FIX-12 must wait (dispatch-arm region inside `src/daemon/**`).
