# FIX-16 C1 rework round 4 report

Date: 2026-09-04

## Scope and status

This commit completes the authorized C1 implementation rework only. It changes
the inventory scanner, the pure importer-path classifier, the focused FIX-16
architecture test, one existing scanner fixture, and this report. It does not
create a baseline, CLI/index entry, package wiring, product edit, C2 artifact,
merge, board update, or V-acceptance claim.

The four Sol review reports remain untracked and are excluded from the commit.

## Review findings resolved

The scanner now has one bounded statement-level abstract interpreter. Its
state is joined by explicit `normal`, `return`, `throw`, `break`, and
`continue` completions. `if`, switch fallthrough, try/catch/finally, and loop
back edges all use the same current state. Loops iterate to a fixed point with
a 64-iteration cap; the capped state is widened conservatively. Value-set
domains cap alternatives at 32.

The interpreter supplies current and joined values for:

- local rejection callbacks and every-path callback-body consumption;
- caught-root aliases, object identities, cause last-writes, `delete`, and
  `Object.assign`;
- registry-coded throw values and `TypedDomainError` constructor aliases;
- global, local, nullish, conditional, computed-module, and comma-form require
  values;
- mutable string keys, arrays, spreads, aliases, and manifest-shaped property
  writes.

Imported or otherwise unresolved callbacks are not proven rejection
observers. Computed `catch` and `then` members are recognized. Catch-root
aliases remain visible when the original catch name is shadowed. Cause is
accepted only when every possible current object value preserves the caught
root. Named wrapper imports are restricted to `@debateai/kernel`.

Switch case expressions are evaluated while selecting a possible entry and
are not evaluated again on an earlier-case fallthrough path. Loop conditions
are evaluated at each back edge before the exit state is formed. Definite
non-null ambient values make `??=` skip its right side, while possible-nullish
values retain both states.

The zone classifier remains textual on the importer. It normalizes importer
and specifier traversal, reports only importer locations, grants the data
exemption only to the exact normalized manifest source, and contains no
filesystem operation.

## TDD evidence

Before the interpreter rewrite, the seven exact round-4 groups were added to
the focused suite. The first run was RED with 7 new failures and all 28 prior
tests passing. The failures covered loop/switch/exception/abrupt flow,
callback body semantics, caught-alias shadowing, cause mutations, mutable
throw/constructor aliases, require expressions, and manifest property writes.

Three adjacent test batches were also captured as RED before their source
changes:

- all-path callback completion, definite-local `??=`, and loop-condition
  order: 3 new failures with 34/37 passing;
- same-spelled foreign wrapper import: 1 new failure with 37/38 passing;
- callback switch/zero-iteration paths and switch case-expression order: 2
  new failures with 38/40 passing.

The final focused suite contains harmful and inverse-safe cases for all seven
review groups, two-or-more-iteration loops, zero-iteration loops, switch
fallthrough, case-expression order, exceptional joins, return, break,
continue, finally, computed keys/members, exact manifest exemption, lexical
shadows, symlinks, traversal, and every published resource bound.

## Mutation evidence

Thirteen isolated one-at-a-time meaningful mutants were killed by the focused
suite and immediately restored:

1. cap loop interpretation at one iteration;
2. accept callback binding shape without body/path proof;
3. erase visible caught aliases under name shadow;
4. omit `Object.assign` cause writes;
5. omit current identifier assignment state;
6. erase comma-form require identity;
7. omit manifest-shaped property assignment classification;
8. remove the exact manifest exemption;
9. accept a same-spelled wrapper from a foreign import;
10. accept a cause that is caught on only one possible path;
11. accept imported callbacks as proven observers;
12. infer switch callback consumption from any body use;
13. re-evaluate later case expressions on fallthrough.

No mutation marker remains in source or tests.

## Verification evidence

The final focused command passed 40/40 on three consecutive runs:

```text
pnpm vitest run tests/architecture/fix16-gate.test.ts --reporter=dot
run 1: exit 0, 40 passed, 2.73 s
run 2: exit 0, 40 passed, 2.73 s
run 3: exit 0, 40 passed, 2.71 s
```

- Full production scan: exit 0, 379 rows in 20.347 s, below the 30 s seed:
  143 `bare_catch`, 173 `throw_without_code`, 41 `void_promise`, 16
  `wrapper_without_cause`, and 6 conservative `zone_import` entries from
  unknown computed manifest-shaped property writes.
- Injected-filesystem full scan: the same 379 rows through 364 operations and
  zero operations addressed to a classified zone path.
- `pnpm typecheck`: exactly the pinned eight diagnostics in
  `tests/unit/s14-ui.test.ts`; no C1 diagnostic.
- `pnpm audit:source`: exactly the pinned three obs-installer environment-read
  blockers; no C1 blocker.
- `pnpm audit:text-bytes`: exit 0 with
  `REPOSITORY_TEXT_CONTROL_BYTES=0`.
- `git diff --check`: exit 0.
- Static checks: no filesystem API in `zone-check.ts`; TypeScript compiler AST
  guards implement throw/catch/void/wrapper recognition; no TODO, FIXME,
  stale-declaration collector, or mutation marker in the C1 delta.
- Scope from the round-3 commit contains only the two authorized scanner
  sources, focused architecture test, scanner fixture, and this report.

## Boundary

This is a C1 implementation milestone. C2 and V acceptance remain deferred.
