# FIX-16 C1 round-2 rework report

Date: 2026-09-04

Branch: `codex/oa-fix-16`

Round-2 base: `6df9ff6c59bab170c3ad713cb9e0a303587c7292`

## Scope

This worker milestone remains C1-only. It changes the two inventory scanner
sources, the focused FIX-16 architecture test, and two existing C1 fixtures
whose deliberately handled Promises now consume their rejection values. It
does not add a baseline, CLI/index, README, package wiring, product change, or
C2 surface.

## Review findings reproduced as RED

Before implementation, five focused tests were added for the five semantic
groups in the round-2 review. The suite reported exactly 5 failed and 17
passed tests:

1. empty and non-observing `.catch` callbacks, missing/non-observing `.then`
   rejection callbacks, and explicit `any` discards escaped `void_promise`;
2. reassigned caught aliases and later object spreads retained stale cause;
3. `module.require`, assignment aliases, and reassignment invalidation were
   not modeled;
4. computed, spread, and aliased classification data escaped outside the
   exact manifest path;
5. exact computed `cause` and nested catch-binding shadowing false-positive.

An adjacent local callback-alias example then produced a second genuine RED:
the suite reported 1 failed and 21 passed tests because an alias of a local
non-observing function was incorrectly accepted.

## Implementation

- Promise candidates come from the TypeScript checker. Structurally callable
  `then` members qualify; explicit `any` and unresolved/error types fail
  closed. `.catch` and `.then` count as observed only when their rejection
  callback consumes its first parameter. Local function declarations,
  expressions, and initializer aliases are resolved by compiler symbol.
- Catch identities and object cause state are updated in source order.
  Reassignments invalidate stale identities, object spreads and explicit
  writes apply last-write-wins semantics, and unknown spread values fail
  closed. Computed literal `cause` is exact. Compiler name resolution removes
  outer catches hidden by nested declarations while retaining valid closures.
- The zone visitor recognizes unshadowed `module.require`, declaration and
  assignment aliases, and removes aliases after reassignment. Global loader
  meaning is distinguished from parameters and object lookalikes through
  compiler symbols.
- Manifest-shaped data outside the normalized exact manifest follows
  compiler-symbol initializers, computed constant property names, arrays,
  spreads, conditional/wrapper expressions, and shorthand properties. The
  exact real manifest remains exempt independent of its object spelling.
- Existing byte, file, AST-node, and candidate ceilings remain finite and
  fail closed. The zone classifier remains importer-text-only and does not
  inspect target paths.

## Mutation evidence

One-at-a-time mutants were applied, observed RED, and restored. The focused
tests killed:

- call-shape-only rejection observation and the opposite blanket
  non-observation overreach;
- stale caught aliases, first-write-wins spread handling, and blanket
  rejection of aliased option objects;
- ignored computed `cause` keys and retention of lexically shadowed catches;
- missing `module.require`, missing assignment alias introduction, stale
  loader aliases, and broad matching of every property named `require`;
- opaque manifest aliases, ignored array spreads, ignored computed manifest
  properties, and removal of the exact-manifest exemption.

No mutant marker remains in either implementation file.

## Verification evidence

The final focused command passed 22/22 three consecutive times:

```text
pnpm vitest run tests/architecture/fix16-gate.test.ts --reporter=dot
run 1: exit 0, 22 passed, 1.43 s
run 2: exit 0, 22 passed, 1.41 s
run 3: exit 0, 22 passed, 1.42 s
```

- Full production scan: exit 0, 431 rows in 10,723 ms; 143 `bare_catch`, 226
  `throw_without_code`, 57 `void_promise`, 5 `wrapper_without_cause`, and 0
  `zone_import`. This is below the 30,000 ms seed.
- The focused suite covers file bytes, AST nodes, candidate count, malformed
  syntax, positive finite defaults, normalized traversal, source symlink
  rejection, and importer-only target handling.
- `pnpm typecheck` reproduced only the pinned eight diagnostics in
  `tests/unit/s14-ui.test.ts`; no C1 diagnostic appeared.
- `pnpm audit:source` reproduced only the pinned three obs installer
  environment-read blockers; no C1 blocker appeared.
- `pnpm audit:text-bytes` passed with `REPOSITORY_TEXT_CONTROL_BYTES=0`.
- `git diff --check` passed. Static searches found no filesystem API in
  `zone-check.ts`, no regex classifier in either C1 implementation, and no
  mutation marker.

## Status boundary

This is an implementation and verification handoff for C1 only. C2 remains
deferred. No baseline snapshot, CLI/root-package wiring, merge, board update,
or V acceptance was performed or claimed.
