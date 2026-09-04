# FIX-02 SPEC-v3 — C2 database pool failures

Status: FROZEN — controller-ratified under the approved FixAgent goal on 2026-09-04. This gives planning authority only. It is not production acceptance or V attestation.

This file has higher precedence than `SPEC.md` for C2. `SPEC-v2.md` still controls C1.

## Real C2 seam

C2 covers the current pool wrapper made by `createPool` in `packages/db/src/index.ts`:

- pool query: callback, promise rejection, and sync throw
- pool connect: callback, promise rejection, and sync throw
- leased client query: callback, promise rejection, and sync throw
- the pool `error` event

There is no second database wrapper in this region. There is no multi-rejection join in this region. C2 must not invent either one.

## Allowed files

Product and package files:

- `packages/db/src/index.ts`, only the pool failure and wrapper region
- `packages/db/package.json`, only one direct `@debateai/obs-capture` dependency
- `pnpm-lock.yaml`, only the `packages/db` importer entry for that dependency

Tests:

- `tests/unit/fix02-pool-failure.test.ts`
- `tests/unit/pol03-pool-resilience.test.ts`, only to replace the old raw stderr expectation with the fixed message and empty stderr rule
- `tests/integration/pol03-pool-resilience.test.ts`, only to replace the old PostgreSQL raw stderr expectation with the fixed message and empty stderr rule

Read-only proof sources:

- `packages/obs-capture/src/index.ts`
- `packages/obs-capture/src/emit.ts`
- `packages/obs-capture/src/flusher.ts`
- `packages/obs-capture/src/redactor.ts`
- `packages/obs-capture/src/registry/index.ts`
- `packages/obs-capture/src/health.ts`
- `tests/architecture/obs-l2-s05-import-graph.test.ts`

`tests/support/poolFailureChild.ts` and all other fixtures stay unchanged.

## C2 contract

1. `typedPoolFailure` keeps an existing `TypedDomainError` with code `DATABASE_POOL_FAILED` by identity.
2. Every new pool failure is:
   - code: `DATABASE_POOL_FAILED`
   - message: exactly `PostgreSQL pool operation failed`
   - cause: the original thrown value by identity
3. No original error message is put into the new message, capture context, console, or any durable envelope.
4. Every query and connect path listed above preserves the same cause rule.
5. The first pool `error` event sets the terminal failure, makes exactly one `captureHandled` attempt, and does not run a query.
6. Later pool `error` events are ignored. They do not replace the first failure or make another capture attempt.
7. The capture call uses only the error reference and this frozen context:

```ts
{
  source: "database_pool",
  code: "DATABASE_POOL_FAILED"
}
```

8. The capture call has a local `try/catch`. A capture throw cannot replace, hide, or change the product failure.
9. `console.error` is not used in this region.
10. Callers keep the same callback, promise, sync, and terminal-pool behavior. Only the unsafe detail in the public message and stderr is removed.

## Capture dependency rule

`@debateai/db` may depend directly on the root `captureHandled` export from `@debateai/obs-capture`.

This is one way only:

- allowed: db → obs-capture
- forbidden: obs-capture → db

The root capture path must have no runtime import of `@debateai/db` or `pg`. The existing capture emitter owns its process singleton and lifecycle. C2 creates no new global hook. The redactor reads the fixed error code. Database-prefixed envelopes go to the spool path, not the database sink, so this path does not call the failed pool again.

## Deferred work

The unowned second wrapper, any multi-rejection join, FIX-01-dependent stored cause rows, C3, and V acceptance remain deferred. C2 makes no storage or full-slice Done claim.

## C2 milestone

C2 is ready for review only after the focused test passes three fresh runs, every named mutant fails, adjacent db/kernel/POL-03 and import-graph checks pass, type and source checks match the pinned base, and the commits contain only the files listed above plus the normal controller report.
