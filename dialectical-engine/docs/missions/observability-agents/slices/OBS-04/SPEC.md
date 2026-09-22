# SPEC — OBS-04 Capture health, blind periods, spool

**Status:** FROZEN at creation (2026-09-02, REQ-OBS-FINISH projection); amended 2026-09-02 for reviewer-authorized REQ-REV-OBS round-1 findings B5/N7 and controller-authorized round-3 cleanup of REQ-REV-OBS-r2 N9. The invalid chmod drill remains recorded below and every superseding choice is appended to DECISIONS.

**Mission:** `observability-agents` · **Product:** ObservationAgent · **Traces to:** `requirements/observationagent.md` Q1 row 12 · Q2 CAPTURE classes · Q3 blind/gap/spool budgets · Q4 G3/G11/G12 · Q5 defaults · Q6 read-only `obs.*` · Q7 OBS-04. Builds on OBS-01/02; the post-wiring drill waits on the FixAgent capture bindings.

**Measured source:** frozen requirements record `obs.capture_gap`, `obs.component_health` and `obs.spool_receipt` present with zero rows, while runtime capture wiring S05b is absent (`requirements/observationagent.md:10,34`; `requirements/fixagent-state-audit.md:31`).

## Intent

Make the observability layer's own blindness visible. Silence is never health: before capture wiring exists, status says `NOT WIRED`; after wiring, missing positive `FLUSH_OK` authority becomes a blind period, explicit lost-event rows become capture-gap signals, and old spool files without receipts become stranded-spool signals. The agent reads metadata only and never opens captured content.

## Ground truth this SPEC rests on (do not re-litigate)

- Capture health counters are process-local; authority must reach `obs.component_health` to become externally observable (`packages/obs-capture/src/health.ts:18-26,88-95`; `requirements/observationagent.md:34`).
- `obs.capture_gap` carries `source`, `gap_class`, `lost_count`, `opened_at`, `closed_at`; `obs.spool_receipt` carries a unique `spool_ref` and `reingested_at`; `obs.component_health` carries component/state/observed-at/detail-code (`migrations/0034_obs_foundation.sql:197-212,240-246`).
- Runtime spool files are named `<runtime>-<pid>-<bootId>.spool` under `OBS_SPOOL_DIR`; capture wiring is absent today, so no runtime spool is expected (`requirements/observationagent.md:34`).
- The agent may read the capture relations but never writes `obs.*`, reads `obs.occurrence_detail`, opens spool contents, or touches an excluded-zone path (`requirements/observationagent.md:109,117-118`).

## Requirements

### OBS-04-R01 — Read-only capture-health inputs
Module `capture-health` reads new rows from `obs.capture_gap`, `obs.component_health` and `obs.spool_receipt` using a monotonic observation cursor held in schema `observation`. It gets only `SELECT` already granted by OBS-01, performs no `INSERT/UPDATE/DELETE/TRUNCATE` in `obs`, and treats a read failure as detector state `UNKNOWN`, never as a healthy capture result.

### OBS-04-R02 — `CAPTURE_NOT_WIRED` standing state
For each expected runtime without any positive `detail_code=FLUSH_OK` authority row, `oactl status` shows `obs_capture: NOT WIRED (0 FLUSH_OK rows) — blind by construction`. The agent appends one `CAPTURE_NOT_WIRED` digest line per UTC day while the condition remains and does not send a banner or expose the row to FixAgent. The condition clears only after a current positive authority row exists.

### OBS-04-R03 — Blind-period detector
After wiring, when OBS-02 says a runtime process is UP but its last positive capture authority is more than 120 s old, a 15 s detector opens `BLIND_PERIOD` for `component=obs_capture`; total last-authority-to-signal budget is ≤ 135 s and notification delivery, when routed, adds ≤ 3 s. It clears after a new `FLUSH_OK` authority row and never equates process death with capture blindness.

### OBS-04-R04 — Capture-gap detector
A new `obs.capture_gap` row opens `CAPTURE_GAP` within 17 s of `closed_at` (or first observation when `closed_at` is null) and delivery adds ≤ 3 s. Evidence contains source, gap-class, lost-count and timestamps only. Aggregate loss below 100 events in five minutes is DEGRADED; aggregate loss ≥ 100 in five minutes is SEVERE. The signal clears when all observed open gap rows have `closed_at` and no new loss appears for one detector cycle. V's stimulus-only acceptance preparer supplies the causal input by inserting an explicit typed gap row in an isolated database; V observes timing through PSQL/status/digest, while Vitest remains a worker milestone. A directory permission change alone is never accepted as evidence of event loss.

### OBS-04-R05 — Stranded-spool detector
Every 15 s, module `spool-health` stats only the validated spool directories named in `deploy/observation-agent/targets.dev.d/OBS-04.json`. A `.spool` file whose mtime is older than 10 minutes and whose basename has no matching `obs.spool_receipt.spool_ref` opens `SPOOL_STRANDED` within 17 s of crossing the age threshold. It clears when a receipt appears or the file is no longer present. The agent never opens, hashes, parses, moves, truncates or deletes a spool file.

### OBS-04-R06 — Capture signal identity and suppression
At most one OPEN row exists per `(class, runtime, source, gap_class)`; repeated samples update numeric status but do not append duplicate OPEN rows. Capture classes always set `suspected_defect=false` and `defect_kind=null`, never enter `observation.defect_signal_v`, and append a distinct CLEARED row through the OBS-01 signal lifecycle.

### OBS-04-R07 — Closed evidence and zone boundary
Evidence keys are restricted to `runtime`, `source`, `gap_class`, `lost_count`, `last_flush_ok_at`, `silence_s`, `threshold_s`, `spool_ref`, `spool_age_s`, `receipt_present`, and enum health states. `spool_ref` must match the runtime/pid/UUID filename grammar before storage. No captured line, error message, stack, prompt, payload, token, cookie, user id or excluded-zone path can enter a signal, digest or status surface.

### OBS-04-R08 — Defaults, status and daily digest
`deploy/observation-agent/thresholds/defaults/OBS-04.json` ships detector cadence 15 s, blind window 120 s, spool age 10 min, and gap bands DEGRADED below 100 / SEVERE at 100 in five minutes. `oactl status` shows wiring state, last `FLUSH_OK` age, open gap count/lost total and stranded-file count per runtime; the digest renders only `IMPACT_CAPTURE_NOT_WIRED`, `IMPACT_BLIND`, `IMPACT_CAPTURE_GAP`, `IMPACT_SPOOL_STRANDED` and `IMPACT_CLEARED` templates.

## States

- Capture wiring: `NOT_WIRED` → `WIRED_CURRENT` → `WIRED_SILENT` (`BLIND_PERIOD` OPEN) → `WIRED_CURRENT` (CLEARED).
- Gap: `NONE` → `OPEN` → `CLOSED` (CLEARED after one quiet detector cycle).
- Spool file: `CURRENT` → `STRANDED` → `RECEIPTED_OR_ABSENT` (CLEARED).

## Vocabulary (copy V will read)

Status copy: `obs_capture: NOT WIRED (0 FLUSH_OK rows) — blind by construction`. Bodies: `IMPACT_CAPTURE_NOT_WIRED` — `Error capture is not wired into the product: no failure is recorded anywhere.` · `IMPACT_BLIND` — `Error capture on <runtime> is silent while the process is up: failures there are not recorded.` · `IMPACT_CAPTURE_GAP` — `N error events were dropped by capture: the error record is incomplete.` · `IMPACT_SPOOL_STRANDED` — `N spooled error files are older than T minutes without re-ingestion.` · `IMPACT_CLEARED` — `<component>: <class> cleared after T seconds.`

## Reviewer-authorized disposition of frozen-source note

- **F-OBS-04-A / B5:** The frozen Q7 chmod drill was invalid because installers write through a pre-opened file descriptor (`packages/obs-capture/install/api.ts:70-84,102-109`). Round-1 rework replaces it with an isolated typed `obs.capture_gap` row that is then closed; round-3 N9 cleanup makes the preparer stimulus-only and leaves CAPTURE_GAP/CLEARED observation to V through PSQL/status/digest. The original defect remains visible in the reviewer verdict and this receipt.

## V-runnable acceptance (real dev stack, this Mac)

All commands run from `/Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine`. `PSQL` means `docker exec -i debateai-v3-postgres-1 psql -U debateai -d debateai -Atc`. OBS-01/02 are running. `tests/acceptance/obs-agent-04-fixture.ts` is a stimulus-only V tool with the same isolation contract as OBS-03: it creates a fresh uniquely named database inside the running dev Postgres plus a temporary state directory, writes shell-quoted exports for `OBS_ACCEPTANCE_DATABASE`, `OBSERVATION_DATABASE_URL`, `OBSERVATION_STATE_DIR`, `OBSERVATION_TARGETS_PATH`, `OBS_ACCEPTANCE_FIRST_SEQ` and `OBS_ACCEPTANCE_DAY` to the requested env file, applies only the named gap-row input, runs the real detector cycle, then stops. It never writes database `debateai` and must not read or assert signal, delivery, status or digest output.

1. Before FixAgent runtime wiring lands, `pnpm -C apps/observation-agent oactl status` → prints exactly `obs_capture: NOT WIRED (0 FLUSH_OK rows) — blind by construction`; `PSQL "select count(*) from obs.component_health where detail_code='FLUSH_OK'"` prints `0`.
2. Run `pnpm -C apps/observation-agent oactl status` twice more, then `grep -c 'CAPTURE_NOT_WIRED.*Error capture is not wired into the product' "${HOME}/.local/state/dialectical-engine/observation-agent/digest/$(date -u +%F).md"` → prints `1` for the current UTC day, not 3.
3. `pnpm -C apps/observation-agent oactl thresholds apply deploy/observation-agent/thresholds/defaults/OBS-04.json --source-ref OBS-04-v1` → prints one `THRESHOLDS vN APPLIED` line where N is the prior maximum plus one; status shows `blind threshold 120s`, `spool threshold 10m`, `gap severe 100/5m`.
4. After the FixAgent wiring successor is installed and one known non-private acceptance error has flushed, `PSQL "select component,state,detail_code from obs.component_health where detail_code='FLUSH_OK' order by observed_at desc limit 1"` → prints one runtime, a positive state and `FLUSH_OK`; within 15 s `pnpm -C apps/observation-agent oactl status` replaces `NOT WIRED` with that runtime's `WIRED CURRENT` state.
5. `MIGRATION_DATABASE_URL=postgresql://debateai:debateai-dev-only@127.0.0.1:55432/postgres pnpm exec tsx tests/acceptance/obs-agent-04-fixture.ts open-gap --env-file /tmp/obs-04-acceptance.env; source /tmp/obs-04-acceptance.env; docker exec -i debateai-v3-postgres-1 psql -U debateai -d "$OBS_ACCEPTANCE_DATABASE" -Atc "select g.source,g.gap_class,g.lost_count,s.class,s.severity,s.suspected_defect,round(extract(epoch from(s.detected_at-s.first_failed_probe_at))::numeric,3) from obs.capture_gap g cross join lateral (select * from observation.signal where class='CAPTURE_GAP' and state='OPEN' order by seq desc limit 1) s where g.source='obs04_acceptance'"` → the preparer prints `OBS-04 GAP INPUT READY`; PSQL prints `obs04_acceptance|QUEUE_FULL|7|CAPTURE_GAP|DEGRADED|f|D`, where 0 ≤ D ≤ 17.
6. `source /tmp/obs-04-acceptance.env; pnpm -C apps/observation-agent oactl status; rg -n 'CAPTURE_GAP.*7 error events were dropped by capture' "$OBSERVATION_STATE_DIR/digest/$OBS_ACCEPTANCE_DAY.md"` → status prints `capture gap: 7 lost (DEGRADED)` and the digest search finds exactly one fixed-copy OPEN line.
7. `source /tmp/obs-04-acceptance.env; pnpm exec tsx tests/acceptance/obs-agent-04-fixture.ts close-gap --env-file /tmp/obs-04-acceptance.env; docker exec -i debateai-v3-postgres-1 psql -U debateai -d "$OBS_ACCEPTANCE_DATABASE" -Atc "select c.state,round(extract(epoch from(c.detected_at-g.closed_at))::numeric,3),(select count(*) from observation.open_signal_v where class='CAPTURE_GAP') from obs.capture_gap g join observation.signal o on o.class='CAPTURE_GAP' and o.state='OPEN' join observation.signal c on c.clears_signal_id=o.signal_id where g.source='obs04_acceptance' order by c.seq desc limit 1"` → the preparer prints `OBS-04 GAP INPUT CLOSED`; PSQL prints `CLEARED|D|0`, where 0 ≤ D ≤ 20. No directory permission change or pre-opened spool descriptor is used as a loss stimulus.
8. Blind-period drill after wiring: `RUNNER_PID=$(ps -Ao pid,command | awk '/[a]pps\/runner\/src\/main.ts/{print $1; exit}'); printf '%s\n' "$RUNNER_PID" | tee /tmp/obs-04-runner.pid; date -u +%FT%TZ; kill -STOP "$RUNNER_PID"` → after 120 s of capture silence and within 18 s more, `PSQL "select class,component,suspected_defect from observation.open_signal_v where class='BLIND_PERIOD' order by seq desc limit 1"` prints `BLIND_PERIOD|obs_capture|f`; `kill -CONT "$(cat /tmp/obs-04-runner.pid)"` → a new FLUSH_OK clears it after capture resumes.
9. Read-only/content boundary: `PSQL "select count(*) from information_schema.role_table_grants where grantee='debateai_observation_agent' and table_schema='obs' and privilege_type<>'SELECT'"` → prints `0`; `rg -n 'readFile|createReadStream|openSync' apps/observation-agent/src/modules/spool-health` → prints nothing.
10. `PSQL "select class,suspected_defect,defect_kind from observation.signal where class in ('CAPTURE_NOT_WIRED','BLIND_PERIOD','CAPTURE_GAP','SPOOL_STRANDED') order by seq"` → every returned row has `suspected_defect=f` and an empty `defect_kind`; `PSQL "select count(*) from observation.defect_signal_v where defect_kind is null"` prints `0`.

## Worker milestones (not V acceptance)

- `pnpm exec vitest run tests/integration/obs-agent-04-gap-drill.test.ts --reporter=verbose` exercises the isolated open/close fixture, timing bounds and deduplication, and verifies the acceptance preparer never asserts output surfaces. A green result does not replace steps 5–7.

## Out of scope (named successors)

Wiring capture into API/runner/scheduler/provider/UI runtimes (FixAgent capture slices) · repairing capture loss · reading spool contents · creating or deleting spool files · production writes to `obs.component_health`, `obs.capture_gap` or `obs.spool_receipt` (the acceptance fixture is isolated test data) · stall detection (OBS-03) · host capacity (OBS-05) · alert-channel fan-out (OBS-07) · any further correction beyond the reviewer-authorized F-OBS-04-A disposition.

## Parallel-safety (single-writer rule)

OWNED: `apps/observation-agent/src/modules/capture-health/**`, `apps/observation-agent/src/modules/spool-health/**`, `deploy/observation-agent/targets.dev.d/OBS-04.json`, `deploy/observation-agent/thresholds/defaults/OBS-04.json`, `tests/{unit,integration,architecture,acceptance}/obs-agent-04-*`. NEVER: capture-runtime/product code, OBS-01/02/03 files, another slice's target fragment, production `obs.*` writes, spool contents, or the excluded security zone.

## Absorbed predecessor slices

S20 `unclassified`/capture-health watch and RT-09 · predecessor D4 silence-never-means-health, as frozen in `requirements/observationagent.md:179`.

## Dependencies and gates

OBS-01 and OBS-02 merged. The `NOT WIRED` proof is runnable immediately; gap/blind/spool post-wiring behavior depends on the FixAgent runtime bindings, while the isolated gap-row acceptance preparer is deterministic and V owns every output observation. C4 keeps blind-period ownership here. DR-188/D11 forbids deleting spool or metric data. Reviewer-authorized round-1 rework disposed F-OBS-04-A; Architecture must not restore chmod as a causal loss drill.
