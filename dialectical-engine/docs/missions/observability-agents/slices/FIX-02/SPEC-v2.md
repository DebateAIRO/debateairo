# FIX-02 SPEC-v2 — C1 error cause correction

Status: FROZEN — controller-ratified under the current approved FixAgent goal on 2026-09-04. This is planning authority only. It records no production acceptance or V attestation.

This file has higher precedence than `SPEC.md` for FIX-02 C1 only. All other FIX-02 work remains deferred.

## C1 scope

Allowed product region:

- `packages/kernel/src/index.ts`, the `TypedDomainError` class only

Allowed test:

- `tests/unit/fix02-cause-chain.test.ts`

No database, capture, runner, scheduler, migration, manifest, lockfile, package, or other test file is part of C1.

## C1 contract

`TypedDomainError` has this constructor:

```ts
constructor(
  readonly code: string,
  message: string,
  options?: { cause?: unknown }
)
```

It calls `super(message, options)` and then sets `this.name = "TypedDomainError"`.

C1 must prove:

1. An `Error` cause is kept by identity.
2. A primitive cause is kept by identity.
3. An explicit `undefined` cause remains `undefined`.
4. Existing two-argument calls still compile and behave the same.
5. `name`, `code`, `message`, and stack behavior stay stable.

## Deferred work

The second real wrapper, database fixed-template wrapper, pool health channel, async multi-error join, FIX-01-dependent stored chain, and V acceptance are not part of C1. They need new controller authority after their real product seams and dependencies are fixed.

## C1 milestone

C1 is ready for review when the focused test passes three fresh runs, the named mutants fail and are restored, the adjacent kernel test passes, type and static checks match the pinned base, and the code commit contains only the kernel class and focused test. This is not FIX-02 Done.
