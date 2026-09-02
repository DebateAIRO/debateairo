# FIX-08 — It cannot leak and it does not drop: the adversarial corpus and the nine chaos cases through the LIVE pipeline, proven on raw bytes

**FROZEN at creation — 2026-09-01, seat REQ-FIX (Fable 5.1). No agent edits this file. Scope changes are a new SPEC version ratified by V.**
Gate: **G1 capture** (exit criterion) · Depends-on for dispatch: none (files disjoint) · Depends-on for acceptance: **FIX-01 merged**; FIX-02..05 merged for the surface-specific families.
Absorbs predecessor ticket: **S16 `t_aab2d3d2`** (acceptance + chaos harness, G1 families G1-acc-1..9 as restated in FinalPlan §G G1 ACCEPTANCE) — with G1-acc-1 (runner mis-wiring fixture) REPLACED: `apps/runner/src/main.ts:97` now wires `judgementPolicy`, so the 2026-08-21 mis-wiring is UNVERIFIED-as-fixed and the fixture becomes FIX-03's real failed run.
D-criteria evidenced: **D5** (fully — raw bytes), **D1** ("nothing silently dropped" across chaos), **D6** (schema and import checks), **D4** (loss counted in every case).
Seam obligations: none (no sink code); the harness exercises O-1..O-4's failure modes as chaos cases.

## 1. Intent
FIX-01 proves one row and one planted password. FIX-08 proves the property: an error carrying a password, a credential-bearing DSN, a card number, an email, an API key and a session id — in the message, in a three-level cause chain, in own properties and in stack-frame text — is stored with none of it present, read from RAW BYTES of every sink; and under each of nine chaos conditions the product's failure semantics are unchanged and every loss is counted.

## 2. Requirements
- **FIX-08-R01** An acceptance family under `acceptance/obs/**`, registered by one line in `acceptance/run-acceptance.ts` (TP-8), runnable by one command, prints one `PASS|FAIL` line per case with the measured counts.
- **FIX-08-R02** Adversarial corpus: the six token classes planted in message, cause (depth 3), own properties, and stack-frame text of an error THROWN inside a real instrumented process (a spawned process that imports the real installer and arms the real runtime); after capture, every `obs.*` text/jsonb column of the resulting rows AND the raw bytes of every spool file contain none of the planted tokens (byte search, not shape assertion).
- **FIX-08-R03** Identity-shaped canaries (values shaped like `asker_id`/`session_id`) never land in any correlation column (R-E4); the only lawful correlation values are declared kinds (FIX-03).
- **FIX-08-R04** Schema manifest: a test enumerates every `obs.*` column from `information_schema` and asserts no column named or typed as free text `message`, and no user-linked column exists (Batch-3 row 6, R-E4).
- **FIX-08-R05** Nine chaos cases, each with the product probe's exit code EQUAL to its no-capture control and any loss explicit as a counted `obs.capture_gap` row: DB unavailable · disk full and read-only filesystem · queue full · malformed/cyclic error object · 10× burst · redactor failure · recursive writer failure · crash during flush (in-flight batch fully present or fully absent, never partial; re-run recovers it) · recovery + idempotent re-ingest.
- **FIX-08-R06** Grant tests run against the REAL connection strings: `debateai_obs_listener` is denied on `obs.occurrence_detail`, `identity.*` (by name only — no query executed against identity; the denial is asserted from `information_schema.role_table_grants`), and `core.run`; no obs URL equals the product's; no role holds DELETE.
- **FIX-08-R07** Installer import-graph: module-eval-reachable imports of `install/*.ts` are Node built-ins only; the `@debateai/db`-throws-at-import fixture still spools the boot throw.
- **FIX-08-R08** Zone timing: response-time distributions of the zone routes with capture on vs off show no statistically resolvable delta at the sample size V ratifies (§K row 3; seed 200 requests per arm) — measured only through HTTP, never by touching zone files.
- **FIX-08-R09** Overhead calibration: measured p99 `emit()` cost and queue behaviour are printed and recorded as register-row calibration evidence (`obs.emitP99CeilingMs` seed; number V's).
- **FIX-08-R10** The harness fabricates no evidence: every row it asserts on was written by the real pipeline in a real process; a case whose subject is absent reports SKIP with the missing path, never PASS.
- **FIX-08-R11** A green suite is a milestone; Done is V's veto after §5.

## 3. States
Case: `SKIP(missing: <path>)` | `RUN → PASS(counts)` | `RUN → FAIL(step, expected, observed)`; family exit code non-zero on any FAIL.

## 4. Copy and vocabulary
"raw bytes" (a byte search over dumped columns and spool files) · "control" (the no-capture run) · "counted loss". Never "sanitized" — say "absent".

## 5. Acceptance — V runs this personally (FIX-01 merged; dev Postgres up)
1. `OBS_WRITER_DATABASE_URL=… OBS_SPOOL_DIR=$PWD/.obs-spool pnpm exec tsx acceptance/run-acceptance.ts --family obs-g1; echo "exit=$?"` → one line per case; every case `PASS` except surface families whose slice is not yet merged, which print `SKIP(missing: <path>)`; `exit=0` only when no case is `FAIL`.
2. The harness prints the planted tokens' search command; V pastes it: `docker exec debateai-v3-postgres-1 psql -U debateai -d debateai -At -c "SELECT count(*) FROM (SELECT o::text t FROM obs.occurrence o UNION ALL SELECT d::text FROM obs.occurrence_detail d UNION ALL SELECT g::text FROM obs.capture_gap g) s WHERE t LIKE '%<token1>%' OR … "` → `0`; `grep -rc '<token1>\|<token2>\|…' .obs-spool/ ; echo $?` → `1`.
3. Chaos DB-down case output shows `control_exit == capture_exit` and `spooled ≥ 1, lost = 0`; crash-during-flush shows `partial_batches = 0`.
4. `docker exec debateai-v3-postgres-1 psql -U debateai -d debateai -At -c "SELECT count(*) FROM information_schema.columns WHERE table_schema='obs' AND (column_name ILIKE '%message%' OR column_name ILIKE '%asker%' OR column_name ILIKE '%session%')"` → `0`.
5. The zone-timing case prints both distributions and the test statistic; V reads "no resolvable delta at n=<ratified>".
V vetoes Done only after steps 1–5 match.

## 6. Out of scope
Listener-side acceptance (tracer agreement, cursor drills — FIX-09/11) · injection corpus (FIX-12, RP-3) · G4/G5 drills (FIX-13/14) · editing any product file · editing the D12 demo script (owned by `t_40c2cc1b`; recommendation in `requirements/fixagent.md`).

## 7. File surface (single-writer) and parallel safety
Allowed: `acceptance/obs/**` (new) · `acceptance/run-acceptance.ts` (one registration line, TP-8) · tests `tests/integration/fix08-*.test.ts`.
Read-only: every product and capture surface under test · `acceptance/README.md`, `acceptance/relay-core.ts` (spawn precedent).
Forbidden: any product source · `tests/support/**` · listener sources · the zone (no metadata of any kind).
Parallel-safe with: every other slice (no file overlap). Acceptance order: after FIX-01; surface families after their slice.
