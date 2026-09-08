# FIX-04 SPEC-v3 — local C2/C3 capture acknowledgement authority

Status: LOCAL IMPLEMENTATION AUTHORITY under the user's standing approval on 2026-09-08. This successor permits the sole locally complete C2/C3 path described below. It does not claim V acceptance, merge authority, push authority, production authority, or Done.

This file supersedes `SPEC-v2.md` only for its C2/C3 product-work stop. `SPEC.md` and `SPEC-v2.md` continue to govern the request behavior, zone invariant, admitted base, C1 guard, privacy law, and acceptance boundary.

## Exact dependency composition

- Reviewed FIX-04 C1 is `6d55ed4c5e3e8fef20b93ed91850cdd1766eac12`.
- Its admitted base is `34ebf866f7801d9620ee56f14f548b220b6ad442`.
- The base already composes reviewed FIX-01 `24d0b3e5de84876b6b46fa84b13a0a42aa2640a4` and reviewed FIX-03 declared-kind projection `6649fd7d809c6bc2ff21123d8b47c3d8a2b553e9`.
- FIX-02 and full FIX-03 `322b188649e5db7b1a264ceef2155f35470acd3e` remain excluded because FIX-04 consumes neither their cause-storage nor runner/provider surfaces.

## Capture acknowledgement contract

`captureHandled(error, context)` returns the exact reserved `source_event_ref` string. Reservation happens before the queue offer. The same immutable value travels on the trusted queue entry and is normalized by the redactor for database and spool output. Existing callers remain source-compatible because ignoring a returned string is valid.

If reservation fails, the closed fallback `UNKNOWN:SOURCE_EVENT_REF_UNAVAILABLE` is returned and redacted with `fallback_minimized=true`. Capture remains total and product failure semantics still win.

## Route-template projection contract

The handled-capture context may carry `capture_point` and `route_template`. The redactor reads own data properties only, accepts a closed capture-point member, rejects query strings, fragments, escapes, empty segments, and overlong route templates, and adds only `route_template` to the immutable base component. It never accepts caller-supplied process, package, source-event, or arbitrary component data.

The API supplies `request.routeOptions.url`, never `request.url`. It omits route templates for authorization resources `identity`, `session-self`, and `session-owner`; therefore excluded-zone requests cannot persist a zone route template. No zone module or zone file is read for this decision.

## Request context contract

`OBS_RUN_SCOPED_ROUTE_TEMPLATES` contains exactly `/v1/runs/:id/events`, `/v1/runs/:id`, and `/v1/runs/:id/answer`. One callback-style `onRequest` hook enters `AsyncLocalStorage` for every request. It declares `run_ref=declaredRef("run", id)` only when the active route template is in that table and `id` passes the existing UUID schema; every other request receives an empty frozen context.

## Local write surface

- Capture ABI: `packages/obs-capture/src/emit.ts`, `packages/obs-capture/src/redactor.ts`.
- API: `apps/api/src/main.ts` first import and `apps/api/src/index.ts` error-boundary/context-hook regions.
- Tests: `tests/unit/fix04-capture-contract.test.ts`, `tests/integration/fix04-error-boundary.test.ts`, `tests/integration/fix04-context-hook.test.ts`, and the existing C1 architecture test.
- Authority record: this file, `PLAN-v3.md`, and one append-only decision row.

Every other package, API region, zone file, migration, UI, runner, scheduler, listener, and existing test remains read-only.

## Claim boundary

Locally green C2/C3 tests are worker evidence only. Real database-down, spool-drain, streaming, zone-response, and V veto steps remain external acceptance blockers.
