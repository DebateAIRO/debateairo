# FIX-16 C1 rework round 10 report

Date: 2026-09-04

## Scope

This correction addresses only the two P1 binding roots frozen by the
round-10 Sol review: a stored global `require` passed through a one-level
nested object binding, and a stable computed key used to read a captured
object property at callable-entry saturation. It changes the C1 scanner, the
focused architecture test, and this report. It does not change frozen
authority, product source, baseline data, package wiring, C2, merge state, or
V acceptance. Hermes was not used.

## RED and correction

Each exact review probe was added before its production correction and run in
a fresh process. The nested object-pattern harmful assertion failed because
`scanSource` returned `[]` instead of one `zone_import` at line 5. After that
pair was green, the stable computed-key harmful assertion independently failed
because `scanSource` returned `[]` instead of one `zone_import` at line 8.
Each test includes the frozen local-only inverse.

The first root was the stored-value boundary. `StoredValue` retained require,
truthiness, and data domains but not the bounded object identity needed to
continue binding `{ holder: { load } }`. Stored values now retain bounded
object references through clone, union, and equality operations. Exact stored
array and object values recurse through the finite syntax depth of the binding
pattern. Missing, unknown, computed-uncertain, and rest values still bind as
unknown.

The second root was callable-entry widening. Generic widening marked the
unchanged `"load"` key binding unknown even while the exact holder identity and
joined stored properties were retained. Callable-entry widening now restores
only a non-unknown string possibility set that is identical in the previous
and current entry. Changed or uncertain key sets retain generic widening.

## Mutation evidence

Four one-at-a-time source mutations were exercised and immediately removed:

1. replacing recursive stored-property transfer with unknown binding made the
   nested object-pattern harmful case return `[]`;
2. adding possible-global `require` to every transferred stored value made the
   nested object-pattern local inverse emit `zone_import`;
3. disabling exact stable-string restoration made the computed-key harmful
   case return `[]`; and
4. treating every readable stored property as possibly global made the
   computed-key local inverse emit `zone_import`.

The final source was restored before all verification below.

## Verification

The focused suite passed 57/57 in three fresh final-source processes:

```text
pnpm exec vitest run tests/architecture/fix16-gate.test.ts --reporter=dot
run 1: 57 passed, 12.98 s
run 2: 57 passed, 12.81 s
run 3: 57 passed, 12.83 s
```

The exact two round-8 pins and five round-6 regression groups passed 7/7 in
three fresh processes:

```text
run 1: 7 passed, 0.884 s
run 2: 7 passed, 0.806 s
run 3: 7 passed, 0.796 s
```

Three fresh full production scans returned the identical 379 findings: 143
`bare_catch`, 173 `throw_without_code`, 41 `void_promise`, 16
`wrapper_without_cause`, and 6 `zone_import`.

```text
run 1: 22.642 s
run 2: 22.678 s
run 3: 22.978 s
```

Every production scan remained below the frozen 30-second bound.

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
- `git diff --check` passed on the final tracked surface.

## Status boundary

This remains a C1 implementation milestone. A fresh independent Sol review is
required. C2 and V acceptance remain deferred.
