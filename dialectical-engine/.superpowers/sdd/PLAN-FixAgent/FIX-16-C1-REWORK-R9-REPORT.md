# FIX-16 C1 rework round 9 report

Date: 2026-09-04

## Scope

This correction addresses only the two binding roots frozen by the round-9
Sol review: stored object values passed to object-destructured parameters, and
stored properties reached through a stable captured object at callable-entry
saturation. It changes the C1 scanner, the focused architecture test, and this
report. It does not change frozen authority, product source, baseline data,
package wiring, C2, merge state, or V acceptance. Hermes was not used.

## RED and correction

Both exact review probes were added before production edits and run in separate
fresh processes. Each failed on its harmful assertion because `scanSource`
returned `[]` instead of one `zone_import`. The frozen review had separately
recorded `[]` for each safe inverse.

The first root was in `updatePattern`. Stored arrays already transferred their
element values into destructured identifier bindings, while stored objects fell
through to unknown binding. The scanner now resolves an exact, known stored
object and transfers each exact property value into its object-binding
identifier. Rest elements, nested names, uncertain keys, and unknown stored
objects remain conservative.

The second root was in `widenCallableEntry`. Generic widening changed stable
captured object references and all stored object values to unknown, so
`storedPropertyOf` could no longer see a global `require` assigned before the
fifth distinct call. Callable-entry widening now retains only exact,
non-unknown object-reference identities that agree between the prior and
current entries, together with their bounded joined stored-property values.
The global fifth value is therefore visible, while five local values remain
local.

## Mutation evidence

Four one-at-a-time source mutations were exercised and then removed:

1. replacing stored-object binding transfer with unknown binding made the
   object-destructured harmful case return `[]`;
2. adding possible-global `require` to every transferred stored property made
   the object-destructured safe inverse emit `zone_import`;
3. removing stable-object preservation from callable widening made the
   captured-property harmful case return `[]`; and
4. adding possible-global `require` to each preserved property made the
   captured-property safe inverse emit `zone_import`.

The final two behavioral pairs passed together after the production versions
were restored.

## Verification

The focused suite passed 55/55 in three fresh final-source processes:

```text
pnpm exec vitest run tests/architecture/fix16-gate.test.ts --reporter=dot
run 1: 55 passed, 11.25 s
run 2: 55 passed, 11.21 s
run 3: 55 passed, 11.35 s
```

These runs retain the exact round-8 pins, the five round-6 regression groups,
and the recursion and bounded-call controls.

Three fresh full production scans returned the identical 379 findings: 143
`bare_catch`, 173 `throw_without_code`, 41 `void_promise`, 16
`wrapper_without_cause`, and 6 `zone_import`.

```text
run 1: 20.062 s
run 2: 20.171 s
run 3: 20.118 s
```

All three scanner times remain below the frozen 30-second bound.

- `pnpm typecheck` reproduced exactly the pinned eight diagnostics, all in
  `tests/unit/s14-ui.test.ts`; there was no C1 diagnostic.
- `node --import tsx tools/orphan-audit/src/cli.ts source` reproduced exactly
  the pinned three obs-capture installer environment-read blockers and no C1
  blocker.
- `REPOSITORY_TEXT_CONTROL_BYTES=0 node --import tsx
  tools/check-text-control-bytes.ts` passed.
- Static inspection retained TypeScript AST predicates for catch, throw, void,
  wrapper, callable, and import semantics; retained finite flow, iteration,
  callable, file, byte, node, and candidate bounds; and found no filesystem API
  in `zone-check.ts`.
- Added C1 source and test hunks contain no TODO, FIXME, suppression, temporary
  mutation, or debug scaffolding.
- `git diff --check` passed on the final staged surface.

## Status boundary

This remains a C1 implementation milestone. A fresh independent Sol review is
required. C2 and V acceptance remain deferred.
