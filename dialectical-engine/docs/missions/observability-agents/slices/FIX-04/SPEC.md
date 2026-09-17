# FIX-04 — API request surface: a failing request is recorded before the reply, and the caller gets a correlation id instead of internals

**FROZEN at creation — 2026-09-01, seat REQ-FIX (Fable 5.1). No agent edits this file. Scope changes are a new SPEC version ratified by V.**
Gate: **G1 capture** · Depends-on for dispatch: none · Depends-on for acceptance: **FIX-01 merged**; dev stack up (`pnpm dev:auth:up`, https on :3000).
Absorbs predecessor tickets: **S08 `t_c1651ebb`** (api binding) including the `obs-context-hook` contract extension of L2-ADDENDUM-2 §4A (the request-scoped context entered at `onRequest`, declaring kind `run` on exactly the three run-scoped route templates). Zone law: ZI-1..ZI-4 and `tests/support/zone-boundary.ts` (`resolveZoneRouteMountRegion()`), V-ruled 2026-08-26.
D-criteria evidenced: **D1** (API surface), **D2** (identity half on run-scoped routes), **D6** (the zone-route-mount region is byte-untouched; no zone import).
Seam obligations: none of O-1..O-4. Batch-8 (no filesystem metadata on zone files) binds every test.

## 1. Intent
`apps/api/src/index.ts` `setErrorHandler` (`:439-491` at `8d38185c`, non-normative) already returns `errorCode` as the body for 500-class responses (partial OBS-R053) but records nothing, returns no correlation id, and its stream-abort branch (reply already sent) records nothing at all. FIX-04 records every branch before replying, adds a correlation id the caller can quote and V can look up, and seeds the request context so run-scoped requests carry a real `run_ref`.

## 2. Requirements
- **FIX-04-R01** `apps/api/src/main.ts` imports `@debateai/obs-capture/install/api` as its first statement.
- **FIX-04-R02** Every branch of the API error boundary emits an occurrence BEFORE any byte is written to the reply, including the branch where headers were already sent (stream abort) — that branch emits and then destroys the connection exactly as today.
- **FIX-04-R03** Every 500-class response body is `{ error: <code>, correlation_id: <id> }` where `<id>` equals the occurrence's `source_event_ref`; `message` is absent for ≥ 500; the 4xx bodies are unchanged.
- **FIX-04-R04** A request-scoped ambient context is entered at `onRequest` for every request; it declares kind `run` ONLY on the three run-scoped route templates named in L2-ADDENDUM-2 §4A.3, and declares nothing on every other route (including all zone routes); a client-asserted run id is recorded as `run` only when the route template makes it server-verifiable, otherwise it is not declared (§4A.5 finding).
- **FIX-04-R05** The zone-route-mount region — the single top-level `if (options.registration !== undefined) { … }` block with exactly the three auth mounts in order — is byte-identical before and after this slice, resolved by `resolveZoneRouteMountRegion()` on both sides (ZI-2), and the slice's diff to `apps/api/src/index.ts` is confined to the error-boundary region and the `obs-context-hook` region (ZI-3).
- **FIX-04-R06** No test in this slice reads, stats, lists, imports or hashes any zone file (ZI-4, Batch-8); mount reality is proven only from the text of `apps/api/src/index.ts`.
- **FIX-04-R07** A failing request yields exactly one `obs.occurrence` row with `runtime = 'api'`, `capture_point = 'http'`, `component.route_template` set (never the concrete URL), and `capture_status = 'PERSISTED'`, within `obs.flushDeadlineMs`.
- **FIX-04-R08** `resolveSession` and every auth flow are untouched; `AuthFlowError` responses keep their status codes and bodies byte-for-byte.
- **FIX-04-R09** Response latency on the zone routes is not measurably changed by the hook (equal-work: one fixed-cost context entry, no classification on the request path — RT-08/IC-2; the statistical test is FIX-08's).
- **FIX-04-R10** A green suite is a milestone; Done is V's veto after §5.

## 3. States
Request: `RECEIVED(context entered)` → `REPLIED` | `FAILED(before headers → emit → reply with correlation id)` | `FAILED(after headers → emit → destroy)`.

## 4. Copy and vocabulary
"correlation id" (the caller-visible id = `source_event_ref`) · "route template" (`/v1/runs/:id/events`, never a concrete path) · "context hook". Never echo an error message to a client on ≥ 500.

## 5. Acceptance — V runs this personally (dev stack up; FIX-01 merged)
1. `pnpm dev:auth:up` → https API answering on :3000 (`curl -sk https://localhost:3000/v1/session -o /dev/null -w '%{http_code}\n'` → `401`).
2. Cause a real 500 in unmodified product code: stop the product database the API uses (`docker stop debateai-v3-postgres-1`) and request an authenticated, DB-backed route V is signed in to (or `curl -sk https://localhost:3000/v1/asks -X POST -H 'content-type: application/json' -d '{}' -w '\n%{http_code}\n'`) → status `500` or `503`, body `{"error":"<CODE>","correlation_id":"<id>"}`, no `message` key.
3. `docker start debateai-v3-postgres-1`; wait for healthy; run any instrumented process to drain (FIX-01 step 4's command) → `docker exec debateai-v3-postgres-1 psql -U debateai -d debateai -At -c "SELECT runtime, capture_point, code, capture_status, component->>'route_template' FROM obs.occurrence WHERE source_event_ref = '<id from step 2>'"` → `api|http|<CODE>|SPOOLED|/v1/asks` (spooled, because Postgres was down at capture time — that is the point).
4. Stream abort: `curl -sk -N https://localhost:3000/v1/runs/<any run id>/events & sleep 1; kill %1` → the API process stays up; `SELECT count(*) FROM obs.occurrence WHERE runtime='api' AND capture_point='http' AND component->>'route_template' = '/v1/runs/:id/events'` increases by 1 within 5 s, with `run_ref` equal to the run id.
5. `curl -sk https://localhost:3000/v1/auth/login -X POST -d '{}' -H 'content-type: application/json' -w '\n%{http_code}\n'` → the same status and body as before the slice (V compares against the pre-slice recording in the handoff) and NO occurrence row with a zone route template exists: `SELECT count(*) FROM obs.occurrence WHERE component->>'route_template' LIKE '/v1/auth/%'` → `0`.
6. `node -e "import('./tests/support/zone-boundary.ts')"` is NOT how V checks the zone; instead: `git diff <base>..<tip> -- apps/api/src/index.ts | grep -c 'options.registration !== undefined'` → `0` (the block is not in the diff).
V vetoes Done only after steps 1–6 match.

## 6. Out of scope
The client-report endpoint and browser seam (FIX-06) · anything inside `registration.ts`, `mfa.ts`, `sessions.ts`, `recovery.ts`, `account-erasure.ts`, `legacy-claim.ts`, `mail-channel.ts` (zone) · the `/v1/session` route's behaviour · rate limiting (FIX-06).

## 7. File surface (single-writer) and parallel safety
Allowed: `apps/api/src/index.ts` regions `error-boundary` (`setErrorHandler`) and `obs-context-hook` (a module-level route-template table + one `onRequest` hook registration, anchored by symbol) · `apps/api/src/main.ts` first-import line · tests `tests/integration/fix04-*.test.ts`, `tests/architecture/fix04-*.test.ts`.
Read-only: `tests/support/zone-boundary.ts` (shared fixture, never edited) · `packages/obs-capture/src/{context,kinds,index}.ts` · `packages/obs-capture/install/api.ts`.
Forbidden: the zone-route-mount region (one byte) · every zone file · `apps/api/src/obs-client-report.ts` and the client-report mount line (FIX-06) · `apps/runner/**`, `apps/scheduler/**`, `packages/**` except read-only.
Parallel-safe with: FIX-01, FIX-02, FIX-03, FIX-05, FIX-08+, FIX-16. Must NOT run concurrently with **FIX-06** (same file `apps/api/src/index.ts`; FIX-06 dispatches after FIX-04 merges).
