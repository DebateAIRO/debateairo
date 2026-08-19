# R2 — Persistence & Personal-Data Inventory (research asset, Wave 1)

FastAPI coordinator (SQLAlchemy + Alembic, SQLite default). READ-ONLY. Produced by the R2 research agent, 2026-08-17.

## 1. Database config & stores

- `coordinator/app/core/config.py:15-16` — default `~/.dialectical/db.sqlite3`. `:155-157` — `DIALECTICAL_DATABASE_URL` overrides; else `DIALECTICAL_HOME` relocates. `~/.dialectical/` absent on this machine (live DB elsewhere or not yet created).
- `coordinator/app/core/db.py:51-64` — lazy `create_engine`, `check_same_thread=False`. `:98-113` PRAGMAs `journal_mode=WAL` (→ `-wal`/`-shm` side files hold data), `foreign_keys=ON`, `busy_timeout=30000`. Startup uses `init_db()` = `create_all` + `backfill_existing_schema()` raw ALTERs (`:116-360`); **Alembic NOT run at startup**.
- **Encryption at rest: NONE** — `grep -rni encrypt coordinator/` = 0. Plain SQLite, no SQLCipher. Instance lockfile plaintext.
- Other stores: launchd routes stdout/stderr to `/tmp/dialectical-*.{out,err}.log` (`deploy/launchd/coordinator.plist:115-118`); **`main.py:43` prints user token plaintext to stdout → world-readable /tmp log**. In-memory only: SSE history (`events.py:24`), rate-limit IP buckets (`main.py:105`), QBAF runs. Config `~/.dialectical/coordinator.toml`, optional `.env`. Manual pre-migration `.bak` copies in `~/.dialectical/`.

## 2. Table inventory (17 tables, `entities.py`; migrations 0001-0017)

| Table (line) | Personal-data / content columns | Notes |
|---|---|---|
| `settings` (25) | `key`,`value` JSON — holds **`user_token_hash`**, `runtime_settings` | Credential store |
| `debates` (33) | **`topic`** (user-typed ≤2000ch), `config` JSON, timestamps | `status="archived"` = only "deletion" |
| `nodes` (49) | **`claim`**, `stopping_reason`, `metadata` JSON (evidence) | Full tree content |
| `generations` (81) | **`argument`**, **`prompt_rendered`** (actually stores OUTPUT, see R4), `model_id`, tokens, `worker_id`, ts | |
| `syntheses` (110) | **`strongest_pro/con`**, **`verdict`**, `analyzer_findings`, `provenance` JSON | |
| `workers` (126) | **`name`** (host/device-identifying), `token_hash`, `capabilities`, **`last_seen`**, `current_job_id` | Names+last_seen exposed publicly |
| `jobs` (139) | **`stream_buffer`** (full LLM text), `payload` JSON, `error`, worker ids, ts | Duplicates generation content |
| `job_transitions` (174) | `reason`, ids, ts | Append-only; **no FKs** → survives cascades |
| `debate_branches` (206) | structural | |
| `skills` (217)/`agents` (230) | `definition` JSON | Registry |
| `analyzer_runs` (243) | **`output`** JSON, `provenance` | |
| `capability_matches` (461) | selection metadata | |
| `agent_outputs` (474) | **`prompt_input`** JSON, **`output`** JSON, pros/cons/summary | Both served on public API |
| `provenance_records` (507) | `model_id`,`worker_id`,`prompt_id`, metadata | |
| `judge_output_artifacts` (523) | **`raw_output`** (verbatim judge output), assessment/metadata JSON | NOT on public API |
| `node_scoring_results` (599) | `result` JSON (scores+rationale), provider/model | Served via `/scoring` |
| `evidence_lifecycle_snapshots` (340) | **`payload`** JSON, `reference` (evidence URL/citation) | Immutable |
| `lifecycle_decision_records` (395) | `stopping_reason`, hashes, ts | "Immutable redacted audit" |
| `node_feedback_votes` (632) | **`user_identity_hash`** = SHA-256("debateai-scoring-feedback:"+raw token) | Only per-user id column; recomputable by any token holder |

## 3. User-identifying data TODAY
- **IPs**: only in in-memory rate-limit dict (`main.py:105`); but **uvicorn access logs → /tmp** carry client IP+path.
- **Tokens**: user hashed in `settings`; workers hashed in `workers`. Plaintext user token leaks once via stdout→/tmp; may live in `DIALECTICAL_USER_TOKEN` env; `OPENAI_API_KEY` via env/.env.
- **Pseudonymous id**: `node_feedback_votes.user_identity_hash` ties votes+timestamps to a token holder.
- **Emails**: none anywhere. No accounts/names/profiles.
- Every content row has `created_at`; single-user deployment makes all content trivially attributable to the operator; worker `name`+`last_seen` identify machines.

## 4. Retention / deletion
- **`DELETE /api/debates/{id}` = soft archive** (`debates.py:114-124` → `archive_debate`, `orchestrator.py:1062-1076`): sets `status="archived"`, fails pending jobs. **No row removed.**
- **No hard delete anywhere**: grep `db.delete/session.delete/DELETE FROM` over `coordinator/app` → only archive. No purge/TTL/retention.
- Cascades declared (`Debate.nodes/jobs` `cascade="all, delete-orphan"`; `Node.generations`) but **unreachable** (nothing deletes a Debate); even if invoked, syntheses/analyzer_runs/judge artifacts/scoring/votes/snapshots/lifecycle/provenance/job_transitions would **not** cascade.
- Governed by **DR-188 data-preservation law**: debate data "survives every update, on every environment, forever." **No lawful erasure path** (GDPR Art. 17 tension).

## 5. Backups
- **No automated backup.** Only documented: manual pre-migration `sqlite3 .backup '...pre-flip.*.bak'` (`docs/flip-plan-2026-07.md:95-97`) → **unencrypted full-DB copies accumulating in `~/.dialectical/` with no retention**.

## 6. Data flows OUT
Public GET (unauth, IP-rate-limited): `/api/debates`, `/{id}`, `/{id}/events`, `/{id}/export.md`, `/{id}/scoring`, `/api/backends/status`.
- **Detail** (`serialization.py:753-946`) leaks heavily: full config, whole node tree, **worker ids AND names**, **all agent_runs incl. `prompt_input` + raw `output`**, analyzer outputs, provenance, lifecycle decisions, internal job ids. Effectively the whole operational+content record minus `prompt_rendered` and judge `raw_output`.
- **`/api/backends/status`** (public): worker ids, names, capabilities, last_seen, status, current_job_id — fleet/host metadata to the internet.
- Unauth AND un-rate-limited: `GET /{id}/scoring/jobs/{job_id}` (incl. raw error), `/scoring/adaptive-depth/dry-run`, `/api/qbaf/runs/{run_id}`.

## 7. Migration posture
- Manual `alembic upgrade head`; startup instead uses `create_all` + raw ALTER backfills → schema can drift from Alembic on fresh installs. History 0001-0017 all additive (drops only in `downgrade()`). One data-rewriting (non-destructive) path: `_rebuild_sqlite_capability_table` (`db.py:165-219`).

## RISK SUMMARY
1. **Plaintext user token → world-readable /tmp log** (main.py:43 + coordinator.plist:115) — highest-severity secret-at-rest.
2. **Unencrypted SQLite** (+WAL/SHM + accumulating unencrypted `.bak`) holding all topics/prompts/outputs/hashed creds.
3. **Public detail endpoint leaks internal metadata wholesale** (config, agent prompt_input/output, worker names, job ids) — unauth.
4. **Public `/api/backends/status` exposes worker fleet** (names≈hosts, last_seen, current jobs).
5. **No deletion path** (archive-only per DR-188); latent cascades wouldn't cover half the content tables.
6. **`user_identity_hash`** = stable token-derived pseudonymous id, recomputable by any token holder.
7. Client **IPs in /tmp uvicorn logs**; three GETs bypass both auth and rate limiter.
