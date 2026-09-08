# FIX-16 C1 round-3 rework report

Date: 2026-09-04

Branch: `codex/oa-fix-16`

Round-3 base: `053fa09687381f30ac6b8b3f8b718ede90e16e49`

## Scope

This worker milestone remains C1-only. It changes `scan.ts`, `zone-check.ts`,
and the focused FIX-16 architecture test. It adds this normal implementation
report. It does not add a baseline, CLI/index, package wiring, product source,
frozen FIX-16 artifact, or C2 surface.

## Review findings reproduced as RED

Four focused tests covering all five semantic groups were added before the
flow implementation. The first run reported 4 failed and 22 passed tests:

1. callback aliases used stale declarations, conditional definitions lost a
   non-observing path, and an empty destructuring callback was accepted;
2. same-object alias mutation, conditional cause aliases, and computed cause
   key aliases inverted harmful and safe wrapper decisions;
3. a conditional replacement erased a possible global `require`, while
   computed `module["require"]` escaped;
4. mutable manifest key/value aliases retained stale declaration values in
   both harmful and safe directions.

A zero-iteration loop test then produced a separate real RED across callback,
cause, require, and manifest state. A final adjacent catch-context test also
produced a real RED: reassigning the catch variable caused a wrapper with no
cause to escape even though execution remained on the catch path.

## Implementation

- `scan.ts` now carries bounded flow state for callback definitions, caught
  value lineage, active catch context, constant string values, object alias
  identities, and object `cause` property possibilities. Sequential writes
  replace current state; conditional and loop exits join possible states.
- Rejection handling suppresses `void_promise` only when the current callback
  possibilities all observe rejection. Empty object/array binding patterns
  observe nothing; current assignments supersede stale declarations.
- Wrapper options share state across aliases. Property writes, computed keys,
  object spreads, and branch joins preserve last-write and possible-value
  semantics. A wrapper is safe only when its effective cause is the caught
  value on every represented path. Catch-path context remains active even if
  the original catch variable is reassigned, while compiler name resolution
  keeps nested shadowing safe.
- `zone-check.ts` now carries bounded flow state for possible global/local
  require meanings and classification data. Conditional replacement retains
  possible global `require`; a definite later local replacement removes it.
  Both `module.require` and `module["require"]` are compiler-shadow-aware.
- Mutable manifest key, value, array, spread, conditional, and call-argument
  aliases use their current or joined state. Possible classified data fails
  closed outside the exact normalized manifest source; the exemption remains
  exact-file-only.
- Alternative sets are capped at 32 and overflow becomes unknown/fail-closed.
  The pre-existing file-byte, file-count, AST-node, and candidate ceilings
  remain finite. Zone checking still consumes importer AST text only and does
  not access target paths.

## Mutation evidence

Eighteen one-at-a-time mutants were applied, observed RED, and restored. They
covered:

- callback branch selection, ignored assignments, empty-destructuring
  over-acceptance, and blanket rejection of local consuming callbacks;
- cause branch selection, lost object identity, ignored alias property writes,
  opaque computed keys, one-branch property snapshots, catch-context erasure,
  and zero-iteration loss;
- require branch selection, missing computed `module.require`, lexical module
  overreach, stale definite aliases, and zero-iteration loss;
- manifest branch selection, declaration-only assignment state, opaque data
  aliases, and zero-iteration loss.

The round-2 exact-manifest-exemption mutant remains covered by the unchanged
focused test. No mutation marker remains in source or tests.

## Verification evidence

The final focused command passed 28/28 on three consecutive runs:

```text
pnpm vitest run tests/architecture/fix16-gate.test.ts --reporter=dot
run 1: exit 0, 28 passed, 1.76 s
run 2: exit 0, 28 passed, 1.75 s
run 3: exit 0, 28 passed, 1.73 s
```

- Full production scan: exit 0, 398 rows in 13.13 s; 143 `bare_catch`, 182
  `throw_without_code`, 57 `void_promise`, 16 `wrapper_without_cause`, and 0
  `zone_import`. This is below the 30 s seed. A comparison against the prior
  scanner showed that all 44 removed throw rows were direct caught rethrows,
  which the scanner contract treats as safe.
- The focused suite covers finite file-byte, AST-node, candidate, and file
  ceilings; malformed syntax; normalized traversal; exact manifest scope;
  source-symlink rejection; and importer-only target handling.
- `pnpm typecheck` reproduced exactly the pinned eight diagnostics in
  `tests/unit/s14-ui.test.ts`; no C1 diagnostic appeared.
- `pnpm audit:source` reproduced only the pinned three obs installer
  environment-read blockers; no C1 blocker appeared.
- `pnpm audit:text-bytes` passed with `REPOSITORY_TEXT_CONTROL_BYTES=0`.
- `git diff --check` passed. Static searches found no filesystem API in
  `zone-check.ts`, no regex classifier, and no TODO/FIXME/mutation marker in
  the C1 delta.
- Scope inspection from the round-3 base showed only the two C1 scanner
  sources, the focused test, and this report. Review artifacts remain
  untracked and are excluded from the commit.

## Status boundary

This is an implementation and verification handoff for C1 only. C2 remains
deferred. No baseline snapshot, CLI/root-package wiring, merge, board update,
or V acceptance was performed or claimed.
