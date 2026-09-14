# FIX-16 C1 rework round 7 report

Date: 2026-09-04

## Scope and status

This commit fixes only the frozen nested candidate-bearing closure execution
cap seam from the round-7 Sol review. It changes the C1 scanner, the focused
FIX-16 architecture test, and this normal report. The other four round-6 roots
are unchanged. It does not change `zone-check.ts`, frozen authority, product
source, a baseline, CLI/package wiring, C2, merge or board state, or
V-acceptance state. Sol review artifacts remain untracked and excluded.

## Root cause and fix

The prior bound counted raw calls. Four identical safe calls exhausted
`MAX_CALLABLE_EXECUTIONS`; the fifth call returned before visiting the body,
even when its captured require identity was newly global. Because the first
call had already marked the closure analyzed, deferred inventory also skipped
the body.

Nested candidate-bearing closures now retain a bounded joined abstract entry
state per definition. An entry state already covered by that join is skipped
without consuming another distinct-state execution. A newly reachable state
is interpreted, so arbitrarily many identical local calls cannot hide a later
global call. If distinct entry states exhaust the existing cap, the body is
visited once with a widened joined state and the definition is marked
saturated. Further states cannot cause unbounded execution, while the
saturation visit remains fail closed.

Top-level callable, recursive/depth-cap, and rejection-callback behavior is
unchanged.

## TDD evidence

The exact review example and its all-local inverse were added before scanner
changes. The focused RED failed only because the harmful fifth call returned
`[]` instead of the literal expected `zone_import`; the safe inverse returned
`[]`. After the state-coverage change, both sides passed, followed by the full
51-test focused suite.

## Mutation evidence

Two isolated one-at-a-time mutants were killed and immediately restored:

1. disabling state-aware handling for nested candidate closures restored the
   harmful fifth-call miss; and
2. disabling entry-state subsumption forced the identical all-local calls into
   saturation and produced the forbidden safe-side `zone_import`.

The scanner SHA-256 before and after mutation work was identical:
`46895466affe3c75adeb7bf6b7048211e57f109265b90c9ba88b46c6e02ee299`.
No mutant or debug marker remains.

## Verification evidence

The final focused command passed 51/51 in three consecutive unchanged runs:

```text
pnpm exec vitest run tests/architecture/fix16-gate.test.ts --reporter=dot
run 1: 51 passed, 10.98 s
run 2: 51 passed, 11.01 s
run 3: 51 passed, 10.87 s
```

Three consecutive full production scans returned the unchanged 379-row
inventory: 143 `bare_catch`, 173 `throw_without_code`, 41 `void_promise`, 16
`wrapper_without_cause`, and 6 `zone_import` findings.

```text
run 1: 19.791 s
run 2: 19.568 s
run 3: 19.551 s
```

Every run remained below the frozen 30-second bound. The injected-filesystem
scan returned the same 379 rows through 364 operations and addressed zero
classified zone paths.

- `pnpm typecheck` reproduced exactly the pinned eight diagnostics in
  `tests/unit/s14-ui.test.ts`; no C1 diagnostic appeared.
- `node --import tsx tools/orphan-audit/src/cli.ts source` reproduced exactly
  the pinned three obs-installer environment-read blockers and no C1 blocker.
- `node --import tsx tools/check-text-control-bytes.ts` passed with
  `REPOSITORY_TEXT_CONTROL_BYTES=0`.
- `git diff --check` passed.
- Static checks found no filesystem access in `zone-check.ts`, no
  TODO/FIXME/debug/mutant marker in the C1 source or test, and retained the
  TypeScript AST predicates and finite callable/flow bounds.
- Before this report, the diff contained only the authorized scanner and
  focused architecture test. This report is the only additional tracked file.

## Boundary

This remains a C1 implementation milestone. A fresh independent review is
required. C2 and V acceptance remain deferred.
