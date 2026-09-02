## FixAgent — slices (REQ-FIX, 2026-09-01; requirements: `requirements/fixagent.md`; per-slice files: `slices/FIX-nn/{SPEC,PLAN,PROGRESS,DECISIONS}.md`)
Phase 1 is approval-first everywhere (C1): trace → ticket → proposal → wait; nothing merges until V flips `quick_arm` (FIX-14). Error-shaped input only (C4); detectors and infra health are the ObservationAgent's.
- FIX-01 First row — scheduler surface · V sees: `pnpm job:liveness-sweep` against a bad database exits 1 and ONE `docker exec psql` query shows the row, with the planted password absent · G1 · dispatch now
- FIX-02 Root survives the wrapper · V sees: the same row carries ≥2 chain codes; `TypedDomainError` has `cause` · G1 · now, accept after FIX-01
- FIX-03 Runner job surface + real ids · V sees: a failed debate's runner rows join `obs.run_correlation_v`; the original error is re-thrown, never replaced · G1 · now
- FIX-04 API request surface · V sees: a 500 returns `{error, correlation_id}` and the id resolves to an `api/http` row; the zone block is not in the diff · G1 · now
- FIX-05 Provider call surface · V sees: one exhausted call → exactly one `PROVIDER_EXHAUSTED` row with run/attempt/ledger refs · G1 · now; Done waits on RP-0
- FIX-06 Browser client surface · V sees: a real client fault posts enumerations only; unknown member → 400; flood → 429 + counted gap · G1 · HELD (F-7; after FIX-04)
- FIX-07 Blind-period visibility + capture OFF · V sees: one query labels each runtime QUIET / OFF / BLIND; OFF still counts `DISABLED` gaps · G1 · after FIX-01
- FIX-08 Secrets never stored + nine chaos cases · V sees: one acceptance command, PASS per case, and V's own byte search returns 0 · G1 exit · now
- FIX-09 Listener alive · V sees: daemon + watchdog under launchd, cursor follows every fault, one incident per fingerprint, `kill -9` recovers in 10 s, zero model calls · G2 · now
- FIX-10 One switch · V sees: `obsctl kill` stops daemon + capture with Postgres down; the product runs unchanged; `obsctl arm` restores; mutation stays OFF · G2 · now
- FIX-11 Root traced, ticket filed · V sees: one ticket on board `fixagent` within 10 s naming the root, no raw text; a repeat adds a comment · G2 · now
- FIX-12 Diagnosis proposal, notify, approve/deny · V sees: a notification + ticket comment with the proposal; `obsctl approve` binds its hash; nothing lands; injection drill 0 violations · G3 · after FIX-09/10
- FIX-13 Approval-first fix, and it waits · V sees: one `fixagent/<hash>` branch, RED→GREEN pasted, `dev` untouched until V merges; kill mid-flight leaves nothing · G4 · after FIX-12
- FIX-14 QUICK arm behind V's switch · V sees: OFF — a QUICK label still waits; ON (V's re-pin only) — one QUICK fix lands UNVALIDATED, above-bound refused, exactly one revert · G5 · GATED on V
- FIX-15 Hatchet failed-run ingest · V sees: `kill -9` the runner mid-task → a `hatchet/ingest` row linked to its twin; no log text · G2 · GATED on SPIKE-D1
- FIX-16 CI inventory gate + D6 machine check · V sees: `pnpm audit:obs-inventory` passes the baseline, fails a scratch bare-catch and a scratch zone import by `path:line` · G1 tail · accept after FIX-02..05
Day-one parallel worktrees: FIX-01, 02, 03, 04, 05, 08, 09, 10, 11 (+16). V rows: V-1, V-3, V-5, V-6 (packet) · F-1…F-15 (`fixagent.md` Q7). Custodian acts: RP-0, V-6, stage-16 D6 (`fixagent.md` Q6).
Interface with the ObservationAgent: `fixagent.md` Q2 (IF-1…IF-10) — diff against `observationagent.md` Q2; a disagreement is row V-3's evidence.
