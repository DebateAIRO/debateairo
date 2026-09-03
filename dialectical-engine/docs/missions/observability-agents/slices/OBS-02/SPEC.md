# SPEC — OBS-02 Product process liveness, restart witnesses, expected-set

**Status:** FROZEN at creation (2026-09-01, REQ-OBS). No agent edits this file after creation. Scope change = new SPEC version, ratified by V.

**Mission:** `observability-agents` · **Product:** ObservationAgent · **Traces to:** `requirements/observationagent.md` Q1 rows 5, 6 (presence half), 7, 9, 10, 13, 17 · Q2 · Q3 · Q5. Builds on OBS-01 (module directory, signal store, channels, thresholds).

**Measured on:** `dev @ 4f764037`. The https dev stack was DOWN during measurement (`curl -sk https://localhost:3000/` → `000`; `http://127.0.0.1:3001/` → `000`).

## Intent

Make the product's own processes visible: the API on 8790, the UI on 3001, the TLS front door on 3000, the runner process, the Kanban board — and witness restarts and never-starts of the two containers. The dev stack is one supervisor that stops every child when one exits (`apps/runner/src/dev-auth-stack.ts:155-159, 185-204`), so the agent must name the dev stack as the root instead of four separate alarms.

## Ground truth this SPEC rests on (do not re-litigate)

- API readiness contract: `GET http://127.0.0.1:8790/v1/session` → exactly `401` with `content-type: application/json` and body `{"error":"SESSION_REQUIRED"}` (`apps/runner/src/dev-api-process.ts:19-20, 224-228`); the route exists at `apps/api/src/index.ts:820`; it is unauthenticated-safe and outside the zone `mount_list` (`packages/obs-capture/src/zone/manifest.ts:36-40`).
- UI readiness: `GET http://127.0.0.1:3001/login` → 200 `text/html` containing `Back to the graph.` and `GET /api/v1/session` → the exact 401 above (`dev-ui-process.ts:54-65`); the server binds `PORT`/`DIALECTICAL_UI_HOST` (`apps/ui/server.mjs:10-16, 32`).
- TLS front door: binds `127.0.0.1:3000`, proxies `3001` (`deploy/dev-auth/tls-front-door.mjs:16`), readiness = same two paths through https with system trust (`:46-49`), prints `DEV_TLS_FRONT_DOOR_READY https://localhost:3000:SYSTEM_TRUST` (`:346`).
- Runner: spawned as `node …/tsx/dist/cli.mjs apps/runner/src/main.ts` with stdout/stderr ignored (`dev-runner-process.ts:178-182`); readiness is one IPC message (`main.ts:142-149`). `pgrep -f` is unreliable on long argv — probe with `ps -Ao pid,command | grep '[a]pps/runner/src/main.ts'` (TOOLING-TRAPS).
- The supervisor races child exits and stops everything (`dev-auth-stack.ts:155-159`, `superviseDevelopmentAuthStack` `:185-204`); a stopped stack is the DESIGNED state when V is not running it.
- Containers: `restart=no` for both; `docker inspect` exposes `State.Status`, `State.StartedAt`, `State.FinishedAt`, `State.ExitCode`, `RestartCount`, `HostConfig.RestartPolicy.Name` (measured 2026-09-01 20:44 UTC).
- Scheduler jobs are one-shot CLIs (`apps/scheduler/src/cli.ts:5-24`); nothing schedules them (no crontab, no launchd, measured; E6-06 `POST-SYNTHESIS-RULINGS.md:68-69`); the target plan makes them profiled one-shots with a completion criterion (`docs/missions/2026-08-21-docker-hatchet/architecture/Plan.md` §2.7.2, V-11).
- Hermes Kanban serves `127.0.0.1:9119` and stays on the host (`Plan.md:238`); the CLI reached it during this seat's run.
- `EvaluatorDispatchBinding.state` is `"UNBOUND"` (`packages/evaluator/src/dispatch-binding.ts:7-8, 27-35`) — no evaluator-worker process exists to probe.

## Requirements

### OBS-02-R01 — Five product probes
Module `product-liveness` probes on the OBS-01 cadence (5 s / 2 s): **api** — the exact-401 contract above (any other status or body = failure); **ui** — `/login` 200 text/html containing `Back to the graph.` AND `/api/v1/session` exact 401; **tls_front_door** — `GET https://localhost:3000/login` → 200 using system trust only (no `rejectUnauthorized=false`; a trust failure is a probe failure with `evidence.last_status = TLS_TRUST`); **runner** — a process whose command line contains `apps/runner/src/main.ts` exists (`ps -Ao pid,command`); **kanban** — `GET http://127.0.0.1:9119/` returns any HTTP status 200–499 within 2 s (every 30 s). Probes never send credentials, cookies or bodies.

### OBS-02-R02 — Expected-set model
`targets.dev.json` gives every component an `expected` value: `always` (postgres, hatchet, docker, kanban, observation_agent), `when_dev_stack` (api, ui, tls_front_door, runner), `never` (evaluator_worker — recorded as `UNBOUND by register`, no probe). A `when_dev_stack` component that is DOWN while no member of the group has been UP in the last 10 min is `IMPACT_DEV_STACK_NOT_RUNNING` — one INFO signal on `component=dev_stack` per transition, digest only, no banner.

### OBS-02-R03 — Dev-stack root attribution
When ≥ 1 member of the `when_dev_stack` group was UP within the last 10 min and ALL members are DOWN in the same cycle, the agent opens ONE `dev_stack SEVERE INFRA_DOWN` signal with `IMPACT_DEV_STACK_EXITED` and suppresses the four member signals (they are listed in `evidence.members`). When only some members are DOWN, each gets its own signal (`api SEVERE`, `ui SEVERE`, `tls_front_door SEVERE`, `runner SEVERE`). Members that recover clear the composite when all four are UP for 2 cycles.

### OBS-02-R04 — Container restart witness
Every 5 s, for `debateai-v3-postgres-1` and `debateai-v3-hatchet-lite-1`, the `witness` module reads `docker inspect` (`Status, StartedAt, FinishedAt, ExitCode, RestartCount, RestartPolicy.Name`). A changed `StartedAt` opens-and-clears one `RESTART_WITNESSED INFO` (`IMPACT_RESTART`) with the old and new start times in `evidence`. `Status=exited` contributes `evidence.restart_policy` and `evidence.exit_code` to the OBS-01 `INFRA_DOWN` signal so the digest line reads `… restart_policy=no exit_code=N`.

### OBS-02-R05 — Never-started witness
An `expected: always` component that has not been UP once within 60 s of agent start opens `EXPECTED_ABSENT SEVERE` (`IMPACT_EXPECTED_ABSENT`); it clears on the first UP.

### OBS-02-R06 — Probe latency samples and thresholds
Every probe's round-trip (ms) is written to `observation.sample_ring` (`metric_key = probe.<component>.latency_ms`). p95 over the last 5 min above the threshold opens `INFRA_DEGRADED DEGRADED` — hmm, class name fixed as `INFRA_NOT_READY`? No: class `CAPACITY` is for resources; latency uses class `THROUGHPUT_ANOMALY` with `impact_code = IMPACT_LATENCY`? The vocabulary must stay closed: this requirement uses class `INFRA_NOT_READY`, severity DEGRADED, `evidence.p95_ms` and `evidence.threshold_ms`, impact `IMPACT_HATCHET_NOT_READY` is wrong for api/ui — therefore this SPEC ADDS one impact code to the vocabulary: `IMPACT_SLOW` "<component> answered its liveness probe in P ms at p95 over 5 minutes: users are waiting." Defaults v1: api 500 ms, ui 2000 ms (dev mode), tls_front_door 2500 ms.

### OBS-02-R07 — Scheduler job completion witness
`pnpm -C apps/observation-agent oactl witness --job <name> -- <command…>` runs the given command as a child, records `observation.job_completion(job, started_at, completed_at, exit_code, report_ok)` (`report_ok` = stdout parsed as one JSON object, per `apps/scheduler/src/cli.ts:21`), and exits with the child's exit code. The agent never launches a job by itself. While no cadence row exists in thresholds for a job, `status.json` shows `scheduler.<job>: NO SCHEDULE RULED (V row D10)`. When a cadence row exists (`schedule.<job>.cadence_s`, `grace_s`), a missing completion within `cadence_s + grace_s` opens `SCHEDULE_MISSED SEVERE` (`IMPACT_SCHEDULE_MISSED`).

### OBS-02-R08 — Digest and status for this slice
`status.json` gains the five components plus `dev_stack` (group state, last UP time of any member) and the container witness block (`started_at`, `restart_count`, `restart_policy`, `exit_code`). Digest lines follow OBS-01-R09.

### OBS-02-R09 — No product process is ever signalled
The agent never sends a signal to, spawns, or waits on any product process; `process.kill` appears nowhere under `apps/observation-agent/src/modules/product-liveness/**` or `src/modules/witness/**` (architecture test `tests/architecture/obs-agent-02-*.test.ts`), and the docker argv allow-list of OBS-01-R12 is unchanged.

### OBS-02-R10 — Defaults and routing rows for this slice
`deploy/observation-agent/thresholds/defaults/OBS-02.json` ships: probe cadences, the 10-min group memory, the 60 s never-started window, the three latency thresholds, and routing rows for `dev_stack`, `api`, `ui`, `tls_front_door`, `runner`, `kanban` (`INFRA_DOWN` = SEVERE; `dev_stack` composite = SEVERE; `RESTART_WITNESSED`, `IMPACT_DEV_STACK_NOT_RUNNING` = INFO; `EXPECTED_ABSENT` = SEVERE).

## States

Per component as OBS-01. Group `dev_stack`: `NOT_RUNNING` (INFO once) → `RUNNING` (all four UP) → `PARTIAL` (some DOWN: member signals) → `EXITED` (all DOWN within 10 min of RUNNING: one composite SEVERE) → `RUNNING` (CLEARED).

## Vocabulary (copy V will read)

Titles `dialectical-engine: dev_stack SEVERE`, `dialectical-engine: api SEVERE`, `dialectical-engine: ui SEVERE`, `dialectical-engine: tls_front_door SEVERE`, `dialectical-engine: runner SEVERE`, `dialectical-engine: kanban SEVERE`. Bodies: `IMPACT_DEV_STACK_EXITED`, `IMPACT_DEV_STACK_NOT_RUNNING` (digest only), `IMPACT_API_DOWN`, `IMPACT_UI_DOWN`, `IMPACT_TLS_DOWN`, `IMPACT_WORKER_LOST` is NOT used here (that is OBS-03's heartbeat class) — runner process absence uses `IMPACT_RUNNER_GONE` "The runner process is gone: queued debate work is not picked up." (ADDED to the vocabulary by this SPEC), `IMPACT_RESTART`, `IMPACT_EXPECTED_ABSENT`, `IMPACT_SLOW`, `IMPACT_SCHEDULE_MISSED`, `IMPACT_CLEARED`.

## V-runnable acceptance (real dev stack, this Mac)

`PSQL` = `docker exec -i debateai-v3-postgres-1 psql -U debateai -d debateai -Atc`. OBS-01 is installed and running.

1. With the dev stack DOWN: `pnpm -C apps/observation-agent oactl status` prints `dev_stack NOT_RUNNING`, `api —`, `ui —`, `tls_front_door —`, `runner —`, `kanban UP`, `evaluator_worker UNBOUND by register`; the digest has exactly ONE `INFO · dev_stack · INFRA_DOWN · The dev stack is not running.` line for this period (re-run `status` twice more — no new line).
2. `pnpm dev:auth:up` in a second terminal → when it prints `DEV_TLS_FRONT_DOOR_READY https://localhost:3000:SYSTEM_TRUST` … `RUNNER_NOT_STARTED`/`REGISTERED` (its own receipt), within 60 s `oactl status` prints `api UP`, `ui UP`, `tls_front_door UP`, `runner UP`, `dev_stack RUNNING`; no banner was shown (INFO only).
3. Latency: `PSQL "select count(*) from observation.sample_ring where metric_key='probe.api.latency_ms' and observed_at > now() - interval '2 minutes'"` prints ≥ 20.
4. Fault: `date -u +%FT%TZ; kill $(ps -Ao pid,command | awk '/[s]erver\.mjs --dev/{print $1}')` → the dev-stack terminal exits with `DEV_AUTH_STACK_UI_EXITED`; within 15 s ONE banner `dialectical-engine: dev_stack SEVERE` / `The https dev stack exited (its supervisor stops every child when one exits): API, UI, front door and runner are all down.`; `PSQL "select component, state from observation.signal where detected_at > now() - interval '1 minute' order by seq"` shows exactly one `dev_stack | OPEN` row and no `api|ui|tls_front_door|runner` OPEN rows.
5. Measure: V's `date -u` from step 4 vs the row's `detected_at` ≤ 15 s.
6. Restart the stack: `pnpm dev:auth:up` → within 60 s of its READY line a banner `dialectical-engine: dev_stack CLEARED`; `oactl status` shows all four UP.
7. Partial fault: with the stack UP, `kill -STOP $(ps -Ao pid,command | awk '/[a]pps\/api\/src\/main.ts/{print $1}')` → within 15 s a banner `dialectical-engine: api SEVERE` / `The API is down: the app cannot sign in, ask, or read debates.` and NO `dev_stack` composite (ui/tls still answer their own `/login`; the tls probe of `/login` is served by the UI, so `tls_front_door` stays UP); `kill -CONT` the same pid → `api CLEARED` within 15 s.
8. Restart witness: `docker stop debateai-v3-hatchet-lite-1 && docker start debateai-v3-hatchet-lite-1` → within 15 s the digest has an `INFO · hatchet · RESTART_WITNESSED · hatchet restarted (start time changed).` line with two timestamps in the evidence column of `PSQL "select evidence from observation.signal where class='RESTART_WITNESSED' order by seq desc limit 1"`.
9. Never-started: `pnpm -C apps/observation-agent oactl kill`; `docker stop debateai-v3-hatchet-lite-1`; `oactl start` → after 60 s a banner `dialectical-engine: hatchet SEVERE` / `hatchet is expected to run and has not been seen since the agent started.` (in addition to OBS-01's FATAL `INFRA_DOWN`); `docker start …` → both clear within 15 s.
10. Job witness: `REPLAY_SELF_TEST_DATABASE_URL="$(grep '^REPLAY_SELF_TEST_DATABASE_URL=' .local/dev-auth/database-principals.env | cut -d= -f2-)" pnpm -C apps/observation-agent oactl witness --job replay-self-test -- pnpm job:replay-self-test` → exits with the job's code and `PSQL "select job, exit_code, report_ok from observation.job_completion order by completed_at desc limit 1"` prints `replay-self-test | <code> | t` (or `f` when the job printed no JSON); `oactl status` prints `scheduler.replay-self-test: NO SCHEDULE RULED (V row D10) · last completion <time> exit <code>`.
11. Read-only: `grep -rn 'process.kill\|child_process' apps/observation-agent/src/modules/product-liveness apps/observation-agent/src/modules/witness | wc -l` prints `0`.

## Out of scope (named successors)

Runner heartbeat age via Hatchet (OBS-03) · installing launchd plists for the product runtimes or the scheduler jobs (V's act, D10; S14 shape) · any change to `dev-auth-stack.ts` exit semantics (product behaviour; finding F3 is routed) · admin UI (D8).

## Parallel-safety (single-writer rule)

OWNED: `apps/observation-agent/src/modules/product-liveness/**`, `src/modules/witness/**`, `src/modules/expectations/**`, `src/modules/job-witness/**`, `src/oactl/witness.ts` (new verb file; the verb table in `src/oactl/main.ts` is OBS-01's — ARCH states how a slice adds a verb without editing OBS-01's file, e.g. verb discovery by directory), `deploy/observation-agent/thresholds/defaults/OBS-02.json`, the `expected` and product-target entries of `deploy/observation-agent/targets.dev.json` (this file is OBS-01's; OBS-02 appends entries — sequenced after OBS-01 merges), `tests/{unit,integration,architecture}/obs-agent-02-*.test.ts`. NEVER: OBS-01's files except the two appends named, product files, zone.

## Absorbed predecessor slices

S14 product-runtime KeepAlive **witnesses** (`VerticalSlices.md:223-231` — the never-started witness RT-01) · S20 expected-process presence (`:289-297`).

## Dependencies and gates

OBS-01 merged (worktree cut from its merged `dev`). V rows: D10 (scheduling), D8 (admin page later).
