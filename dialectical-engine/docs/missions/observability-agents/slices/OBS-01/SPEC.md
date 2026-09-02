# SPEC — OBS-01 Agent skeleton, infrastructure liveness, Mac notification, kill/mute

**Status:** FROZEN at creation (2026-09-01, REQ-OBS). No agent edits this file after creation. Scope change = new SPEC version, ratified by V.

**Mission:** `observability-agents` · **Product:** ObservationAgent · **Traces to:** V's goal ("an agent that checks our metrics and our observability part + the infrastructure … two standalone components … the fastest when it comes to observability"), intake C1/C3/C4, `requirements/observationagent.md` Q1 rows 1,3,16,18 · Q2 · Q3 · Q4 · Q5 · Q6.

**Measured on:** `dev @ 4f764037` (12 dirty entries). Probes 2026-09-01 20:42–20:45 UTC.

## Intent

The smallest complete proof that the platform is observed by something standalone: a host process V can install, see alive, silence and kill, that watches the two infrastructure containers and the Docker engine, stores every signal even when Postgres is down, and puts a banner on V's screen within 15 s of a fault — with the component and the impact in plain words. Every later OBS slice is a module dropped into the directory this slice creates.

## Ground truth this SPEC rests on (do not re-litigate)

- `compose.dev.yaml:4-23` — `postgres` has a `pg_isready` healthcheck every 2 s; `compose.dev.yaml:25-43` — `hatchet-lite` has NO healthcheck; both containers run with `restart=no` (`docker inspect`, 2026-09-01 20:44 UTC).
- Hatchet answers `GET /api/live` → 200 (empty body), `GET /api/ready` → 200 (empty body), `GET /api/v1/version` → 200 JSON on `127.0.0.1:8888` (measured 20:44 UTC; operations `liveness`/`readiness`/`version` in the Hatchet OpenAPI contract, `https://raw.githubusercontent.com/hatchet-dev/hatchet/main/api-contracts/openapi/openapi.yaml`). `GET /api/v1/meta` reports `"prometheusServerEnabled":false`.
- The Docker engine answers `docker version --format '{{.Server.Version}}'` → `29.7.2`; the dev stack itself checks the engine with `docker info --format {{.ServerVersion}}` (`apps/runner/src/dev-auth-data-plane.ts:286-299`).
- The ONLY lawful `process.env` reader is `packages/register/src/runtime-environment.ts` (`parseEnvironment`, lines 12-14; rule `tools/orphan-audit/src/index.ts:455`).
- The workspace glob `apps/*` (`pnpm-workspace.yaml:2`) registers a new package without editing root `package.json`.
- Obs roles are created idempotently with a random password when no setting is supplied (`migrations/0034_obs_foundation.sql:7-59`); the watchdog role's read set is `0034:353-357`; append-only tables use `core.reject_mutation()` triggers (`0034:278-296`).
- `readLivenessPolicy` fails closed on a missing register row (`packages/register/src/index.ts:136-147`) — the shape this agent copies for thresholds.
- `/usr/bin/osascript` exists; `osascript -e 'return 1'` → `1` (measured). No product launchd unit exists (`launchctl list`, measured); `~/Library/LaunchAgents` holds no product plist.
- `.local/dev-auth/api.env` is validated against an EXACT key list (`apps/runner/src/dev-api-process.ts:115-135`, `DEVELOPMENT_API_ENVIRONMENT_KEYS` at `dev-api-environment.ts:23`) — adding any key there breaks API start-up. This slice never touches it.
- Severity ladder `INFO < DEGRADED < SEVERE < FATAL` (`0034:92`).

## Requirements

### OBS-01-R01 — Own process, own package, module discovery
`apps/observation-agent/package.json` (name `@debateai/observation-agent`) with entry `src/main.ts` runs as ONE long-lived Node process (`node --import tsx src/main.ts` in dev). At boot it discovers modules by directory: every `src/modules/<name>/module.ts` that default-exports the `Module` interface is loaded; there is no central registration file. On invalid configuration the process prints exactly one code (`OBSERVATION_<REASON>`) to stderr and exits with code 2 within 5 s.

### OBS-01-R02 — Environment through the register loader only
Exactly one exported function `loadObservationAgentEnvironment()` is appended to `packages/register/src/runtime-environment.ts`, strict on: `OBSERVATION_DATABASE_URL` (url), `OBSERVATION_STATE_DIR` (min 1), `OBSERVATION_TARGETS_PATH` (min 1), `OBSERVATION_HATCHET_TOKEN_PATH` (optional, min 1). No file under `apps/observation-agent/` contains the string `process.env`; after this slice `pnpm audit:source` reports zero blocking entries whose path starts with `apps/observation-agent/`.

### OBS-01-R03 — Own schema, own role, append-only tables (migration `observation_foundation`)
One migration file (number allocated by the orchestrator) creates: schema `observation`; role `debateai_observation_agent` (`LOGIN NOINHERIT NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS`, random password unless `current_setting('debateai.observation_agent_password', true)` is set — the `0034:14-48` pattern); tables `observation.heartbeat`, `observation.signal` (`seq bigserial UNIQUE`, `signal_id uuid PK`, `state`, `class`, `component`, `severity`, `impact_code`, `first_failed_probe_at`, `detected_at`, `evidence jsonb`, `suspected_defect boolean`, `defect_kind`, `run_ref uuid`, `work_item_ref uuid`, `threshold_version int`, `clears_signal_id uuid`, `recorded_at`; `CHECK` constraints enumerate every `class`, `component`, `severity`, `impact_code`, `defect_kind` value listed in `requirements/observationagent.md` Q2 — no free-text column exists), `observation.delivery`, `observation.threshold_policy`, `observation.sample_ring` (`(metric_key, bucket)` PK), `observation.sample_hourly`, `observation.job_completion`; views `observation.open_signal_v` and `observation.defect_signal_v`. Grants: the agent role gets `INSERT, SELECT` on `signal, delivery, threshold_policy, sample_hourly, job_completion`, `INSERT, SELECT, UPDATE` on `heartbeat, sample_ring`, `SELECT` on the same `obs.*` relations as `debateai_obs_watchdog` (`0034:353-357`), `USAGE` on schemas `observation` and `obs`; `debateai_obs_listener` gets `SELECT` on `observation.defect_signal_v`. `reject_mutation`/`reject_truncate` triggers (`core.reject_mutation()`) guard `signal, delivery, threshold_policy, sample_hourly, job_completion`. The agent role holds NO privilege on any relation outside schemas `observation` and `obs` — verifiable with `information_schema.role_table_grants`.

### OBS-01-R04 — Four liveness probes, from a validated targets file
`deploy/observation-agent/targets.dev.json` (zod-validated, closed `component` enum) declares the OBS-01 targets; the `core-liveness` module probes each on its cadence: **postgres** — TCP connect `127.0.0.1:55432` + `SELECT 1` on a dedicated probe connection, plus `docker inspect` `State.Status` of `debateai-v3-postgres-1`; **hatchet** — `GET http://127.0.0.1:8888/api/live` → 200 (LIVE) and `GET /api/ready` → 200 (READY; live-but-not-ready opens `INFRA_NOT_READY` instead of `INFRA_DOWN`), plus container state of `debateai-v3-hatchet-lite-1`; **docker** — `docker info --format '{{.ServerVersion}}'` exits 0 within 2 s (engine down ⇒ both container states become UNKNOWN, class `INFRA_UNKNOWN`, never DOWN); **observation_agent** — the heartbeat write succeeds. Every HTTP probe sends `Connection: close` and `User-Agent: dialectical-engine-observation-agent`.

### OBS-01-R05 — Consecutive-failure rule and cadence (defaults v1)
Probe interval 5 s, probe timeout 2 s; a component opens a signal after 2 consecutive failed probes (`first_failed_probe_at` = the first of the two) and clears it after 2 consecutive successful probes. One OPEN signal per (component, class) at a time. All four numbers come from the thresholds policy (R14), never from code constants.

### OBS-01-R06 — Typed signal, closed vocabulary
A signal is exactly the field set of `requirements/observationagent.md` Q2, validated by one zod schema before it is journaled and by the `CHECK` constraints of R03 when mirrored. `evidence` keys are allow-listed per class (for liveness: `probe`, `target`, `consecutive_failures`, `threshold`, `last_status`, `container_status`, `restart_policy`, `exit_code`); values are numbers, enums, UUIDs or ISO timestamps. `impact_code` is chosen from the fixed vocabulary; the sentence is rendered from the code, never composed.

### OBS-01-R07 — Journal-first storage with a Postgres mirror
Every signal and every delivery attempt is appended (one JSON line, `fsync` before return) to `${OBSERVATION_STATE_DIR}/journal/signals-YYYY-MM-DD.jsonl` / `deliveries-YYYY-MM-DD.jsonl` BEFORE any Postgres write or notification. A mirror task inserts journaled rows into `observation.*` in `seq` order, idempotent on `signal_id`; mirror lag ≤ 5 s while Postgres is UP; during a Postgres outage the journal keeps accepting writes and the mirror catches up within 10 s of Postgres returning READY. A journal write failure raises `AGENT_SELF SEVERE` delivered by osascript directly, bypassing the store.

### OBS-01-R08 — macOS notification channel
For every OPEN with severity ≥ SEVERE and for its CLEARED: `/usr/bin/osascript -e 'display notification "<impact sentence>" with title "dialectical-engine: <component> <severity>" subtitle "<class>"'`, returning within 2 s; each attempt writes a `observation.delivery` row (`channel='osascript'`, `outcome ∈ {DELIVERED, FAILED, MUTED, RATE_LIMITED}`). Rate limit: one notification per (component, class) per 10 min, except CLEARED and severity escalation. Text is template-only (R06).

### OBS-01-R09 — Digest file and status snapshot
`${OBSERVATION_STATE_DIR}/digest/YYYY-MM-DD.md` gains one appended line per signal: `HH:MM:SSZ · <severity> · <component> · <class> · <impact sentence> · <signal_id>`. `${OBSERVATION_STATE_DIR}/status.json` is rewritten atomically (temp file + rename) every cycle with: agent pid/version/thresholds version/mute state, and per component `state ∈ {UNKNOWN, UP, SUSPECT, DOWN, RECOVERING}`, `last_probe_at`, `last_ok_at`, open signal ids.

### OBS-01-R10 — launchd unit, externally observable liveness
`deploy/observation-agent/launchd/com.dialectical-engine.observation-agent.plist` (template: `RunAtLoad`, `KeepAlive`, `ThrottleInterval 10`, `StandardOutPath`/`StandardErrorPath` under the state dir, `ProgramArguments` → `apps/observation-agent/bin/launch.sh`). `launch.sh` refuses to start unless `${HOME}/.local/dev-auth/observation-agent.env` exists with mode `0600` and the current uid as owner, sources it, and `exec`s the agent (the shell sets the environment; the Node process reads it only through R02). `pnpm -C apps/observation-agent oactl install` renders the plist into `~/Library/LaunchAgents/` and runs `launchctl bootstrap gui/$(id -u) <plist>`; `oactl uninstall` reverses both. Liveness is visible without the agent's help: `launchctl list | grep com.dialectical-engine.observation-agent` prints a PID; `${OBSERVATION_STATE_DIR}/heartbeat` mtime is ≤ 15 s old; `observation.heartbeat.observed_at` is ≤ 15 s old while Postgres is UP.

### OBS-01-R11 — `oactl` verbs
`pnpm -C apps/observation-agent oactl <verb>` with verbs: `provision` (as the dev admin — `postgresql://debateai:debateai-dev-only@127.0.0.1:55432/debateai`, the committed dev-only credential of `compose.dev.yaml:7-9` — sets the agent role's password and writes `.local/dev-auth/observation-agent.env` mode `0600` with the four R02 keys), `install`, `uninstall`, `start` (`launchctl kickstart`), `kill` (`launchctl bootout` + SIGTERM; SIGKILL if still alive at 5 s), `status` (renders `status.json` as a table; works while Postgres is down), `mute <duration> [--component <c>]` (writes `${OBSERVATION_STATE_DIR}/MUTE` with expiry and scope), `unmute`, `thresholds apply <file> --source-ref <ref>` and `thresholds show`. Every verb exits 0 on success and non-zero with one `OBSERVATION_<REASON>` code otherwise.

### OBS-01-R12 — Read-only by construction
All Docker invocations go through one module whose argv table is frozen to `ps`, `inspect`, `stats --no-stream`, `events`, `info`, `version`, `system df`; an architecture test (`tests/architecture/obs-agent-01-*.test.ts`) fails if any other `docker` argv literal appears under `apps/observation-agent/`. A second architecture test asserts the import graph: nothing under `apps/observation-agent/` imports from `apps/api`, `apps/runner`, `apps/ui`, `packages/obs-capture`, `packages/crypto`, `packages/db/src/identity.ts`, or any `zone_path_prefixes` entry (`packages/obs-capture/src/zone/manifest.ts:16-25`). A third test queries `information_schema.role_table_grants` for `debateai_observation_agent` and asserts no `INSERT`, `UPDATE`, `DELETE`, `TRUNCATE` outside schema `observation`.

### OBS-01-R13 — Overhead bound
Averaged over any 5-minute window: CPU ≤ 2.0 % of one core (`ps -o %cpu`), RSS ≤ 150 MB, ≤ 2 sessions in `pg_stat_activity` for `usename='debateai_observation_agent'`; every agent session runs `SET statement_timeout = 2000`; probe timeouts 2 s; cadence floors: liveness ≥ 5 s.

### OBS-01-R14 — Thresholds policy: ratified rows, fail-closed, reloadable
`observation.threshold_policy(version int PK, applied_at, ratified_by text, source_ref text, value_json jsonb)`. `oactl thresholds apply <file> --source-ref <ref>` validates the file against the zod schema, prints a field-level diff against the version in force, and inserts the next version (never updates). The agent refuses to start when no row exists (`OBSERVATION_THRESHOLDS_UNRESOLVED`, exit 2), reads `max(version)` at boot and once per cycle, and emits `THRESHOLD_CHANGED INFO` (`IMPACT_THRESHOLDS`) on a version change. `deploy/observation-agent/thresholds/defaults/OBS-01.json` ships the v1 numbers of R05, R08, R13 and the routing rows for `INFRA_*` and `AGENT_SELF`; `apply` merges every `defaults/*.json` present with the given file (later slices add their own defaults file, never edit this one).

### OBS-01-R15 — Self-signals and heartbeat
`AGENT_SELF INFO` with `IMPACT_AGENT_START` at boot (evidence carries the previous run's exit reason if the journal shows no clean stop), `IMPACT_AGENT_STOP` on SIGTERM (graceful stop completes within 5 s), `AGENT_SELF SEVERE` with `IMPACT_AGENT_JOURNAL` when the journal cannot be written; heartbeat file and row every 5 s.

## States

- Component: `UNKNOWN` → `UP` → `SUSPECT` (1 failure) → `DOWN` (2 failures; signal OPEN) → `RECOVERING` (1 success) → `UP` (2 successes; signal CLEARED). `INFRA_UNKNOWN` is the state of both containers while `docker` is DOWN.
- Signal: `OPEN` → `CLEARED` (a second, immutable row).
- Agent: `STARTING` → `RUNNING` → (`MUTED` overlay) → `STOPPING`.

## Vocabulary (copy V will read)

Titles: `dialectical-engine: postgres FATAL`, `dialectical-engine: hatchet FATAL`, `dialectical-engine: hatchet DEGRADED` (not ready), `dialectical-engine: docker FATAL`, `dialectical-engine: observation_agent SEVERE`. Bodies: `IMPACT_PG_DOWN`, `IMPACT_HATCHET_DOWN`, `IMPACT_HATCHET_NOT_READY`, `IMPACT_DOCKER_DOWN`, `IMPACT_AGENT_JOURNAL`, `IMPACT_CLEARED` — sentences verbatim from `requirements/observationagent.md` Q2. Severity fixed for this slice: postgres/hatchet/docker `INFRA_DOWN` = FATAL; `INFRA_NOT_READY` = DEGRADED (osascript only if OPEN ≥ 15 min); `INFRA_UNKNOWN` = SEVERE.

## V-runnable acceptance (real dev stack, this Mac)

All commands from `/Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine`. `PSQL` below means `docker exec -i debateai-v3-postgres-1 psql -U debateai -d debateai -Atc`.

1. Apply the migration the way the dev stack does: `MIGRATION_DATABASE_URL=postgresql://debateai:debateai-dev-only@127.0.0.1:55432/debateai pnpm db:migrate` → exits 0; `PSQL "select count(*) from information_schema.tables where table_schema='observation'"` prints `7`.
2. `pnpm -C apps/observation-agent oactl provision` → prints `PROVISIONED .local/dev-auth/observation-agent.env`; `stat -f '%Lp' .local/dev-auth/observation-agent.env` prints `600`.
3. `pnpm -C apps/observation-agent oactl thresholds apply deploy/observation-agent/thresholds/defaults/OBS-01.json --source-ref OBS-01-v1` → prints `THRESHOLDS v1 APPLIED`; `PSQL "select version from observation.threshold_policy"` prints `1`.
4. `pnpm -C apps/observation-agent oactl install` → within 10 s `launchctl list | grep com.dialectical-engine.observation-agent` prints a line with a numeric PID; `pnpm -C apps/observation-agent oactl status` prints `postgres UP`, `hatchet UP`, `docker UP`, `observation_agent UP`; `stat -f '%m' "$(jq -r .state_dir ~/.local/dev-auth/observation-agent.state 2>/dev/null || echo ~/.local/state/dialectical-engine/observation-agent)/heartbeat"` is within 15 s of `date +%s` (ARCH pins the exact state-dir path in `oactl status` output).
5. Fault: `date -u +%FT%TZ; docker stop debateai-v3-hatchet-lite-1` → within 15 s a macOS banner titled `dialectical-engine: hatchet FATAL`, subtitle `INFRA_DOWN`, body `Hatchet is down: asks are accepted but no debate work is dispatched or run.`; `oactl status` prints `hatchet DOWN`; the day's digest file has a new `FATAL · hatchet · INFRA_DOWN` line.
6. Measure: `docker inspect -f '{{.State.FinishedAt}}' debateai-v3-hatchet-lite-1` (fault time) and `PSQL "select detected_at, first_failed_probe_at from observation.signal where component='hatchet' and class='INFRA_DOWN' and state='OPEN' order by seq desc limit 1"` → `detected_at − FinishedAt ≤ 12 s`; `PSQL "select delivered_at from observation.delivery where channel='osascript' order by attempted_at desc limit 1"` → `delivered_at − detected_at ≤ 3 s`.
7. Recovery: `docker start debateai-v3-hatchet-lite-1` → within 15 s a banner titled `dialectical-engine: hatchet CLEARED`; `oactl status` prints `hatchet UP`; `PSQL "select state from observation.signal where component='hatchet' order by seq desc limit 1"` prints `CLEARED`; `docker inspect -f '{{.State.StartedAt}}' …` vs the CLEARED row's `detected_at` ≤ 12 s.
8. Mute: `pnpm -C apps/observation-agent oactl mute 10m` → prints `MUTED until <time>`; repeat step 5 → NO banner within 60 s, but the digest line and the `OPEN` row exist and `PSQL "select outcome from observation.delivery order by attempted_at desc limit 1"` prints `MUTED`; `docker start debateai-v3-hatchet-lite-1`; `oactl unmute`.
9. Postgres outage (cascade disclosed): `docker stop debateai-v3-postgres-1` → within 15 s a banner `dialectical-engine: postgres FATAL` / `Postgres is down: every debate read and write fails; nothing can be dispatched or recorded.`; `tail -1 <state_dir>/journal/signals-$(date -u +%F).jsonl` shows the OPEN line although Postgres is down; `docker start debateai-v3-postgres-1` → CLEARED banner within 15 s of the container's `StartedAt` + readiness; within 10 s more, `PSQL "select count(*) from observation.signal where component='postgres'"` counts the journaled OPEN and CLEARED rows. UNVERIFIED before this run: whether `hatchet-lite` exits when it loses its database (its `restart` policy is `no`); if it does, a `hatchet FATAL` banner names it and V runs `docker start debateai-v3-hatchet-lite-1`.
10. Read-only proof: `PSQL "select count(*) from information_schema.role_table_grants where grantee='debateai_observation_agent' and privilege_type in ('INSERT','UPDATE','DELETE','TRUNCATE') and table_schema<>'observation'"` prints `0`; `grep -rE 'docker[^a-z]+(start|stop|restart|kill|rm|pause|compose)' apps/observation-agent/src | wc -l` prints `0`.
11. Overhead after ≥ 5 min running: `ps -o %cpu=,rss= -p $(launchctl list | awk '/com.dialectical-engine.observation-agent/{print $1}')` → `%cpu ≤ 2.0` and `rss ≤ 153600`; `PSQL "select count(*) from pg_stat_activity where usename='debateai_observation_agent'"` prints `1` or `2`.
12. Kill: `pnpm -C apps/observation-agent oactl kill` → within 5 s `launchctl list | grep com.dialectical-engine.observation-agent` prints nothing and `ps -Ao pid,command | grep '[o]bservation-agent/src/main.ts'` prints nothing; the product is untouched: `curl -s -o /dev/null -w '%{http_code}' http://127.0.0.1:8888/api/live` prints `200`; `pnpm -C apps/observation-agent oactl start` → a PID again within 10 s and a digest line `INFO · observation_agent · AGENT_SELF · … started`.
13. Reboot survival (V's choice of moment): after a macOS restart and login, `launchctl list | grep com.dialectical-engine.observation-agent` prints a PID without any manual start, and the digest carries an `AGENT_SELF` start line stamped after the boot.

## Out of scope (named successors)

API/UI/TLS/runner process probes and the dev-stack composite (OBS-02) · stall/queue detectors and the FixAgent view's rows (OBS-03 — the view exists empty from R03) · capture health (OBS-04) · capacity and host metrics (OBS-05) · throughput and Hatchet metrics (OBS-06) · sendmail, tickets, status page, escalation ladder (OBS-07) · the target server (OBS-08, deferred) · any write to `compose.dev.yaml` (healthcheck/restart policy is a finding, F2, routed to V).

## Parallel-safety (single-writer rule)

OWNED by OBS-01: `apps/observation-agent/**` except `src/modules/**` subdirectories claimed by later slices (OBS-01 owns `src/main.ts`, `src/core/**`, `src/modules/core-liveness/**`, `src/modules/self/**`, `src/notify/osascript.ts`, `src/notify/digest.ts`, `src/store/**`, `src/journal/**`, `src/docker/**`, `src/oactl/**`, `bin/**`, `package.json`, `tsconfig.json`) · `deploy/observation-agent/launchd/**` · `deploy/observation-agent/targets.dev.json` · `deploy/observation-agent/thresholds/defaults/OBS-01.json` · `deploy/observation-agent/thresholds/schema.json` · `migrations/<n>_observation_foundation.sql` · `tests/unit/obs-agent-01-*.test.ts`, `tests/integration/obs-agent-01-*.test.ts`, `tests/architecture/obs-agent-01-*.test.ts`. SHARED, append-only, orchestrator-sequenced: `packages/register/src/runtime-environment.ts` (one exported function at the end of the file). NEVER: root `package.json`, `pnpm-workspace.yaml`, `compose.dev.yaml`, `.local/dev-auth/api.env`, `apps/runner/src/dev-api-environment.ts`, `apps/runner/src/dev-database-principals.ts`, anything in the zone. Standing tests that READ files this slice WRITES: the `audit:source` rules over `apps/**` and `packages/register/**` (`tools/orphan-audit/src/index.ts:443-480`) — ARCH lists them in PLAN.

## Absorbed predecessor slices (design lineage, `docs/missions/2026-08-21-observability-loop/planning/VerticalSlices.md`)

S22 `obsctl` status/kill/arm (`:307-315`) → `oactl status/kill/mute` · S23 notifications via `osascript`, template-only, delivery self-events (`:316-324`) · S25 daemon KeepAlive plist (`:334-342`) → the agent's own launchd unit.

## Dependencies and gates

None upstream. Migration application and `oactl provision/install` are V's acts (persistence floor, launchd persistence). V rows that shape this slice: D2 (thresholds home), D3 (tree location), D13 (migration number), D14 (fail-closed). If V rules D2 = (b) or D3 = (b), this SPEC is superseded by a v2, not edited.
