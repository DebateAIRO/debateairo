# FIX-15 — Hatchet failed-run ingest: a job Hatchet marks FAILED becomes a row from the second source, deduplicated against ours — behind SPIKE-D1

**FROZEN at creation — 2026-09-01, seat REQ-FIX (Fable 5.1). No agent edits this file. Scope changes are a new SPEC version ratified by V.**
Gate: **G2 listener** — **DISPATCH GATED ON SPIKE-D1 PASSING and RP-2 set** (custodian acts at G2 entry). On a SPIKE-D1 kill criterion the ruled posture executes (Batch-3 row 14, option b): the bundle slot `hatchet_ingest = DEFERRED_TO_MISSION`, a structured new-mission intake candidate is authored at `docs/missions/2026-08-21-observability-loop/research/SPIKE-D1-exit.md`, every acceptance statement quantifies first-party-only and says so, and this slice is NOT dispatched by this mission.
Absorbs predecessor ticket: **S24** (hatchet ingest — ticket id not in the D12 log; RP-2 `t_fbefa222`). V's A2 steer (2026-08-21, "an agent that listens to both") and OBS-R137–R144 bind. C4 boundary: Hatchet RUN FAILURES are error-shaped (FixAgent); Hatchet INFRASTRUCTURE health (workers registered, queue depth, dispatch latency) is the ObservationAgent's.
D-criteria evidenced: **D1** (the second source; "kill a job mid-run" is caught even when the runner never flushed — the RT-02 worker-crash-before-flush class).
Seam obligations: none. OBS-R085 (Hatchet is never on the capture path), OBS-R141 (read-only), OBS-R142 (same redaction), RT-13 (idempotent), RT-15 (skew), E6-16 (evidenced merge) bind.

## 1. Intent
When a runner process is killed mid-task, our capture may never flush; Hatchet still records the run FAILED. FIX-15 reads that surface back — structured fields only, never log text — and folds a Hatchet-sourced occurrence into the same incident as its first-party twin when the join keys prove it is the same failure.

## 2. Requirements
- **FIX-15-R01** SPIKE-D1 (half a day, read-only, at G2 entry, custodian/orchestrator act) answers: retention window · `runs.list` pagination bounds · read-scope token obtainability (compose provisions only a worker token) · backlog/heartbeat semantics · attempt-identity stability; kill criteria: retention < poll floor, unboundable pagination, no read token.
- **FIX-15-R02** Ingest polls `runs.list` (FAILED/CANCELLED, cursor window minus overlap) on `obs.hatchet.pollIntervalMs` as consumer `hatchet-ingest`; per failed task, only structured fields cross (status, kind, attempt, counts, `additionalMetadata.v3RunId/v3WorkItemId`); Hatchet log text is never stored anywhere in `obs.*`.
- **FIX-15-R03** Rows land as `source = 'hatchet'`, `runtime = 'ingest'`, `source_event_ref = 'hatchet:<runId>:<attempt>'`, idempotent under UNIQUE `(source, source_event_ref)`; a Hatchet retention window shorter than ours is recorded as a bounded `obs.capture_gap` on source `hatchet`.
- **FIX-15-R04** Cross-source merge: when `v3RunId/v3WorkItemId` match a first-party occurrence's `run_ref/work_item_ref` within `obs.skewToleranceMs` and the classes are compatible, an `obs.source_link` row joins them and the incident's `source_set` gains `hatchet`; an unmatched pair stays two incidents; ours is authoritative for taxonomy/severity/fingerprint.
- **FIX-15-R05** Both clocks are stamped; skew is measured continuously; `skewToleranceMs` may be ratified only from a split-clock measurement; drift beyond tolerance is trip-eligible.
- **FIX-15-R06** Hatchet is never a dependency of the capture path; a Hatchet outage degrades this source and is itself an occurrence (`capture_point = 'self'`), never a capture failure.
- **FIX-15-R07** A green suite is a milestone; Done is V's veto after §5.

## 3. States
Slot: `UNSET → SET(spike passed) | DEFERRED_TO_MISSION(spike killed)`. Ingest: `POLLING → FOLDED | GAP(retention) | DEGRADED(hatchet down)`.

## 4. Copy and vocabulary
"second source" · "structured fields only" · "evidenced merge" · "explicit deferral". Never "log line" for anything stored.

## 5. Acceptance — V runs this personally (SPIKE-D1 passed; FIX-09 merged; dev stack up)
1. Start a debate; while its runner task executes, `kill -9 <runner pid>` (the process, not the container).
2. Hatchet dashboard `http://localhost:8888` shows the run FAILED.
3. Within `pollIntervalMs` + 5 s: `docker exec debateai-v3-postgres-1 psql -U debateai -d debateai -At -c "SELECT source, runtime, code, run_ref, work_item_ref FROM obs.occurrence WHERE source='hatchet' ORDER BY occ_seq DESC LIMIT 1"` → `hatchet|ingest|<code>|<uuid>|<uuid>`.
4. `SELECT count(*) FROM obs.source_link` → increases by 1 only if a first-party twin exists (a spool-drained row from the killed runner); `SELECT source_set FROM obs.incident WHERE fingerprint = …` → includes `hatchet`.
5. `SELECT count(*) FROM (SELECT o::text t FROM obs.occurrence o) s WHERE t ILIKE '%traceback%' OR t ILIKE '%stack%' AND source='hatchet'` → `0` (no log text).
6. `docker stop debateai-v3-hatchet-lite-1`; run FIX-01's failing job → its row lands normally (capture path unaffected); `SELECT code FROM obs.occurrence WHERE runtime='ingest' AND capture_point='self' ORDER BY occ_seq DESC LIMIT 1` → a Hatchet-unreachable code; `docker start debateai-v3-hatchet-lite-1`.
V vetoes Done only after steps 1–6 match. If SPIKE-D1 killed: this section is replaced by the exit report's deferral statement.

## 6. Out of scope
Hatchet infrastructure health and worker registration (ObservationAgent) · using Hatchet as an error bus · any Hatchet write · the new mission (if killed).

## 7. File surface (single-writer) and parallel safety
Allowed: `tools/obs-listener/src/ingest-hatchet/**` (new) · tests `tests/integration/fix15-*.test.ts`.
Read-only: Hatchet REST 8888 / gRPC 7077 with a read-scope token (from SPIKE-D1) · `apps/runner/src/main.ts` (join keys).
Forbidden: storing any Hatchet log text · Hatchet on the capture path · product source · the daemon's regions (the fold hook is FIX-09's interface).
Parallel-safe with: every other slice (own subtree).
