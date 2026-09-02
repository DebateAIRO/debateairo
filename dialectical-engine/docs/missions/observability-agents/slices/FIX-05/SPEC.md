# FIX-05 — Provider call surface: one exhausted provider call becomes exactly one row, carrying the run and the attempt

**FROZEN at creation — 2026-09-01, seat REQ-FIX (Fable 5.1). No agent edits this file. Scope changes are a new SPEC version ratified by V.**
Gate: **G1 capture** · Depends-on for dispatch: none · Depends-on for acceptance: **FIX-01 and FIX-03 merged** (runtime; ambient `run` seeded by the runner's gateway seam); dev stack up.
Absorbs predecessor ticket: **S11 `t_7efcd635`** (provider binding — whole-file contract per H5-02) plus the S03c Tier-B `attempt` seam (L2-ADDENDUM-2 §2.1 row 4: hoist `lastAttemptId` so it survives the loop) and the Tier-A `ledger_entry` seam (row 5). Custodian dependency: **RP-0 `t_4deda7ab`** — `PROVIDER_CALL_FAILED` / `PROVIDER_CONTENT_UNACCEPTED` are `declared_gap` members; until V ratifies the hash and the S02 addendum transcribes it, these rows land minimized as `OBS_CAPTURE_SELF` with `fallback_minimized = true`.
D-criteria evidenced: **D1** (provider surface), **D2** (identity: `run_ref`, `attempt_ref`, `ledger_ref` real).
Seam obligations: none of O-1..O-4. OBS-R018/R024 bind (one event per exhausted call; per-attempt artifacts referenced, never duplicated).

## 1. Intent
`packages/providers/src/index.ts` retries a provider call and throws `ProviderContentUnacceptedError` (`:485` at `8d38185c`) or `ProviderCallFailedError` (`:493`) after the loop — the only exactly-once-per-exhausted-call point in the file. FIX-05 emits there, once, with the attempt and ledger identities already in lexical scope, and never lets a raw request or response cross into the store.

## 2. Requirements
- **FIX-05-R01** Exactly one occurrence per exhausted call, emitted at the post-loop exhaustion throws; a call that succeeds on retry emits nothing at `capture_point = 'provider'`.
- **FIX-05-R02** The occurrence declares kind `ledger_entry` from `lastLedgerEntryRef` (or the content-rejection's ledger ref) and kind `attempt` from a hoisted `lastAttemptId`; it inherits `run` and `work_item` from ambient context and never re-derives them.
- **FIX-05-R03** `taxonomy_class = 'PROVIDER_EXHAUSTED'`; `code` is `PROVIDER_CALL_FAILED` or `PROVIDER_CONTENT_UNACCEPTED` once RP-0 is ratified and transcribed; before that the row is `OBS_CAPTURE_SELF` with `fallback_minimized = true` — the slice handoff records which state was observed, and Done requires the registered code.
- **FIX-05-R04** No raw request, response, prompt, provider payload, or parse text reaches any `obs.*` column or the spool: a distinctive question line planted in the debate is absent from every text/jsonb column and spool byte.
- **FIX-05-R05** Per-attempt outcomes are referenced (attempt count in `template_parameters`, the ledger ref as `ledger_ref`), never copied.
- **FIX-05-R06** The gateway's return values, thrown error classes, retry count and timing are unchanged with capture off; the resolve-hook trace of `@debateai/providers` shows ZERO `pg`, ZERO `@debateai/db`.
- **FIX-05-R07** A green suite is a milestone; Done is V's veto after §5.

## 3. States
Call: `ATTEMPT(i)` → `SUCCEEDED` | `RETRY` → … → `EXHAUSTED(reason ∈ {call_failed, content_unaccepted})` → one occurrence.

## 4. Copy and vocabulary
"exhausted call" (all attempts spent) · "attempt" (one provider request) · "ledger ref". Never "response body" in any stored field.

## 5. Acceptance — V runs this personally (dev stack up; FIX-01 and FIX-03 merged)
1. Point the dev provider at a closed port (V edits the dev register value the runner reads, restarts the stack) and start a debate whose question line contains the token `CANARY-QUESTION-4419`.
2. The debate fails in the UI after the configured retries.
3. `docker exec debateai-v3-postgres-1 psql -U debateai -d debateai -At -c "SELECT capture_point, taxonomy_class, code, fallback_minimized, run_ref, attempt_ref, ledger_ref FROM obs.occurrence WHERE capture_point='provider' ORDER BY occ_seq DESC LIMIT 1"` → `provider|PROVIDER_EXHAUSTED|PROVIDER_CALL_FAILED|f|<uuid>|<uuid>|<uuid>` (or `OBS_CAPTURE_SELF|t` if RP-0 is still unratified — record it; Done waits).
4. `docker exec debateai-v3-postgres-1 psql -U debateai -d debateai -At -c "SELECT count(*) FROM obs.occurrence WHERE capture_point='provider' AND run_ref = '<run_ref from step 3>'"` → `1` (one exhausted call, one row, however many attempts).
5. `docker exec debateai-v3-postgres-1 psql -U debateai -d debateai -At -c "SELECT count(*) FROM (SELECT o::text t FROM obs.occurrence o UNION ALL SELECT d::text FROM obs.occurrence_detail d) s WHERE t LIKE '%CANARY-QUESTION-4419%'"` → `0`; `grep -rc 'CANARY-QUESTION-4419' .obs-spool/ ; echo $?` → `1` (no match).
V vetoes Done only after steps 1–5 match with the registered code in step 3.

## 6. Out of scope
The runner's gateway seam (FIX-03) · provider discovery/probe endpoints in `apps/api/src/provider-discovery.ts` · budget/spend accounting for the product's own provider calls · the diagnosis worker's own model calls (FIX-12).

## 7. File surface (single-writer) and parallel safety
Allowed: `packages/providers/src/index.ts` (whole file; working region `call()` incl. the post-loop throws) · tests `tests/unit/fix05-*.test.ts`.
Read-only: `packages/obs-capture/src/{index,context,kinds}.ts` · `apps/runner/src/index.ts` (FIX-03).
Forbidden: `apps/runner/**`, `apps/scheduler/**`, `packages/obs-capture/**` (no writes), the zone.
Parallel-safe with: every other slice (no file overlap). Acceptance order: after FIX-01 and FIX-03.
