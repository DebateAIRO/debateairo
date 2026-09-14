# FIX-04 C2/C3 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:test-driven-development for every product behavior and superpowers:verification-before-completion before each commit.

**Goal:** Complete the FIX-04 API failure boundary and request context locally while preserving the admitted zone bytes.

**Architecture:** Extend the existing total capture emitter with a pre-enqueue acknowledgement and a closed per-event route-template projection. Bind the API error boundary to that acknowledgement before reply or connection destruction, then enter an empty-or-run-only ambient context from one `onRequest` hook.

**Tech Stack:** TypeScript ESM, Fastify 5, AsyncLocalStorage, pnpm 11, Vitest 4.

**Spec:** `docs/missions/observability-agents/slices/FIX-04/SPEC-v3.md`, plus unchanged `SPEC.md` and `SPEC-v2.md` constraints.

## Global constraints

- Start at reviewed C1 `6d55ed4c5e3e8fef20b93ed91850cdd1766eac12`; retain `FIX04_BASE_REF=34ebf866f7801d9620ee56f14f548b220b6ad442` for every zone test.
- Tests precede product bytes and each RED must fail for the named missing behavior.
- No command reads or uses `.hermes/**`.
- No zone file, migration, production service, database mutation, merge, push, V acceptance act, or board mutation.

### Task 1: Trusted capture acknowledgement and projection

**Files:** create `tests/unit/fix04-capture-contract.test.ts`; modify `packages/obs-capture/src/emit.ts` and `packages/obs-capture/src/redactor.ts`.

- [ ] Write a real queue/redactor test proving the returned ID equals the persisted envelope ID, the offer sees the reservation, a valid template becomes `component.route_template`, and invalid metadata is omitted.
- [ ] Run the focused unit test and require RED on the missing string acknowledgement.
- [ ] Add the minimal emitter and redactor contract; run GREEN and the adjacent capture/projection suites.
- [ ] Commit the capture ABI milestone.

### Task 2: API error boundary

**Files:** create `tests/integration/fix04-error-boundary.test.ts`; modify `apps/api/src/main.ts` and the `setErrorHandler` region of `apps/api/src/index.ts`.

- [ ] Test a real Fastify 500, stable 4xx body, and live post-header failure. Prove queue offer precedes reply send or socket destruction, the 500 body contains only `error` and `correlation_id`, the redacted row uses `runtime=api`, `capture_point=http`, and the Fastify template, and main imports the installer first.
- [ ] Run RED on the old 500 body and missing installer import.
- [ ] Add the first import and one capture call before either transport branch; run GREEN.
- [ ] Commit C2.

### Task 3: Request-scoped run context

**Files:** create `tests/integration/fix04-context-hook.test.ts`; modify only the module-level context table and hook region in `apps/api/src/index.ts`.

- [ ] Observe `getObsContext()` through real Fastify lifecycle work for all three run templates plus ordinary and excluded routes. Require a declared run only for valid IDs on those three templates and an entered empty context everywhere else.
- [ ] Run RED because no request context exists.
- [ ] Add the exact table and callback-style `onRequest` hook; run GREEN.
- [ ] Commit C3.

### Task 4: Verification and handoff

- [ ] Run C1/C2/C3 three times with the explicit base ref; run adjacent capture/API suites, contract generation, typecheck delta, source audit, and diff checks.
- [ ] Confirm the semantic zone region is still 1,653 bytes with SHA-256 `bff20f70edcff8df1f530a5b9f33417f1012017ce9c5e38edebb73b1d99f351d`.
- [ ] Record exact commits, counts, inherited failures, and remaining V-only acceptance steps in the handoff ledger.
