# FIX-16 C1 final Sol review — round-10 correction

Date: 2026-09-04

## Findings

None in the frozen round-10 scope.

## Review basis

- Correction commit: `08eff965bb1231c6336133c5867826aaaae79347`
- Reviewed delta: `972eaee9..08eff965`
- Frozen authority read: `FIX-16/SPEC.md`, `FIX-16/PLAN.md`, and
  `FIX-16/DECISIONS.md`
- Prior Sol report read: `FIX-16-C1-SOL-REVIEW-R10.md`
- Implementer report read: `FIX-16-C1-REWORK-R10-REPORT.md`
- Hermes was not used.

## Frozen-root validation

Twenty-three harmful, inverse, and control probes were run in three fresh
processes. Every process passed 23/23 with identical outcomes.

| Frozen root | Exact correction | Bounded variants | Verdict |
|---|---|---|---|
| Nested object destructuring preserves a stored global `require` | A fifth global value after four local values emitted exactly one `zone_import`; the all-local inverse returned `[]` | A deeper renamed binding through an aliased argument object, nested object-to-array binding, harmful-first order, a harmful sixth call after five distinct safe entry states, and recursive nested-object parameter transfer all emitted exactly once; each local-only inverse returned `[]` | PASS |
| Saturation preserves a stable computed key used to access a global callee in a captured object | A fifth entry with `holder.load = require` and stable key `"load"` emitted exactly one `zone_import`; the all-local inverse returned `[]` | A stable key alias, harmful-first order, a harmful sixth state after safe saturation, and recursive captured-object access all emitted exactly once; their local-only inverses returned `[]`. A changed-key saturation control with global `holder.load` but runtime-local `holder.safe` returned `[]` | PASS |

The probes stayed within the two frozen representation roots. Missing/default
properties, uncertain computed keys, rest bindings, and other unbounded
JavaScript semantics were not opened as review surface.

## Exact regression

The exact round-9 pins, exact round-8 pins, and prior five round-6 groups were
selected by test name and passed **9/9 in three fresh processes**:

```text
run 1: 9 passed, 48 skipped, 0.969 s
run 2: 9 passed, 48 skipped, 0.962 s
run 3: 9 passed, 48 skipped, 0.952 s
```

The selection was limited to direct object-argument transfer, direct captured
property saturation, argument binding before entry comparison, local-callee
saturation, stacked-label loop transfer, aliased collection binding, property
assignment-valued callee flow, nested captured call-state transfer, and exact
manifest-array index/mutation behavior.

## Mutation evidence

Four one-at-a-time scanner mutants were exercised in an isolated temporary
copy:

1. replacing stored object references with unknown references made the exact
   nested harmful probe return `[]`;
2. adding possible-global `require` to every transferred stored value made the
   exact nested local-only inverse emit `zone_import`;
3. disabling stable-string restoration in callable-entry widening made the
   exact computed-key harmful probe return `[]`; and
4. restoring the prior key even when the current key changed made the
   changed-key safe control emit `zone_import`.

The temporary scanner was restored and byte-compared with the repository
scanner at SHA-256
`a10fa89b3a3965cf4936c2a4602967c6c5e281979e206414d7a5ada2b7b1cdc9`.
The restored copy passed all 23 probes and the temporary tree was removed.
The repository scanner and tests were not edited for mutation work.

## Verification evidence

The complete focused suite passed **57/57 in three fresh processes**:

```text
pnpm exec vitest run tests/architecture/fix16-gate.test.ts --reporter=dot
run 1: 57 passed, 12.82 s
run 2: 57 passed, 12.72 s
run 3: 57 passed, 12.81 s
```

Three fresh full production scans returned the identical **379 findings**:
143 `bare_catch`, 173 `throw_without_code`, 41 `void_promise`, 16
`wrapper_without_cause`, and 6 `zone_import`.

```text
run 1: 22.91 s
run 2: 22.72 s
run 3: 22.73 s
```

Every production scan remained below the frozen 30-second bound.

- `pnpm typecheck` reproduced exactly the pinned eight diagnostics, all in
  `tests/unit/s14-ui.test.ts`; there was no C1 diagnostic.
- `node --import tsx tools/orphan-audit/src/cli.ts source` reproduced exactly
  the pinned three obs-capture installer environment-read blockers and no C1
  blocker.
- `REPOSITORY_TEXT_CONTROL_BYTES=0 node --import tsx
  tools/check-text-control-bytes.ts` passed.
- `git diff --check 972eaee9..HEAD` passed.
- Static inspection retained TypeScript AST predicates for catch, throw, void,
  wrapper, callable, and import semantics; retained finite flow, iteration,
  callable, file, byte, node, and candidate bounds; found no filesystem API in
  `zone-check.ts`; and found no TODO, FIXME, mutation, suppression, or debug
  marker in the changed C1 source/test.

## Code-quality assessment

`StoredValue` now carries bounded object identity through clone, union, and
state equality, and recursive pattern transfer consumes that identity only
while every referenced aggregate remains exact. Unknown, missing, uncertain,
or rest values still fall back to unknown binding. Callable widening restores
a captured string domain only when the previous and current domains are both
finite and exactly equal; the changed-key control and overreach mutant confirm
that this is not an unconditional preservation rule. The implementation
retains the existing recursion, execution, alternative, iteration, and scan
caps.

## Scope

The correction changes only `tools/obs-inventory/src/scan.ts`,
`tests/architecture/fix16-gate.test.ts`, and the round-10 implementer report.
It does not change frozen FIX-16 authority, product source, a baseline,
`zone-check.ts`, CLI/package wiring, `tools/orphan-audit/**`, C2, or V surface.
Pre-existing untracked Sol reports were preserved. This report is the only
repository write made by this review.

## SPEC verdict

**PASS for the FIX-16 C1 round-10 correction milestone.** The two frozen
binding roots, safe inverses, bounded order/cap/recursion variants, exact
historical regression, deterministic inventory, and R06 bound all pass. No
reproducible issue remains against FIX-16-R01, R02, or R04 within this review's
frozen scope.

## CODE QUALITY verdict

**PASS.** The correction preserves only exact tracked identities and unchanged
finite string domains, propagates both through the state lattice, remains
bounded, and is distinguished by harmful, inverse, omission-mutant, and
overreach-mutant evidence.

## Status boundary

This is a final Sol review of the FIX-16 C1 round-10 correction only. It makes
no product, specification, baseline, C2, V-acceptance, merge, board, or Done
change or claim.
