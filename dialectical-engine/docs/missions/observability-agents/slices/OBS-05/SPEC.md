# SPEC — OBS-05 Capacity: Postgres, host resources, certificate expiry

**Status:** FROZEN at creation (2026-09-02, REQ-OBS-FINISH projection); amended 2026-09-02 only for reviewer-authorized REQ-REV-OBS round-1 finding N1 and the N7 disjoint-target rule. The original exact-numerator defect remains recorded below and the superseding choice is appended to DECISIONS.

**Mission:** `observability-agents` · **Product:** ObservationAgent · **Traces to:** `requirements/observationagent.md` Q1 rows 1, 2, 10 and 14 · Q2 CAPACITY/CERT_EXPIRY · Q3 capacity/certificate budgets · Q4 G4/G5/G11/G12 · Q5 defaults · Q6 ring/hourly storage · Q7 OBS-05.

**Measured source:** frozen probes recorded Postgres `max_connections=100`, no `pg_stat_statements`, `log_min_duration_statement=-1`, `log_lock_waits=off`, host 10 cores/32 GiB and 582 GiB free of 926 GiB, with the live dev certificate under `.local/dev-auth/tls` (`requirements/observationagent.md:23-24,32,36`).

## Intent

Warn V before finite infrastructure resources are exhausted: Postgres connections, waiting locks, long and idle transactions, database size, host/Docker disk, memory pressure, sustained load, container resource use, and TLS certificate lifetime. Every measurement is numeric or enumerated; query text and certificate private keys never enter the agent.

## Ground truth this SPEC rests on (do not re-litigate)

- Postgres slow-query logging and `pg_stat_statements` are off; age-based `pg_stat_activity` detection needs D5 `pg_monitor`, while D6 keeps statement aggregation disabled for now (`requirements/observationagent.md:24,197-198`).
- The ObservationAgent may see session state/age to compute metrics but never selects, stores or renders `pg_stat_activity.query` (`requirements/observationagent.md:197`).
- Host measurements use `df`, `vm_stat`, load average, `docker stats --no-stream` and `docker system df`; Docker stays inside OBS-01's frozen read-only argv allow-list (`requirements/observationagent.md:36,110`).
- The agent reads `.local/dev-auth/tls/localhost.pem`, never `localhost-key.pem`; the leaf covers localhost addresses and is reused only while custody/validity remain valid (`deploy/dev-auth/README.md:46-49`).

## Requirements

### OBS-05-R01 — Postgres connection capacity
Every 30 s, module `postgres-capacity` reads active connection count and `max_connections` through one query under `statement_timeout=2000`. It records `postgres.connections.used` and `.max` samples and opens CAPACITY SEVERE at ≥ 80% and FATAL at ≥ 95%; it clears below the applicable band for two samples. The impact uses the measured total numerator and denominator from the threshold-crossing sample; the number of drill clients is never substituted for the measured total.

### OBS-05-R02 — Locks and transaction-age detectors (migration `observation_pg_monitor`)
Subject to V approving D5, the allocated migration grants `pg_monitor` to `debateai_observation_agent`. Every 30 s the module counts sessions waiting on locks for ≥ 60 s, measures longest transaction age, and counts idle-in-transaction sessions. It opens SEVERE for ≥ 1 lock waiter at 60 s, SEVERE for a transaction age ≥ 300 s, and DEGRADED for ≥ 5 idle-in-transaction sessions sustained 120 s. No selected column contains SQL text.

### OBS-05-R03 — Slow-query observability state
With D6 option (a), status prints `slow_queries: NOT OBSERVABLE (pg_stat_statements disabled)` and does not claim statement-level coverage. Active-session age from R02 is labelled `active_query_age_s`, never a query fingerprint or statement metric. If V later enables `pg_stat_statements`, that is a successor SPEC; this slice does not edit Postgres configuration or restart a container.

### OBS-05-R04 — Database size samples
Every 30 s, the module records `pg_database_size` for the `debateai` and `hatchet` databases as numeric bytes in the bounded sample ring and hourly rollup. Database size is displayed in status; the frozen defaults define no alarm threshold, so size alone opens no signal.

### OBS-05-R05 — Host and Docker disk capacity
Every 30 s, module `host-capacity` samples free/total bytes and free percent for `/`, plus numeric output from the read-only `docker system df` wrapper. Disk free below 15% opens CAPACITY DEGRADED; below 5% escalates to FATAL; two consecutive samples above 15% clear it. The detector never deletes images, volumes, journals or product data.

### OBS-05-R06 — Host memory and sustained load
Every 30 s, `vm_stat` pages are converted to bytes using the reported page size; available memory below 10% opens CAPACITY SEVERE with `IMPACT_MEMORY`. Load average above 2× the detected logical-core count for ten consecutive 30-second samples opens `CAPACITY/DEGRADED/IMPACT_LOAD`. Its OPEN evidence is exactly `load_one_minute`, `logical_cores`, `threshold_multiplier`, `sustained_seconds=300` under v1, and `observed_at`; percent, unit, and byte fields are forbidden. Both conditions clear after two samples below their thresholds. Raw command output is not stored.

### OBS-05-R07 — Container CPU and memory samples
Every 30 s, the OBS-01 Docker wrapper runs `stats --no-stream` for `debateai-v3-postgres-1` and `debateai-v3-hatchet-lite-1`, recording only CPU percent, memory-used bytes, memory-limit bytes and memory percent. These values appear in status and hourly rollups; the frozen defaults set no container-specific alert bands, so samples alone open no signal.

### OBS-05-R08 — TLS certificate lifetime
At boot and every 24 h, module `certificate-capacity` reads the certificate path declared in `deploy/observation-agent/targets.dev.d/OBS-05.json` (dev value `.local/dev-auth/tls/localhost.pem`) and records whole days until `notAfter`. It never reads or stats `localhost-key.pem`. CERT_EXPIRY opens DEGRADED at ≤ 14 days, SEVERE at ≤ 3 days, and FATAL after expiry; delivery occurs within 3 s of detection and clears after the configured certificate path presents a later valid expiry.

### OBS-05-R09 — V-versioned drill thresholds and rollback
`oactl thresholds apply` is the only way these bands change: every application validates, prints the field-level diff, inserts a new version and emits THRESHOLD_CHANGED INFO. This slice ships `deploy/observation-agent/thresholds/drill-connections-20pct.json` and the V-prepared disk-current-plus-one and certificate-400-day drill files used by Q7. Rollback applies `defaults/OBS-05.json` again as a new version; no threshold row is updated or deleted.

### OBS-05-R10 — Defaults, closed evidence, status and latency
`deploy/observation-agent/thresholds/defaults/OBS-05.json` contains every cadence/band in R01–R08. Evidence keys are numeric capacity values, threshold values, unit enums and timestamps only; SQL text, process argv, certificate subject fields and private-key metadata are excluded. `oactl status --capacity` shows current values, active band and threshold version. A threshold-crossing signal is stored ≤ 32 s after the crossing and delivered ≤ 3 s later.

## States

- Threshold band: `UNKNOWN` → `NORMAL` → `DEGRADED` → `SEVERE` → `FATAL`, with direct movement to the band the current sample satisfies and CLEARED after the requirement's recovery samples.
- Slow-query coverage: `NOT_OBSERVABLE` under D6(a); no green state is inferred from silence.
- Certificate: `VALID` → `EXPIRING_14D` → `EXPIRING_3D` → `EXPIRED` → `VALID` (CLEARED on a later certificate).

## Vocabulary (copy V will read)

Bodies: `IMPACT_PG_CAPACITY` — `Postgres is at N/100 connections: new requests fail when the limit is reached.` · `IMPACT_PG_LOCKS` — `N Postgres sessions have waited on locks for T seconds: requests are queuing behind each other.` · `IMPACT_PG_LONG_XACT` — `A transaction has been open for T seconds: vacuum and locks are held back.` · `IMPACT_DISK` — `Disk free is P%: Postgres and the spool stop accepting writes at 0.` · `IMPACT_MEMORY` — `Host memory pressure is high: processes may be killed.` · `IMPACT_LOAD` — `Host load is P across N logical cores for T seconds: processes are contending for CPU.` · `IMPACT_CERT` — `The https certificate expires in D days: the front door refuses connections after that.` · `IMPACT_THRESHOLDS` — `Thresholds changed from vN to vM.` · `IMPACT_CLEARED` — `<component>: <class> cleared after T seconds.` Status copy: `slow_queries: NOT OBSERVABLE (pg_stat_statements disabled)`.

## Reviewer-authorized disposition of frozen-source note

- **F-OBS-05-A / N1:** The frozen Q7 copy incorrectly equated 25 drill clients with the total connection numerator even though the agent and stack also connect. Round-1 rework records baseline B, opens 25 clients, requires measured total U ≥ B+25, and requires the banner/query to agree exactly on U/100. It does not weaken the detector threshold or guess a numerator.

## V-runnable acceptance (real dev stack, this Mac)

All commands run from `/Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine`. `PSQL` means `docker exec -i debateai-v3-postgres-1 psql -U debateai -d debateai -Atc`. OBS-01/02 are running; D5 is a V gate before the pg_monitor migration is applied.

1. Apply the allocated migration: `MIGRATION_DATABASE_URL=postgresql://debateai:debateai-dev-only@127.0.0.1:55432/debateai pnpm db:migrate` → exits 0; after V selects D5(a), `PSQL "select pg_has_role('debateai_observation_agent','pg_monitor','member')"` prints `t`.
2. Privacy proof: `rg -n 'pg_stat_activity[^;]*(query|query_id)|select[^;]*(query|query_id)[^;]*from[[:space:]]+pg_stat_activity' apps/observation-agent/src/modules/postgres-capacity` → prints nothing; `PSQL "select count(*) from information_schema.role_table_grants where grantee='debateai_observation_agent' and table_schema not in ('observation','obs')"` prints `0` (role membership is not a table grant).
3. `pnpm -C apps/observation-agent oactl thresholds apply deploy/observation-agent/thresholds/drill-connections-20pct.json --source-ref OBS-05-connection-drill` → prints one `THRESHOLDS vN APPLIED` line and a diff lowering the Postgres SEVERE connection band to 20%.
4. `BASELINE=$(docker exec -i debateai-v3-postgres-1 psql -U debateai -d debateai -Atc "select count(*) from pg_stat_activity where datname='debateai'"); printf '%s\n' "$BASELINE" | tee /tmp/obs-05-connection-baseline.txt; for i in $(jot 25 1); do docker exec -d debateai-v3-postgres-1 psql -U debateai -d debateai -c 'select pg_sleep(120)' >/dev/null; done` → exits 0 after recording baseline B and opening 25 additional clients.
5. Within 35 s, `BASELINE=$(cat /tmp/obs-05-connection-baseline.txt); ACTUAL=$(docker exec -i debateai-v3-postgres-1 psql -U debateai -d debateai -Atc "select evidence->>'used'||'|'||evidence->>'max' from observation.open_signal_v where component='postgres' and class='CAPACITY' order by seq desc limit 1"); USED=${ACTUAL%|*}; MAX=${ACTUAL#*|}; test "$USED" -ge "$((BASELINE + 25))"; test "$MAX" -eq 100; rg -F "Postgres is at ${USED}/${MAX} connections: new requests fail when the limit is reached." "${HOME}/.local/state/dialectical-engine/observation-agent/digest/$(date -u +%F).md"; printf '%s\n' "$ACTUAL"` → exits 0 and prints `U|100`, with U ≥ B+25; the banner uses the same exact U/100 copy.
6. After the 25 `pg_sleep` clients exit, within 35 s the Postgres CAPACITY row gains a CLEARED successor; `pnpm -C apps/observation-agent oactl thresholds apply deploy/observation-agent/thresholds/defaults/OBS-05.json --source-ref OBS-05-connection-rollback` → prints a new threshold version restoring 80%/95%.
7. Disk drill: V prepares `deploy/observation-agent/thresholds/drill-disk-current-plus-one.json` with the DEGRADED free-percent threshold set to the current `df -Pk /` free percent plus one, then runs `pnpm -C apps/observation-agent oactl thresholds apply deploy/observation-agent/thresholds/drill-disk-current-plus-one.json --source-ref OBS-05-disk-drill` → within 35 s a `host DEGRADED CAPACITY` signal body reads `Disk free is P%: Postgres and the spool stop accepting writes at 0.`, with P equal to `oactl status --capacity`.
8. `pnpm -C apps/observation-agent oactl thresholds apply deploy/observation-agent/thresholds/defaults/OBS-05.json --source-ref OBS-05-disk-rollback` → within 35 s the disk row clears; no file, image, volume, journal or database row is deleted.
9. Certificate drill: `openssl x509 -in .local/dev-auth/tls/localhost.pem -noout -enddate` → prints one `notAfter=` line; V prepares `deploy/observation-agent/thresholds/drill-certificate-400d.json` with the DEGRADED threshold at 400 days, then `pnpm -C apps/observation-agent oactl thresholds apply deploy/observation-agent/thresholds/drill-certificate-400d.json --source-ref OBS-05-cert-drill` → within 35 s a CERT_EXPIRY signal body reads `The https certificate expires in D days: the front door refuses connections after that.`
10. `pnpm -C apps/observation-agent oactl thresholds apply deploy/observation-agent/thresholds/defaults/OBS-05.json --source-ref OBS-05-cert-rollback` → the CERT_EXPIRY drill row clears on the next certificate check; `rg -n 'localhost-key\.pem' apps/observation-agent/src/modules/certificate-capacity` prints nothing.
11. `pnpm -C apps/observation-agent oactl status --capacity` → prints numeric rows for Postgres connections/max, lock waiters, longest transaction age, idle-in-transaction count, both database sizes, `/` free percent, Docker disk bytes, host memory percent, load/cores, and both containers' CPU/memory; it also prints exactly `slow_queries: NOT OBSERVABLE (pg_stat_statements disabled)`.
12. After ≥ 2 minutes running, `PSQL "select count(distinct metric_key) from observation.sample_ring where metric_key like 'capacity.%' and observed_at > now() - interval '2 minutes'"` → prints at least the number of numeric metrics displayed by step 11; no sample value is text.

## Out of scope (named successors)

Enabling `pg_stat_statements` or slow-query logging · reading/storing query text · editing Postgres/Compose configuration · restarting a container · deleting Docker data, journals or database rows · learned baselines (successor to D9) · target-server capacity (OBS-08 deferred) · alert channel fan-out (OBS-07) · any further correction beyond the reviewer-authorized F-OBS-05-A disposition.

## Parallel-safety (single-writer rule)

OWNED: `apps/observation-agent/src/modules/postgres-capacity/**`, `apps/observation-agent/src/modules/host-capacity/**`, `apps/observation-agent/src/modules/certificate-capacity/**`, `deploy/observation-agent/targets.dev.d/OBS-05.json`, `deploy/observation-agent/thresholds/defaults/OBS-05.json`, `deploy/observation-agent/thresholds/drill-*-*.json`, `migrations/<n>_observation_pg_monitor.sql`, `tests/{unit,integration,architecture}/obs-agent-05-*.test.ts`. NEVER: another slice's target fragment, Postgres/Compose/TLS generator configuration, the private key, product tables, OBS-01..04 files, or the excluded security zone.

## Absorbed predecessor slices

S21 spend/resource counters, non-chain portion, as frozen in `requirements/observationagent.md:180`.

## Dependencies and gates

OBS-01 and OBS-02 merged. V rows: D5 (`pg_monitor`) gates R02/migration; D6 keeps `pg_stat_statements` off; D9 fixes absolute thresholds; D11/DR-188 forbids deletion; D13 allocates the migration number. Reviewer-authorized round-1 rework disposed F-OBS-05-A by binding copy to the measured total rather than the client count.
