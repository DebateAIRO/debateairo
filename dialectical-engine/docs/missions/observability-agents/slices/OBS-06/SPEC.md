# SPEC — OBS-06 Throughput, provider health, Hatchet queue metrics

**Status:** FROZEN at creation (2026-09-02, REQ-OBS-FINISH projection); amended 2026-09-02 for reviewer-authorized REQ-REV-OBS round-1 findings B3/B8/B9/N3/the N7 disjoint-target rule and controller-authorized round-3 cleanup of REQ-REV-OBS-r2 N9. The original gaps remain recorded below and every superseding choice is appended to DECISIONS.

**Mission:** `observability-agents` · **Product:** ObservationAgent · **Traces to:** `requirements/observationagent.md` Q1 rows 3, 11 and 15 · Q2 THROUGHPUT_ANOMALY/PROVIDER_DEGRADED · Q3 five-minute-window budget · Q4 read-only/privacy bounds · Q5 defaults · Q6 safe views/ring/hourly · Q7 OBS-06.

**Measured source:** frozen probes recorded 22 runs, 16 DONE and 5 FAILED work items, Hatchet Prometheus disabled, and no product metric endpoint (`requirements/observationagent.md:25,33,37`).

## Intent

Show whether debate work is entering and leaving the system, whether failures dominate a window, whether provider calls parse successfully, and whether Hatchet's queue/dispatch layer is keeping up. Derive rates from read-only safe projections and the agent's sampling clock; use Hatchet REST now and Prometheus only after V enables it.

## Ground truth this SPEC rests on (do not re-litigate)

- Product rows lack a usable wall-clock for the required rates, so the agent derives deltas between its own five-minute samples (`requirements/observationagent.md:37`).
- Provider projection is restricted to `provider_ref`, `model_id`, `parse_status`, sequence/timestamp fields; it excludes raw text, metadata and ciphertext (`requirements/observationagent.md:33,166`).
- Hatchet Prometheus is disabled today; D4 selects a REST read token now, Prometheus at the next V-approved restart, and never direct vendor-table reads (`requirements/observationagent.md:25,196`).
- Five-minute-window classes are detected within window + 32 s and delivered within 3 s (`requirements/observationagent.md:97`).

## Requirements

### OBS-06-R01 — Safe throughput projections (migration `observation_throughput_views`)
One orchestrator-numbered migration creates `obs.provider_call_v`, `obs.run_throughput_v` and the work-item throughput fields required by this slice as `security_barrier` views owned by `debateai_obs_view_owner`. Provider rows expose only `provider_ref`, `model_id`, `parse_status`, and `at_seq`; run/work-item rows expose ids, state, sequence values and safe timestamps required for their own rates. No provider start/finish/duration exists in this contract. No question, prompt, error/parse text, raw text, metadata JSON, ciphertext, user/session/asker id or provider payload is exposed. The agent role receives `SELECT` and no direct grant on `core.*` or `ledger.*`.

### OBS-06-R02 — Product throughput windows
Every 30 s, module `throughput` samples cumulative run-start and work-item terminal-state sequence counts. For each five-minute window it derives runs started, work items completed, work items failed, READY-to-terminal drain count, and the failed ratio from sample deltas; it writes numeric ring samples and hourly min/avg/max/count rollups. A process restart resumes from stored samples without double-counting a sequence.

### OBS-06-R03 — Run-failure anomaly
At least four terminal runs in an hourly window with ≥ 50% failed opens THROUGHPUT_ANOMALY SEVERE with Q2-owned `IMPACT_RUN_FAILURE`; fewer than four runs is `INSUFFICIENT_SAMPLE`, not healthy. It clears after the next qualifying window falls below 50%. The fixed evidence parameters are failed count N, terminal count M, ratio R and window W=60 minutes; copy is never composed dynamically.

### OBS-06-R04 — Provider failure-rate detector
For each provider ref, at least ten calls in a five-minute window with ≥ 50% non-success `parse_status` opens PROVIDER_DEGRADED SEVERE and uses `IMPACT_PROVIDER`; fewer than ten calls is `INSUFFICIENT_SAMPLE`. Evidence contains provider ref, total count, failed count, ratio and window boundaries; model identifiers appear in status aggregates but not notifications.

### OBS-06-R05 — Provider latency observability
The historical source asked for provider call latency without naming a safe start/finish/duration field. The current requirement is explicit: until a V-ratified successor defines such a source, status shows `provider latency: NOT OBSERVABLE` and no provider-latency signal opens. The agent never substitutes sequence distance or wall-clock observation delay for call latency.

### OBS-06-R06 — Hatchet metrics source and queue detector
With D4(a), module `hatchet-throughput` polls the REST tenant queue/step-run metrics and worker list using the V-minted read token and the Hatchet target declared in `deploy/observation-agent/targets.dev.d/OBS-06.json`; with D4(b) after V enables it, it also scrapes loopback `:9090/metrics`. Queue depth ≥ 10 sustained for five minutes opens a Hatchet THROUGHPUT_ANOMALY SEVERE row with `IMPACT_HATCHET_QUEUE`; direct reads of the `hatchet` database are forbidden.

### OBS-06-R07 — Hatchet dispatch and failed-task detectors
The module records `hatchet_queued_to_assigned_time_seconds` p95 and deltas of `hatchet_failed_tasks_total` / `hatchet_created_tasks_total`. Dispatch p95 ≥ 30 s opens THROUGHPUT_ANOMALY DEGRADED with Q2-owned `IMPACT_HATCHET_DISPATCH_SLOW`; ≥ 3 failed tasks per 15 min opens THROUGHPUT_ANOMALY SEVERE with `IMPACT_HATCHET_FAILED_TASKS`. Both use fixed numeric parameters and never compose delivery prose.

### OBS-06-R08 — Source correlation and mismatch state
When both REST and Prometheus are enabled, status displays both queue values from the same sample cycle and marks `MATCH` only when equal; inequality is `SOURCE_MISMATCH` with both numeric values and timestamps, never silently resolved in favor of one source. A metric-source read failure yields `UNKNOWN`, preserves the last observed sample timestamp, and cannot become a zero.

### OBS-06-R09 — Signal identity, clearing and privacy
At most one OPEN row exists per `(class,component,metric_key,window)` and recovery appends a CLEARED row. All OBS-06 rows set `suspected_defect=false` and `defect_kind=null`. Evidence is restricted to metric key, numeric count/ratio/quantile/threshold, provider enum/ref, source enum and timestamps; provider payloads, prompt content and private debate content never enter any output.

### OBS-06-R10 — Defaults, status and bounded overhead
`deploy/observation-agent/thresholds/defaults/OBS-06.json` ships 30 s sampling, five-minute throughput/provider/queue windows, provider ≥ 10 and ≥ 50%, queue ≥ 10, dispatch p95 30 s, failed tasks ≥ 3/15 min, and run failure ≥ 50% over ≥ 4/hour. `oactl status --throughput` shows every current count/ratio/source state and threshold version. REST/scrape timeout is 2 s; safe-view queries are ≤ 100 ms at 10× today's rows and remain within OBS-01's two total database sessions.

## States

- Window: `COLLECTING` → `INSUFFICIENT_SAMPLE` or `QUALIFIED_NORMAL` or `OPEN` → `CLEARED`.
- Metric source: `REST_ONLY` → `REST_AND_PROMETHEUS_MATCH` or `SOURCE_MISMATCH`; any failed read becomes `UNKNOWN`, never zero.
- Provider latency: `NOT_OBSERVABLE` until a successor requirement supplies a safe timing pair.

## Vocabulary (copy V will read)

Status copy: `provider latency: NOT OBSERVABLE`. Fixed Q2 bodies: `IMPACT_HATCHET_QUEUE` — `Hatchet has Q tasks queued for T seconds: dispatch is not keeping up.` · `IMPACT_HATCHET_FAILED_TASKS` — `N Hatchet tasks failed in the last W minutes: debates are dying at dispatch.` · `IMPACT_HATCHET_DISPATCH_SLOW` — `Hatchet dispatch p95 is P seconds over W minutes: queued debate work waits too long to start.` · `IMPACT_PROVIDER` — `Provider <ref> failed R% of its last N calls: debates stall or die on it.` · `IMPACT_RUN_FAILURE` — `N of M terminal runs failed in the last W minutes: debate runs are failing more often than they finish.` · `IMPACT_CLEARED` — `<component>: <class> cleared after T seconds.`

## Reviewer-authorized disposition of frozen-source notes

- **F-OBS-06-A / B3:** The frozen one-ask drill could not cross the default queue depth of 10. Round-1 rework submits 10 asks and still requires queue depth ≥10 sustained for five minutes; the threshold is not lowered.
- **F-OBS-06-B / B8:** No safe provider timing pair exists. Round-1 rework makes `provider latency: NOT OBSERVABLE` the required status and defers latency alerts until a successor names a safe start/finish/duration source; sequence distance and observation delay remain forbidden substitutes.
- **F-OBS-06-C / B9:** Round-1 rework adds `IMPACT_RUN_FAILURE` and `IMPACT_HATCHET_DISPATCH_SLOW` to Q2's closed vocabulary and binds them to R03/R07. This is an explicit reviewer-authorized requirement choice, not runtime-composed prose.

## V-runnable acceptance (real dev stack, this Mac)

All commands run from `/Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine`. `PSQL` means `docker exec -i debateai-v3-postgres-1 psql -U debateai -d debateai -Atc`. OBS-01/02 are running, the dev stack is at `https://localhost:3000`, and D4(a)'s read token is installed. `tests/acceptance/obs-agent-06-fixture.ts` is stimulus-only: it creates a fresh uniquely named database inside the running dev Postgres plus a temporary state directory, writes shell-quoted exports for `OBS_ACCEPTANCE_DATABASE`, `OBSERVATION_DATABASE_URL`, `OBSERVATION_STATE_DIR`, `OBSERVATION_TARGETS_PATH`, `OBS_ACCEPTANCE_FIRST_SEQ` and `OBS_ACCEPTANCE_DAY` to the requested env file, plants only the named isolated input, runs the real detector cycles, then stops. It never writes database `debateai` and must not read or assert signal, delivery, status, digest or EXPLAIN output.

1. Apply the allocated migration: `MIGRATION_DATABASE_URL=postgresql://debateai:debateai-dev-only@127.0.0.1:55432/debateai pnpm db:migrate` → exits 0; `PSQL "select table_name from information_schema.views where table_schema='obs' and table_name in ('provider_call_v','run_throughput_v') order by 1"` prints `provider_call_v` then `run_throughput_v`.
2. `PSQL "select column_name from information_schema.columns where table_schema='obs' and table_name in ('provider_call_v','run_throughput_v') and column_name in ('question','prompt','parse_error','raw_text','metadata_json','content_ciphertext','user_id','session_id','asker_id')"` → prints nothing; the agent role has no `core`/`ledger` table grant.
3. `pnpm -C apps/observation-agent oactl thresholds apply deploy/observation-agent/thresholds/defaults/OBS-06.json --source-ref OBS-06-v1` → prints one `THRESHOLDS vN APPLIED` line where N is the prior maximum plus one; `pnpm -C apps/observation-agent oactl status --throughput` prints `queue threshold 10/5m`, `provider threshold 50%/10`, and `run failure threshold 50%/4`.
4. Before submitting work, run `pnpm -C apps/observation-agent oactl status --throughput | tee /tmp/obs-06-before.txt` → prints current run/work-item counts and failed ratio. In a browser open `https://localhost:3000/new`, submit `OBS-06 throughput acceptance drill A` with `Start run`, then repeat with `OBS-06 throughput acceptance drill B` → each click navigates to `/debate/<uuid>?starting=1`.
5. After the next 30 s sample, `pnpm -C apps/observation-agent oactl status --throughput | tee /tmp/obs-06-after.txt` → run/work-item counts differ from `/tmp/obs-06-before.txt`; its failed ratio equals `PSQL "select count(*) filter (where state='FAILED'),count(*) from obs.run_throughput_v"` for the displayed window. The source's measured historical value `5/21` is not hard-coded.
6. `pnpm -C apps/observation-agent oactl status --throughput` → prints per-provider calls, failures and ratio or `INSUFFICIENT_SAMPLE`, plus exactly `provider latency: NOT OBSERVABLE`; it never prints provider payload or parse-error text.
7. `MIGRATION_DATABASE_URL=postgresql://debateai:debateai-dev-only@127.0.0.1:55432/postgres pnpm exec tsx tests/acceptance/obs-agent-06-fixture.ts open-anomalies --env-file /tmp/obs-06-acceptance.env; source /tmp/obs-06-acceptance.env; pnpm -C apps/observation-agent oactl status --throughput` → the preparer prints `OBS-06 ANOMALY INPUT READY`; status prints `run failure: 3/4 over 60m (SEVERE)` and `dispatch p95: 31s over 5m (DEGRADED)`.
8. `source /tmp/obs-06-acceptance.env; docker exec -i debateai-v3-postgres-1 psql -U debateai -d "$OBS_ACCEPTANCE_DATABASE" -Atc "select impact_code,severity,suspected_defect from observation.open_signal_v where impact_code in ('IMPACT_RUN_FAILURE','IMPACT_HATCHET_DISPATCH_SLOW') order by array_position(ARRAY['IMPACT_HATCHET_DISPATCH_SLOW','IMPACT_RUN_FAILURE']::text[],impact_code::text)"` → prints exactly `IMPACT_HATCHET_DISPATCH_SLOW|DEGRADED|f` then `IMPACT_RUN_FAILURE|SEVERE|f`. `rg -n 'Hatchet dispatch p95 is 31 seconds over 5 minutes: queued debate work waits too long to start|3 of 4 terminal runs failed in the last 60 minutes: debate runs are failing more often than they finish' "$OBSERVATION_STATE_DIR/digest/$OBS_ACCEPTANCE_DAY.md"` finds both fixed-copy lines.
9. Queue drill: `RUNNER_PID=$(ps -Ao pid,command | awk '/[a]pps\/runner\/src\/main.ts/{print $1; exit}'); printf '%s\n' "$RUNNER_PID" | tee /tmp/obs-06-runner.pid; kill -STOP "$RUNNER_PID"`; in the browser submit ten asks named `OBS-06 queue acceptance drill 01` through `10`, clicking `Start run` for each and recording each `/debate/<uuid>?starting=1` navigation → after queue depth has remained ≥10 for five minutes, a SEVERE banner uses `Hatchet has Q tasks queued for T seconds: dispatch is not keeping up.`, with Q ≥10 and T ≥300.
10. `kill -CONT "$(cat /tmp/obs-06-runner.pid)"` → the runner resumes and any lawfully OPEN Hatchet queue row clears after queue depth falls below its ruled threshold for the detector's recovery cycle.
11. If V has enabled Hatchet Prometheus, `curl -s http://127.0.0.1:9090/metrics | awk '$1=="hatchet_tenant_queue_size"{print $2; exit}'` → prints the same numeric queue depth as `oactl status --throughput`; if Prometheus remains disabled, `curl -s -o /dev/null -w '%{http_code}' http://127.0.0.1:9090/metrics` does not print `200` and status prints `REST_ONLY`, not failure.
12. `PSQL "select class,suspected_defect,defect_kind from observation.signal where class in ('THROUGHPUT_ANOMALY','PROVIDER_DEGRADED') order by seq"` → every returned row has `suspected_defect=f` and empty `defect_kind`.
13. `MIGRATION_DATABASE_URL=postgresql://debateai:debateai-dev-only@127.0.0.1:55432/postgres pnpm exec tsx tests/acceptance/obs-agent-06-fixture.ts query-budget --env-file /tmp/obs-06-budget.env; source /tmp/obs-06-budget.env; docker exec -i debateai-v3-postgres-1 psql -U debateai -d "$OBS_ACCEPTANCE_DATABASE" -Atc "select count(distinct run_id),count(distinct work_item_id) from obs.run_throughput_v; select count(*) from obs.provider_call_v"` → prints `220|210` then `210`. `docker exec -i debateai-v3-postgres-1 psql -U debateai -d "$OBS_ACCEPTANCE_DATABASE" -X -v ON_ERROR_STOP=1 < tests/acceptance/obs-agent-06-query-budget.sql | tee /tmp/obs-06-query-budget.txt` prints labels `OBS-06 RUN_THROUGHPUT`, `OBS-06 WORK_ITEM_THROUGHPUT`, and `OBS-06 PROVIDER_FAILURE`, each followed by its actual `EXPLAIN (ANALYZE, TIMING OFF, SUMMARY ON)` plan and an `Execution Time: X ms` line with X ≤ 100. The checked-in SQL contains the same SELECT definitions the runtime detectors execute; V reads the three values rather than trusting a pass/fail wrapper.

## Worker milestones (not V acceptance)

- `pnpm exec vitest run tests/integration/obs-agent-06-anomaly-copy.test.ts --reporter=verbose` mechanically exercises the qualifying run-failure/dispatch fixtures and verifies the stimulus-only preparer never asserts output surfaces.
- `pnpm exec vitest run tests/integration/obs-agent-06-query-budget.test.ts --reporter=verbose` checks the 220/210/provider fixtures, the ≤100 ms bound, and identity between runtime SELECT definitions and `tests/acceptance/obs-agent-06-query-budget.sql`. Green results do not replace steps 7–8 or 13.

## Out of scope (named successors)

Enabling/restarting Hatchet Prometheus (V act) · direct Hatchet database reads · provider payload or private-debate inspection · learned baselines · writing product counters · classifying throughput anomalies as FixAgent defects · target-server metrics (OBS-08 deferred) · adding a provider-latency source without a V-ratified successor · any further vocabulary change beyond the reviewer-authorized F-OBS-06-C disposition.

## Parallel-safety (single-writer rule)

OWNED: `apps/observation-agent/src/modules/throughput/**`, `apps/observation-agent/src/modules/provider-health/**`, `apps/observation-agent/src/modules/hatchet-throughput/**`, `deploy/observation-agent/targets.dev.d/OBS-06.json`, `deploy/observation-agent/thresholds/defaults/OBS-06.json`, `migrations/<n>_observation_throughput_views.sql`, `tests/{unit,integration,architecture,acceptance}/obs-agent-06-*`. NEVER: another slice's target fragment, Hatchet/Compose/product/provider code, OBS-01..05 files, direct `core`/`ledger`/Hatchet-table reads, or the excluded security zone.

## Absorbed predecessor slices

S24 structured-fields-only metrics rule and SPIKE-D1's read-token question, as frozen in `requirements/observationagent.md:181`.

## Dependencies and gates

OBS-01 and OBS-02 merged. D4 selects REST token/Prometheus source; D9 keeps absolute thresholds; D13 allocates the safe-view migration number. Reviewer-authorized round-1 rework disposed F-OBS-06-A/B/C: 10 asks exercise the default queue band, provider latency is explicitly unavailable, and two new Q2 templates close the anomaly-copy gaps.
