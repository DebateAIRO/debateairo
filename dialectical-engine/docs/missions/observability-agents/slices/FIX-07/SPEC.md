# FIX-07 — It says when it is blind: a quiet hour and an off hour are different queries, and capture has an OFF switch that still counts

**FROZEN at creation — 2026-09-01, seat REQ-FIX (Fable 5.1). No agent edits this file. Scope changes are a new SPEC version ratified by V.**
Gate: **G1 capture** · Depends-on for dispatch: **FIX-01 merged** (same `src/runtime/**` surface — single writer) · Depends-on for acceptance: FIX-01.
Absorbs: the D4 obligations no predecessor slice owned end-to-end (S03b gap counter exists; S05b flushes gap rows; nothing writes a heartbeat) · OBS-R060 (runtime disable via an auditable switch, no redeploy) — the capture half of D7, operated by FIX-10's `obsctl`.
D-criteria evidenced: **D4** (fully), **D7** (capture half).
Seam obligations: **O-1..O-4** bind (this slice edits the runtime that owns the Tier-1 sink).

## 1. Intent
Today an empty `obs.occurrence` is indistinguishable from a healthy hour. FIX-07 gives every armed runtime a heartbeat row, gives capture an OFF state that is itself recorded and counted, and gives V one query that answers "was capture alive?" independently of whether anything failed.

## 2. Requirements
- **FIX-07-R01** Every armed runtime upserts one `obs.component_health` row per flush cycle: `component = 'capture:<runtime>'`, `state ∈ {ARMED, SPOOL_ONLY, DRAINING, OFF, STOPPED}`, `observed_at` = the flush time, `detail_code` = the last `CaptureHealthCode` observed; the row is written as `debateai_obs_writer` (the ARCH seat confirms the UPDATE grant on this projection table or specifies an append-only alternative — the property, not the mechanism, is frozen).
- **FIX-07-R02** Every loss class is a counted row: `QUEUE_FULL`, `SPOOL_FAILURE`, `POSTGRES_FAILURE`, `REDACTOR_FAILURE`, `GAP_WRITE_FAILURE` (via the authority-proof mechanism when the gap write itself fails) and `DISABLED` each produce `obs.capture_gap` rows with `lost_count` — never a silent drop.
- **FIX-07-R03** A capture OFF switch exists (file or register row; ARCH decides; path stated in DECISIONS.md) that every runtime honours within one flush interval: while OFF, no occurrence is written, heartbeats continue with `state = 'OFF'`, and every suppressed emit is counted as `gap_class = 'DISABLED'`.
- **FIX-07-R04** One query V can paste distinguishes "quiet" (heartbeats present, zero occurrences) from "off" (no heartbeat newer than one flush interval, or `state = 'OFF'`) per runtime.
- **FIX-07-R05** The heartbeat's cost is bounded: one small upsert per flush cycle per process; no heartbeat when the runtime is not armed (a one-shot CLI that exits before arming writes none — the spool witness covers it).
- **FIX-07-R06** The OFF switch changes nothing about the product: the failing job's exit code and stderr bytes are identical with capture ON, OFF, and uninstalled.
- **FIX-07-R07** A green suite is a milestone; Done is V's veto after §5.

## 3. States
Capture (per runtime): `ARMED` ⇄ `SPOOL_ONLY` (Postgres unreachable) · `ARMED → OFF` (switch) · `OFF → ARMED` (switch cleared) · `→ STOPPED` (process exit). Period classification (V's query): `QUIET` | `OFF` | `BLIND(gap rows)`.

## 4. Copy and vocabulary
"heartbeat" (a `component_health` upsert) · "quiet" vs "off" vs "blind" · "OFF switch" (capture only; the daemon and executor have their own — FIX-10). Never "healthy" for a period with no heartbeat.

## 5. Acceptance — V runs this personally (FIX-01 merged)
1. Run FIX-01 step 4's failing job once → `docker exec debateai-v3-postgres-1 psql -U debateai -d debateai -At -c "SELECT component, state, observed_at, detail_code FROM obs.component_health WHERE component LIKE 'capture:%' ORDER BY component"` → a `capture:scheduler` row, `state` in `{ARMED, STOPPED}`, `observed_at` within the last minute.
2. Quiet: wait 2 minutes with the dev api/runner up (`pnpm dev:auth:up`) and cause no faults → `SELECT count(*) FROM obs.occurrence WHERE captured_at > now() - interval '2 minutes'` → `0`, AND `SELECT component, observed_at FROM obs.component_health WHERE component IN ('capture:api','capture:runner') AND observed_at > now() - interval '30 seconds'` → both rows present (quiet, not off).
3. Off: stop the dev stack → after 30 s the same query returns no rows (off, and V can tell).
4. Switch: set the OFF switch (the exact command is in this slice's DECISIONS.md, e.g. `obsctl capture off` after FIX-10, or touching the switch file before it), run FIX-01 step 4's failing job → `exit=1` unchanged; `SELECT count(*) FROM obs.occurrence` unchanged; `SELECT gap_class, lost_count FROM obs.capture_gap ORDER BY opened_at DESC LIMIT 1` → `DISABLED|1`; `SELECT state FROM obs.component_health WHERE component='capture:scheduler'` → `OFF`.
5. Clear the switch; run the job again → the occurrence count increases by 1; state returns to `ARMED`/`STOPPED`.
6. The one query: `SELECT r.runtime, CASE WHEN h.state='OFF' THEN 'OFF' WHEN h.observed_at < now() - interval '1 minute' THEN 'OFF' WHEN g.n > 0 THEN 'BLIND' ELSE 'QUIET' END AS period FROM (VALUES ('api'),('runner'),('scheduler')) r(runtime) LEFT JOIN obs.component_health h ON h.component = 'capture:'||r.runtime LEFT JOIN LATERAL (SELECT count(*) n FROM obs.capture_gap g WHERE g.source = r.runtime AND g.closed_at IS NULL) g ON true` → one row per runtime with a period label matching what V just did (the ARCH seat may refine the exact SQL; the shape — one row per runtime, a label from {OFF, BLIND, QUIET} — is frozen).
V vetoes Done only after steps 1–6 match.

## 6. Out of scope
Detectors of product stalls (ObservationAgent) · alerting V about blind periods (ObservationAgent reads these same rows — interface table in `requirements/fixagent.md` Q2) · the daemon/executor kill (FIX-10) · retention of `component_health` history (DR-188, V-gated).

## 7. File surface (single-writer) and parallel safety
Allowed: `packages/obs-capture/src/runtime/**` (after FIX-01) · `packages/obs-capture/src/health.ts` (adding the `DISABLED` class only, if the constant set is closed there) · tests `tests/integration/fix07-*.test.ts`.
Read-only: `packages/obs-capture/src/{emit,flusher,queue,spool}.ts` · `packages/obs-capture/install/*.ts` (frozen).
Forbidden: `install/*.ts` · `src/zone/**` · `src/registry/**` · `migrations/**` · `@debateai/db`.
Parallel-safe with: FIX-02, FIX-03 (disjoint files), FIX-04, FIX-05, FIX-06, FIX-08+, FIX-16. Must NOT run concurrently with **FIX-01** (dispatch after FIX-01 merges).
