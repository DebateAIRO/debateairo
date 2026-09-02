# FIX-10 — One action turns it all off: `obsctl kill` stops capture, the daemon and any executor, and the product does not notice

**FROZEN at creation — 2026-09-01, seat REQ-FIX (Fable 5.1). No agent edits this file. Scope changes are a new SPEC version ratified by V.**
Gate: **G2 listener** · Depends-on for dispatch: none (own subtree) · Depends-on for acceptance: **FIX-07 and FIX-09 merged** (a capture switch to flip and a daemon to stop).
Absorbs predecessor ticket: **S22 `t_37f2f56f`** (`obsctl status/kill/arm`). Custody: **single custodian = V** (E6-02 amended 2026-08-22); the `approve/deny/reveal-drift` regions are FIX-12's.
D-criteria evidenced: **D7** (fully, with FIX-07's capture half).
Seam obligations: none of O-1..O-4; OBS-R106 binds (works WITHOUT database access; mutation defaults OFF after supervisor restart).

## 1. Intent
V must be able to stop everything this mission builds with one command, from a terminal, even when Postgres is down, and see that the product keeps running. `obsctl` is a human CLI with no model in it.

## 2. Requirements
- **FIX-10-R01** `obsctl kill` writes the `KILL` marker (filesystem, no database) and flips FIX-07's capture OFF switch; within `obs.killLatencyMs` (seed 5000 ms; V's) the daemon stops processing, any running worker's lease is revoked and its process group killed, and every armed runtime records `state = 'OFF'`.
- **FIX-10-R02** `obsctl arm` requires the custodian's token (V alone) and a positive `ARMED` token; it clears `KILL`, re-enables capture, and re-enables daemon intake; MUTATION stays OFF after any arm and after any supervisor restart until separately armed (`obsctl arm --mutation`, FIX-13) — and `quick_arm` is never touched by `obsctl arm` (FIX-14's re-pin only).
- **FIX-10-R03** `obsctl status` prints, without a model call: per runtime capture state and last heartbeat age (from `obs.component_health`), daemon and watchdog liveness, cursor lag (`max(occ_seq) − last_occ_seq`), open capture gaps, spool depth (files and lines under `OBS_SPOOL_DIR`), mutation state, `quick_arm` state, bundle hash and custodian; when the database is unreachable it prints the filesystem-derived rows and marks the rest `UNAVAILABLE` rather than failing.
- **FIX-10-R04** `kill` and `arm` complete with the database down (no connection attempted on that path).
- **FIX-10-R05** The product is unaffected by kill or arm: a scheduler job run before, during, and after `kill` has identical exit codes and stderr bytes; the API answers the same status codes.
- **FIX-10-R06** Every `obsctl` invocation appends an `obs.agent_action` row (`actor = 'obsctl:<os user>'`, `action_kind ∈ {KILL, ARM, STATUS}`) when the database is reachable, and a line to the append-only witness log always.
- **FIX-10-R07** `obsctl` has no LLM adapter and no product import (resolve-hook trace: no CLI spawn module, no `@debateai/db`).
- **FIX-10-R08** A green suite is a milestone; Done is V's veto after §5.

## 3. States
System authority: `ARMED(capture on, daemon on, mutation off)` → `KILLED(all off)` → `ARMED(mutation off)`; `mutation` is a separate flag: `OFF` (default, after every restart) → `ON` (FIX-13, custodian act).

## 4. Copy and vocabulary
"kill" (everything off, one command) · "arm" (capture + daemon back on; mutation stays off) · "custodian" (V, singular). Never "pause".

## 5. Acceptance — V runs this personally (FIX-07 and FIX-09 merged)
1. `obsctl status` → a table with rows for `capture:scheduler`, `fixagent-daemon`, `fixagent-watchdog`, `mutation: OFF`, `quick_arm: OFF`, bundle hash, custodian `V`.
2. `obsctl kill` → prints `KILLED` within 5 s; `obsctl status` shows daemon `STOPPED`, capture `OFF` for every runtime; `launchctl list | grep obs-daemon` still shows the service (supervised but idle).
3. Run FIX-01 step 4's failing job → `exit=1`, same stderr as before; `SELECT count(*) FROM obs.occurrence` unchanged; `SELECT gap_class FROM obs.capture_gap ORDER BY opened_at DESC LIMIT 1` → `DISABLED`.
4. `docker stop debateai-v3-postgres-1`; `obsctl status` → filesystem rows present, database rows `UNAVAILABLE`, exit 0; `obsctl arm` → prompts for the custodian token, then `ARMED`; `docker start debateai-v3-postgres-1`.
5. Run the failing job again → the occurrence count increases by 1 within 5 s; `SELECT action_kind FROM obs.agent_action ORDER BY occurred_at DESC LIMIT 3` includes `KILL` and `ARM`.
6. `obsctl status` → `mutation: OFF` (it never came on).
V vetoes Done only after steps 1–6 match.

## 6. Out of scope
`approve/deny/reveal-drift` (FIX-12) · `--mutation` arming and the fix executor (FIX-13) · `quick_arm` re-pin (FIX-14) · the ObservationAgent's own switch (its SPEC; C3 — the two switches are independent).

## 7. File surface (single-writer) and parallel safety
Allowed: `tools/obs-listener/src/obsctl/**` regions `status`, `kill`, `arm` · tests `tests/integration/fix10-*.test.ts`.
Read-only: `KILL`/`ARMED`/proof paths (writes them as the custodian act) · daemon status surfaces · FIX-07's switch path.
Forbidden: `approve`/`deny`/`reveal-drift`/board-write regions (FIX-12) · any model call · any product source · daemon/watchdog subtrees (FIX-09).
Parallel-safe with: every other slice (own subtree). FIX-12 must wait for FIX-10 to merge (adds regions to `src/obsctl/**`).
