# SPEC — OBS-03 Stall, queue, progress detectors + FixAgent interface

**Status:** FROZEN at creation (2026-09-02, REQ-OBS-FINISH projection); amended 2026-09-02 for reviewer-authorized REQ-REV-OBS round-1 findings B2/B6/N3 and controller-authorized round-3 cleanup of REQ-REV-OBS-r2 N9. The original contradictions remain recorded below and every superseding choice is appended to DECISIONS.

**Mission:** `observability-agents` · **Product:** ObservationAgent · **Traces to:** `requirements/observationagent.md` Q1 rows 4, 6 and 15 · Q2 suspected-defect table · Q3 worker/stall/queue/no-progress budgets · Q4 G3/G12 · Q6 safe views · Q7 OBS-03. Builds on OBS-01 and OBS-02.

**Measured source:** frozen `dev @ 4f764037` requirements; present tree state from `requirements/fixagent-state-audit.md` §A/§C says runtime capture is absent, the runner binding is partial, and repo typecheck has eight pre-existing errors in `tests/unit/s14-ui.test.ts`.

## Intent

Detect a runner that stops heartbeating, claimed work that passes its deadline, READY work that does not drain, in-flight runs that stop progressing, and terminal success without the required artifact. Publish only defect-shaped, infrastructure-healthy signals through the read-only `observation.defect_signal_v` interface so the standalone FixAgent never needs the ObservationAgent's role or process.

## Ground truth this SPEC rests on (do not re-litigate)

- Runner readiness is one IPC message; external liveness must use Hatchet heartbeat age, not `Worker.isActive`, which remained true four hours after the last measured heartbeat (`requirements/observationagent.md:26,231`).
- `core.work_item` carries `state`, `claimed_by` and `claim_deadline`; `core.run_progress_event` carries `run_id`, `at_seq` and `kind` (`requirements/observationagent.md:28`). Exact in-flight state literals remain UNVERIFIED until Architecture pins them from `packages/battery` (`requirements/observationagent.md:241`).
- The detector truth table is binding: a deadline breach is defect-shaped only while runner heartbeat, Postgres and Hatchet are healthy; otherwise infrastructure signals replace it (`requirements/observationagent.md:68-78`).
- Product facts reach the agent only through security-barrier projections in `obs`; detector queries run under `statement_timeout = 2000` and must take ≤ 100 ms at 10× today's rows (`requirements/observationagent.md:166`).
- Hatchet facts come from REST with a V-minted read token in phase 1; direct reads of the `hatchet` database are forbidden (`requirements/observationagent.md:118,196`).

## Requirements

### OBS-03-R01 — Safe product projections (migration `observation_safe_views`)
One migration whose number the orchestrator allocates creates `obs.work_item_liveness_v` and `obs.run_progress_v` as `security_barrier` views owned by `debateai_obs_view_owner`. They expose only UUIDs, states, sequence values and timestamps needed by this slice: work-item id, run id, state, claimed-by presence, claim deadline, settled-artifact presence, and the latest progress sequence/kind. They expose no question text, error text, payload, user/session/asker id, raw artifact text, ciphertext or metadata JSON. `debateai_observation_agent` gets `SELECT` on the two views and no privilege on `core.*` or `ledger.*`.

### OBS-03-R02 — Runner heartbeat detector
Module `stall-detectors` polls Hatchet's REST worker list every 10 s with the read token loaded from `OBSERVATION_HATCHET_TOKEN_PATH`. It identifies `debateai-dev-runner` and opens `WORKER_LOST` when `lastHeartbeatAt` is more than 30 s old; total fault-to-notification budget is ≤ 45 s. Missing token or unreadable worker facts make the detector `UNKNOWN` with `evidence.reason=HATCHET_READ_UNAVAILABLE`; they never make the runner healthy and never trigger a FixAgent row.

### OBS-03-R03 — Claim-deadline stall detector
Every 15 s, a non-terminal work item whose `claim_deadline < now() - interval '15 seconds'` opens one `STALL` signal only when the runner heartbeat is fresh and Postgres and Hatchet are UP. The signal has `suspected_defect=true`, `defect_kind=STALL_DETECTED`, and the matching `run_ref` and `work_item_ref`. If any health predicate is false, no STALL signal opens; the matching infrastructure signal owns the event.

### OBS-03-R04 — Queue-not-draining detector
Every 15 s, a READY item observed for at least 120 s while a runner heartbeat is fresh opens `QUEUE_NOT_DRAINING` with `suspected_defect=true`, `defect_kind=STALL_DETECTED`, `run_ref` and `work_item_ref`. The first-observed timestamp comes from the bounded sample ring, not from an invented product timestamp. It clears when the item leaves READY or the runner becomes unhealthy; an unhealthy runner opens `WORKER_LOST` instead.

### OBS-03-R05 — No-progress detector
Every 15 s, a run with at least one in-flight work item and no increase in its maximum `run_progress_event.at_seq` for 300 s opens `NO_PROGRESS` only while runner, Postgres and Hatchet are UP. It sets `suspected_defect=true`, `defect_kind=SILENT_NOOP`, and `run_ref`; it clears on a higher progress sequence, on terminal run state, or when the health predicate becomes false.

### OBS-03-R06 — Suspicious-success detector
A terminal `DONE` work item whose settled artifact reference required by the battery contract is absent opens `SUSPICIOUS_SUCCESS` with `suspected_defect=true`, `defect_kind=SUSPICIOUS_SUCCESS`, `run_ref` and `work_item_ref`. The detector reads only artifact-reference presence, never artifact content, and clears only if a later safe-view sample shows the required reference.

### OBS-03-R07 — FixAgent interface
`observation.defect_signal_v` yields `seq, signal_id, detected_at, defect_kind, component, severity, run_ref, work_item_ref, evidence, impact_code, threshold_version` for defect-shaped OPEN rows and their CLEARED successors. `debateai_obs_listener` has `SELECT`; the ObservationAgent never inserts into `obs.occurrence`, never uses `debateai_obs_writer`, and has no RP-0 dependency.

### OBS-03-R08 — Signal identity, suppression and clearing
There is at most one OPEN row per `(component,class,run_ref,work_item_ref)`. State changes append immutable rows: recovery writes a distinct CLEARED row with `clears_signal_id` pointing to the OPEN signal. When an infrastructure predicate becomes false, the defect-shaped row clears before or in the same cycle that the infrastructure row opens, so the FixAgent never sees one event attributed to both code and infrastructure.

### OBS-03-R09 — Closed evidence and privacy wall
Evidence keys for this slice are restricted to `worker_ref`, `heartbeat_age_s`, `heartbeat_threshold_s`, `state`, `claim_deadline`, `grace_s`, `ready_age_s`, `ready_threshold_s`, `last_progress_seq`, `silence_s`, `silence_threshold_s`, `artifact_present`, and health enums. Values are enums, numbers, UUIDs or timestamps. No free text from Hatchet or product tables is journaled, mirrored, rendered or exposed through the FixAgent view.

### OBS-03-R10 — Bounded reads and agent overhead
Each safe-view detector query completes in ≤ 100 ms at 220 runs / 210 work items, stays under the agent session's 2000 ms statement timeout, and adds no Postgres connection beyond OBS-01's ≤ 2 total. Hatchet REST requests time out after 2 s. A failed or timed-out read records detector state `UNKNOWN` and cannot block a product transaction.

### OBS-03-R11 — Defaults and routing rows
`deploy/observation-agent/thresholds/defaults/OBS-03.json` ships: worker poll 10 s, heartbeat age 30 s, detector cadence 15 s, claim grace 15 s, READY age 120 s, no-progress window 300 s, the Q2 suspected-defect mappings, and explicit SEVERE routing for WORKER_LOST, STALL, QUEUE_NOT_DRAINING, NO_PROGRESS and SUSPICIOUS_SUCCESS. This severity choice is the reviewer-authorized B6 disposition recorded in DECISIONS; Architecture does not choose it.

### OBS-03-R12 — Status, digest and latency evidence
`oactl status` adds runner heartbeat age, oldest READY age, stalled-item count, no-progress run count and suspicious-success count; the digest uses the fixed impact sentences. Every OPEN/CLEARED row records `first_failed_probe_at` and `detected_at` so V can calculate the Q3 budgets from two machine timestamps.

## States

- Runner heartbeat: `UNKNOWN` → `FRESH` → `STALE` (`WORKER_LOST` OPEN) → `FRESH` (CLEARED).
- Defect detector: `INELIGIBLE` (an infrastructure predicate is not UP) → `HEALTHY` → `PENDING` (threshold not yet crossed) → `OPEN` → `CLEARED`.
- FixAgent projection: `ABSENT` → `OPEN` → `CLEARED`, ordered by `seq`.

## Vocabulary (copy V will read)

Titles use severity SEVERE for `WORKER_LOST`, `STALL`, `QUEUE_NOT_DRAINING`, `NO_PROGRESS` and `SUSPICIOUS_SUCCESS`. Bodies are fixed: `IMPACT_WORKER_LOST` — `The runner stopped heartbeating T seconds ago: queued debate work is not picked up.` · `IMPACT_STALL` — `N work items are past their claim deadline: those debates will not finish on their own.` · `IMPACT_QUEUE` — `New debate work has waited T seconds without being picked up: asks hang.` · `IMPACT_NO_PROGRESS` — `N runs have in-flight work and no progress for W seconds: those debates look alive but are not moving.` · `IMPACT_SUSPICIOUS_SUCCESS` — `N work items completed without the artifact the contract requires: results may be empty.` · `IMPACT_CLEARED` — `<component>: <class> cleared after T seconds.`

## Reviewer-authorized disposition of frozen-source notes

- **F-OBS-03-A / B2:** The frozen STOP drill incorrectly required both stale-heartbeat WORKER_LOST and heartbeat-fresh STALL/NO_PROGRESS. Round-1 rework splits the proofs: STOP must produce WORKER_LOST and suppress defect rows; a deterministic isolated integration fixture holds infrastructure healthy while crossing each defect threshold.
- **F-OBS-03-B / B6:** The frozen source omitted four severities. Round-1 rework fixes STALL, QUEUE_NOT_DRAINING, NO_PROGRESS and SUSPICIOUS_SUCCESS at SEVERE, matching WORKER_LOST and the existing SEVERE channel contract. This is an explicit reviewer-authorized requirement choice, not an Architecture guess.

## V-runnable acceptance (real dev stack, this Mac)

All commands run from `/Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine`. `PSQL` means `docker exec -i debateai-v3-postgres-1 psql -U debateai -d debateai -Atc`. OBS-01/02 are installed; V has minted the D4 Hatchet read token; the dev stack runs on `https://localhost:3000`. `tests/acceptance/obs-agent-03-fixture.ts` is a stimulus-only V tool: using the explicit dev admin URL, it creates a fresh uniquely named database inside the running dev Postgres plus a temporary state directory, writes shell-quoted exports for `OBS_ACCEPTANCE_DATABASE`, `OBSERVATION_DATABASE_URL`, `OBSERVATION_STATE_DIR`, `OBSERVATION_TARGETS_PATH`, `OBS_ACCEPTANCE_FIRST_SEQ` and `OBS_ACCEPTANCE_DAY` to the requested env file, plants only the named isolated input, runs the real detector cycle, then stops. It never writes database `debateai`, and it must not read or assert `observation.signal`, `observation.delivery`, `observation.defect_signal_v`, status or digest output; those observations belong to V below.

1. Apply this slice's migration through the real path: `MIGRATION_DATABASE_URL=postgresql://debateai:debateai-dev-only@127.0.0.1:55432/debateai pnpm db:migrate` → exits 0; `PSQL "select table_name from information_schema.views where table_schema='obs' and table_name in ('work_item_liveness_v','run_progress_v') order by 1"` prints exactly `run_progress_v` then `work_item_liveness_v`.
2. `pnpm -C apps/observation-agent oactl thresholds apply deploy/observation-agent/thresholds/defaults/OBS-03.json --source-ref OBS-03-v1` → prints one `THRESHOLDS vN APPLIED` line where N is the prior maximum plus one; `pnpm -C apps/observation-agent oactl status` prints `runner heartbeat FRESH` with an age ≤ 30 s.
3. In a browser open `https://localhost:3000/new`, type `OBS-03 deterministic stall acceptance drill` in the `Topic` field, keep the displayed defaults, and click `Start run` → the browser navigates to `/debate/<uuid>?starting=1`; copy that UUID as `<RUN_REF>`.
4. `PSQL "select work_item_id, state, claim_deadline from obs.work_item_liveness_v where run_id='<RUN_REF>' order by claim_deadline nulls last limit 1"` → prints one UUID, a non-terminal state, and a non-null timestamp; copy the UUID as `<WORK_ITEM_REF>` and the timestamp as `<CLAIM_DEADLINE>`.
5. `RUNNER_PID=$(ps -Ao pid,command | awk '/[a]pps\/runner\/src\/main.ts/{print $1; exit}'); printf '%s\n' "$RUNNER_PID" | tee /tmp/obs-03-runner.pid; date -u +%FT%TZ; kill -STOP "$RUNNER_PID"` → prints one numeric PID and one UTC timestamp; the runner process remains present.
6. Within 45 s, run `PSQL "select class,component,suspected_defect from observation.open_signal_v where class='WORKER_LOST' order by seq desc limit 1"` → prints `WORKER_LOST|runner|f`; during the same interval a banner is titled `dialectical-engine: runner SEVERE`, subtitle `WORKER_LOST`, body `The runner stopped heartbeating T seconds ago: queued debate work is not picked up.`
7. After the later of `<CLAIM_DEADLINE> + 15 seconds` and 300 s without progress, `PSQL "select count(*) from observation.open_signal_v where run_ref='<RUN_REF>' and class in ('STALL','QUEUE_NOT_DRAINING','NO_PROGRESS','SUSPICIOUS_SUCCESS')"` prints `0`, and the same count over `observation.defect_signal_v` prints `0`; stale heartbeat suppresses defect attribution.
8. `kill -CONT "$(cat /tmp/obs-03-runner.pid)"` → the runner heartbeat becomes FRESH within 45 s and the WORKER_LOST row gains a CLEARED successor; `PSQL "select state from observation.signal where clears_signal_id=(select signal_id from observation.signal where class='WORKER_LOST' and state='OPEN' order by seq desc limit 1) order by seq desc limit 1"` prints `CLEARED`.
9. `MIGRATION_DATABASE_URL=postgresql://debateai:debateai-dev-only@127.0.0.1:55432/postgres pnpm exec tsx tests/acceptance/obs-agent-03-fixture.ts open-defects --env-file /tmp/obs-03-acceptance.env; source /tmp/obs-03-acceptance.env; pnpm -C apps/observation-agent oactl status` → the preparer prints `OBS-03 FIXTURE READY`; status prints `runner heartbeat FRESH`, `stalled items 1`, `oldest READY 120s`, `no-progress runs 1`, and `suspicious-success 1`.
10. `source /tmp/obs-03-acceptance.env; docker exec -i debateai-v3-postgres-1 psql -U debateai -d "$OBS_ACCEPTANCE_DATABASE" -Atc "select s.class,s.severity,s.defect_kind,s.suspected_defect from observation.defect_signal_v d join observation.signal s using(signal_id) where d.seq >= $OBS_ACCEPTANCE_FIRST_SEQ order by array_position(ARRAY['STALL','QUEUE_NOT_DRAINING','NO_PROGRESS','SUSPICIOUS_SUCCESS']::text[],s.class::text)"` → prints exactly `STALL|SEVERE|STALL_DETECTED|t`, `QUEUE_NOT_DRAINING|SEVERE|STALL_DETECTED|t`, `NO_PROGRESS|SEVERE|SILENT_NOOP|t`, and `SUSPICIOUS_SUCCESS|SEVERE|SUSPICIOUS_SUCCESS|t`, in that order. `rg -n 'STALL.*past their claim deadline|QUEUE_NOT_DRAINING.*waited .* seconds|NO_PROGRESS.*no progress|SUSPICIOUS_SUCCESS.*completed without the artifact' "$OBSERVATION_STATE_DIR/digest/$OBS_ACCEPTANCE_DAY.md"` finds one fixed-copy line for each class.
11. `source /tmp/obs-03-acceptance.env; pnpm exec tsx tests/acceptance/obs-agent-03-fixture.ts recover-defects --env-file /tmp/obs-03-acceptance.env; docker exec -i debateai-v3-postgres-1 psql -U debateai -d "$OBS_ACCEPTANCE_DATABASE" -Atc "select (select count(*) from observation.open_signal_v where seq >= $OBS_ACCEPTANCE_FIRST_SEQ),(select count(*) from observation.signal where state='CLEARED' and clears_signal_id in (select signal_id from observation.signal where state='OPEN' and seq >= $OBS_ACCEPTANCE_FIRST_SEQ))"` → the preparer prints `OBS-03 FIXTURE RECOVERED` and PSQL prints `0|4`.
12. Privacy/grants: `PSQL "select count(*) from information_schema.role_table_grants where grantee='debateai_observation_agent' and table_schema in ('core','ledger')"` → prints `0`; `PSQL "select column_name from information_schema.columns where table_schema='obs' and table_name in ('work_item_liveness_v','run_progress_v') and column_name in ('question','raw_text','content_ciphertext','metadata_json','user_id','session_id','asker_id')"` → prints nothing.
13. `MIGRATION_DATABASE_URL=postgresql://debateai:debateai-dev-only@127.0.0.1:55432/postgres pnpm exec tsx tests/acceptance/obs-agent-03-fixture.ts query-budget --env-file /tmp/obs-03-budget.env; source /tmp/obs-03-budget.env; docker exec -i debateai-v3-postgres-1 psql -U debateai -d "$OBS_ACCEPTANCE_DATABASE" -Atc "select (select count(distinct run_id) from obs.run_progress_v),(select count(*) from obs.work_item_liveness_v)"` → prints `220|210`. `docker exec -i debateai-v3-postgres-1 psql -U debateai -d "$OBS_ACCEPTANCE_DATABASE" -X -v ON_ERROR_STOP=1 < tests/acceptance/obs-agent-03-query-budget.sql | tee /tmp/obs-03-query-budget.txt` prints labels `OBS-03 STALL`, `OBS-03 QUEUE_NOT_DRAINING`, `OBS-03 NO_PROGRESS`, `OBS-03 SUSPICIOUS_SUCCESS`, each followed by its actual `EXPLAIN (ANALYZE, TIMING OFF, SUMMARY ON)` plan and an `Execution Time: X ms` line with X ≤ 100. The checked-in SQL contains the same SELECT definitions the runtime detectors execute; V reads the four values rather than trusting a pass/fail wrapper.
14. `PSQL "select count(*) from pg_stat_activity where usename='debateai_observation_agent'"` → prints `1` or `2` against the real dev database.

## Worker milestones (not V acceptance)

- `pnpm exec vitest run tests/integration/obs-agent-03-defect-detectors.test.ts --reporter=verbose` exercises the four isolated healthy-infrastructure detector/recovery cases and verifies the acceptance preparer never asserts output surfaces.
- `pnpm exec vitest run tests/integration/obs-agent-03-query-budget.test.ts --reporter=verbose` mechanically checks the 220/210 fixture, the ≤100 ms bound, and identity between the runtime SELECT definitions and `tests/acceptance/obs-agent-03-query-budget.sql`. A green result does not replace steps 9–14.

## Out of scope (named successors)

Thrown-error capture and any insert into `obs.occurrence` (FixAgent) · capture/blind-period health (OBS-04) · infrastructure capacity (OBS-05) · aggregate throughput/provider/Hatchet queue metrics (OBS-06) · ticket/channel delivery (OBS-07) · changing product work-item state or claim semantics · direct reads of the Hatchet database · any further source correction beyond the reviewer-authorized F-OBS-03-A/B disposition above.

## Parallel-safety (single-writer rule)

OWNED: `apps/observation-agent/src/modules/stall-detectors/**`, `apps/observation-agent/src/modules/defect-interface/**`, `deploy/observation-agent/thresholds/defaults/OBS-03.json`, `migrations/<n>_observation_safe_views.sql`, `tests/{unit,integration,architecture,acceptance}/obs-agent-03-*`. NEVER: OBS-01/02-owned files, product files, `obs.occurrence`, Hatchet database tables, or the excluded security zone.

## Absorbed predecessor slices

S20 detector portion (`VerticalSlices.md:289-297`) · S18 deterministic “does not work” sweeps · FID-02, as frozen in `requirements/observationagent.md:178`.

## Dependencies and gates

OBS-01 and OBS-02 merged. V rows/gates: V-3/C4 detector ownership; D1 FixAgent delivery; D4 Hatchet REST token; D13 migration number. Reviewer-authorized round-1 rework disposed F-OBS-03-A/B; Architecture may not recombine the STOP and healthy-infrastructure proofs or change the fixed SEVERE routing.
