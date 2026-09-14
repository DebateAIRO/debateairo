# FIX-16 C1 rework round 6 report

Date: 2026-09-04

## Scope and status

This commit implements only the five frozen C1 groups from the round-6 Sol
review. It changes the inventory scanner, its focused architecture test, and
this report. It does not change the zone checker, a baseline, CLI or package
wiring, product source, C2, frozen authority, merge state, board state, or
V-acceptance state. Sol review artifacts remain untracked and excluded.

## Review findings resolved

- Loop completions carry every label stacked directly on a loop. A definitely
  true first `for` condition uses its first back edge rather than reintroducing
  a spurious zero-iteration state, while unknown conditions retain the
  conservative zero-iteration path.
- Bounded array/object heap values now transfer through aliased `for...of`,
  destructuring, aliased `for...in`, and object spread. Unknown or capped
  collections remain fail closed.
- Direct and computed object properties retain require identity and truthiness.
  Property `=`, `||=`, and `&&=` therefore expose their current result when
  used as a callee.
- Lexically nested closures with an inventory-bearing body execute at their
  actual call state. Recursion and execution counts remain bounded; rejection
  callback proofs retain their prior every-completion behavior. Top-level
  helpers keep generic deferred analysis, preventing call-site arguments from
  narrowing the production inventory.
- Manifest arrays track exact numeric/string index overwrites, full-array
  `fill`, and trusted global `Array.prototype.push.call`. Array spreads retain
  exact tracked elements when bounded, so findings stay attributed to the
  classified literal instead of a later unknown container.

## TDD evidence

Before scanner changes, the five exact review groups were added to the focused
suite. The RED run had exactly five failing new tests and all 45 prior tests
passing. Each group contains the harmful report examples and inverse-safe
controls. A stacked-label incrementor neighbor was retained to distinguish a
real routed back edge from unreachable-inventory inspection.

The first complete GREEN run passed 50/50. During verification, the initial
full-tree run exposed nested-call expansion above the timing bound. Restricting
call-time execution to lexically nested, candidate-bearing closures restored
generic top-level analysis, the exact 379-row inventory, and repeatable timing
headroom without weakening the five focused outcomes.

## Mutation evidence

Six isolated, one-at-a-time mutants were killed and immediately restored:

1. reintroduce the initial loop state after a definitely-entered labelled loop;
2. match only the innermost stacked loop label;
3. disable tracked-array alias transfer;
4. discard tracked property require identity;
5. suppress call-time execution of nested closures; and
6. reject exact string-form array indices.

The restored scanner was byte-compared after the mutation session. The same
tests retain the inverse-safe controls, so the restored implementation also
kills the adjacent overreach behavior.

## Verification evidence

The final focused command passed 50/50 in three consecutive unchanged runs:

```text
pnpm exec vitest run tests/architecture/fix16-gate.test.ts --reporter=dot
run 1: 50 passed, 10.85 s
run 2: 50 passed, 10.88 s
run 3: 50 passed, 10.83 s
```

Three consecutive full production scans returned the unchanged 379-row
inventory: 143 `bare_catch`, 173 `throw_without_code`, 41 `void_promise`, 16
`wrapper_without_cause`, and 6 `zone_import` findings.

```text
run 1: 19.584 s
run 2: 19.370 s
run 3: 19.495 s
```

The injected-filesystem full scan returned the same 379 rows through 364
operations and addressed zero classified zone paths.

- `pnpm typecheck` reproduced exactly the pinned eight diagnostics in
  `tests/unit/s14-ui.test.ts`; there was no C1 diagnostic.
- The `pnpm audit:source` and `pnpm audit:text-bytes` wrappers could not create
  their sandboxed `tsx` IPC sockets. The equivalent `node --import tsx`
  commands reproduced exactly the pinned three obs-installer environment-read
  blockers and passed with `REPOSITORY_TEXT_CONTROL_BYTES=0`.
- `git diff --check` passed.
- Static checks found no filesystem access in `zone-check.ts`, no debug,
  TODO/FIXME, or mutant marker in the C1 source/test, and retained TypeScript
  AST predicates for catch, throw, void, wrapper, and function semantics.
- The pre-report diff contained only the authorized scanner and focused test;
  this report is the only additional tracked file.

## Boundary

This is a C1 implementation milestone only. A fresh independent review is
still required. C2 and V acceptance remain deferred.
