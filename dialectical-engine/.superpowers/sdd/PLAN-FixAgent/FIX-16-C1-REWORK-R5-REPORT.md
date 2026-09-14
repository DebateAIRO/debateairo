# FIX-16 C1 rework round 5 report

Date: 2026-09-04

## Scope and status

This commit completes only the authorized C1 rework from the round-5 Sol
review. It changes the inventory scanner, the focused FIX-16 architecture
test, and this report. It does not create or update a baseline, CLI/index,
package wiring, product source, C2 artifact, merge, board state, or
V-acceptance claim.

The Sol review artifacts remain untracked and are excluded from the commit.

## Review findings resolved

The bounded statement interpreter now routes labelled loop completions to
their target and exposes a conservatively widened header on a capped natural
exit. The 64-iteration fixed point therefore preserves all five 65-hop
domains: require identity, callback definition, coded throw value, wrapper
constructor, and caught-cause lineage.

Known `for...of` values, `for...in` keys, declaration destructuring, and
assignment destructuring transfer through the same value domains. `||=`,
`&&=`, and `??=` use truthiness/nullish branch semantics, and assignment
expressions expose their resulting current value in callee position.

Callable definitions are current-state values. Hoisted declarations,
function expressions, closures, and rejection callbacks all execute through
the same completion-aware statement interpreter. Rejection observation is a
flow domain propagated through aliases, switch case expressions,
try/catch/finally, labels, and abrupt paths. Imported, unresolved, recursive,
or capped callbacks are not treated as proven observers. Nested callable
execution and repeated calls are explicitly bounded; a cap widens state
conservatively.

Object and array identities now live in a joined heap domain. Direct and
computed `Object.assign` update the target and return its identity. Cause
last-writes, spreads, deletes, and returned assignments preserve their
evaluation order. Manifest arrays retain mutations through aliases and
manifest-shaped properties, including `push`, `unshift`, and `splice`.

Deferred inventory uses the same function interpreter. Candidate-free bodies
are skipped, while candidate-bearing nested bodies remain queued. Oversized
enclosing functions avoid duplicate interpretation of their independently
queued nested functions, providing bounded runtime without changing the
inventory result.

## TDD evidence

Before source changes, the five exact round-5 regression groups were added to
the focused suite. The first run was RED with five new failures and all 40
prior tests passing. The groups covered:

1. labelled loop completion and 65-hop capped flow;
2. `for...of`, `for...in`, and destructuring transfers;
3. logical assignment and assignment-valued callees across all domains;
4. current-state closures plus rejection callbacks using the statement CFG;
5. computed/returned `Object.assign` and manifest array mutation.

Every group contains both harmful and inverse-safe cases. A focused `for...in`
key transfer was additionally captured RED (safe coded key falsely reported)
before its transfer was implemented.

## Mutation evidence

Six isolated one-at-a-time mutants were killed by the focused tests and
immediately restored:

1. discard the widened loop header instead of returning it at the cap;
2. disable known iteration/destructuring transfers;
3. evaluate the `||=` assignment branch for a truthy retained value;
4. accept every rejection callback without interpreting its completions;
5. reject every rejection callback, including all-path observers;
6. recognize only property-access `Object.assign`, omitting computed access.

These cover one meaningful mutant per review root and both false-negative and
overreach neighbors. No mutant marker or modified mutant remains.

## Verification evidence

The final focused command passed 45/45 in three consecutive unchanged runs:

```text
pnpm vitest run tests/architecture/fix16-gate.test.ts --reporter=dot
run 1: 45 passed, 10.39 s
run 2: 45 passed, 10.63 s
run 3: 45 passed, 10.46 s
```

Three consecutive unchanged full production scans each returned 379 rows
with the preserved distribution of 143 `bare_catch`, 173
`throw_without_code`, 41 `void_promise`, 16 `wrapper_without_cause`, and 6
`zone_import` findings:

```text
run 1: 20.350 s
run 2: 20.549 s
run 3: 20.393 s
```

All three have more than six seconds of headroom below the 27-second review
target and more than nine seconds below the 30-second hard seed.

The final injected-filesystem full scan returned the same 379 rows through
364 operations and addressed zero classified zone paths.

- `pnpm typecheck` reproduced exactly the pinned eight diagnostics in
  `tests/unit/s14-ui.test.ts`; there was no C1 diagnostic.
- `pnpm audit:source` reproduced exactly the pinned three obs-installer
  environment-read blockers and no C1 blocker.
- `pnpm audit:text-bytes` passed with `REPOSITORY_TEXT_CONTROL_BYTES=0`.
- `git diff --check` passed.
- Static searches found no filesystem API in `zone-check.ts`, no obsolete
  callback CFG, and no TODO, FIXME, or mutation marker in the C1 delta.
- Scope from round 4 contains only the authorized scanner source, focused
  architecture test, and this report.

## Boundary

This is a C1 implementation milestone only. A fresh independent review is
still required. C2 and V acceptance remain deferred.
