# FIX-16 C1 final Sol review — round-8 correction

Date: 2026-09-04

## Findings

### [P1] Object-destructured call arguments are still bound as unknown

`tools/obs-inventory/src/scan.ts:1632-1702,2386-2409`

The correction now calls `bindCallableState` before nested-entry subsumption,
but that helper delegates to `updatePattern`. `updatePattern` transfers
identifier and array bindings; an ordinary object binding falls through to
`bindUnknown` unless it is the narrow `TypedDomainError` namespace special
case. The formal `load` therefore never receives the argument object's stored
`require` value. The memoized entry and the body both see a non-global callee.

This bounded argument variant returned `[]` in three unchanged runs:

```ts
declare const local: (path: string) => unknown;
function outer(): void {
  const inner = ({ load }: { load: (path: string) => unknown }) =>
    load("apps/api/src/registration.ts");
  inner({ load: local });
  inner({ load: local });
  inner({ load: local });
  inner({ load: local });
  inner({ load: require });
}
outer();
```

The five-local inverse returned `[]`. Direct identifier parameters, a default
`require` argument after four local calls, and the harmful-first order all
emitted the expected single `zone_import`. This is a reproducible formal
binding gap at the corrected entry-state boundary, not a new syntax domain.

### [P1] Saturation drops a global require held in a captured property

`tools/obs-inventory/src/scan.ts:640-692,1354-1374,1496-1514,2431-2447`

`widenCallableEntry` restores stable values only in the binding-level
`requires` map. A callable may instead obtain its callee through a tracked
object property. At the fifth distinct entry, `widenState` marks the object
reference/value state unknown; `storedPropertyOf` then returns `null`, and
`requireOf` defaults that property callee to `REQUIRE_LOCAL`. A concrete
global property assignment is therefore erased rather than reported.

This harmful probe returned `[]` in three unchanged runs:

```ts
declare const local: (path: string) => unknown;
function outer(): void {
  const holder = { load: local };
  let marker = "SAFE_A";
  const inner = () => { marker; holder.load("apps/api/src/registration.ts"); };
  inner();
  marker = "SAFE_B"; inner();
  marker = "SAFE_C"; inner();
  marker = "SAFE_D"; inner();
  marker = "SAFE_E"; holder.load = require; inner();
}
outer();
```

Keeping the final property local returned `[]`. The correction's direct
captured-binding pair passes, including a harmful sixth call after safe
saturation. The remaining miss is the same bounded cap/binding mechanism with
the callee stored in the property domain.

## Review basis

- Correction commit: `873c81c84ad12e0381f8e0634841903c55e60407`
- Reviewed delta: `b624a6a4..873c81c8`
- Frozen authority read: `FIX-16/SPEC.md`, `FIX-16/PLAN.md`, and
  `FIX-16/DECISIONS.md`
- Prior Sol report read: `FIX-16-C1-SOL-REVIEW-R8.md`
- Implementer report read: `FIX-16-C1-REWORK-R8-REPORT.md`
- Hermes was not used.

## Round-8 root validation

Twenty-eight bounded direct probes were run three times. Twenty-six matched in
every run; the same two binding misses above reproduced in all three.

| Boundary | Harmful result | Inverse/control result | Verdict |
|---|---|---|---|
| Exact direct parameter after four local calls | one `zone_import` | five local calls returned `[]` | PASS |
| Argument order and default | harmful-first and missing/default-`require` emitted | local controls stayed clean | PASS |
| Object-destructured parameter | returned `[]` | five-local inverse returned `[]` | REWORK |
| Other parameter domains | later uncoded throw and unrelated caught-error cause emitted | coded/caught inverses stayed clean | PASS |
| Exact distinct captured-state saturation | later global emitted once | all-local inverse returned `[]` | PASS |
| Post-cap order | a harmful sixth state after safe saturation emitted once | repeated state did not consume the cap | PASS |
| Recursive candidate call | harmful parameter emitted once and terminated | recursive all-local inverse returned `[]` | PASS |
| Captured property at saturation | later global property returned `[]` | all-local property inverse returned `[]` | REWORK |

The findings are frozen to those two reproducible entry-binding forms. No
unbounded adjacent callable or syntax review was opened.

## Round-6 regression

The prior five R6 roots were rechecked only as exact regression pairs:

1. stacked-label loop transfer;
2. aliased collection binding;
3. property assignment-valued callee;
4. nested captured call-state transfer; and
5. exact manifest-array index mutation.

Every harmful representative emitted its expected finding and every inverse
returned `[]` in all three direct-probe runs. No regression was found in those
five groups.

## Mutation evidence

Two one-at-a-time scanner mutants were exercised in isolated temporary copies:

1. restoring pre-binding nested-entry comparison made the exact four-local,
   then-global parameter probe return `[]`; and
2. replacing `widenCallableEntry` with generic `widenState` made the exact
   all-local saturation inverse emit a false `zone_import`.

Both mutants were killed by the direct boundary probes. Repository source and
tests were not edited for mutation work.

## Verification evidence

The committed focused suite passed **53/53 in three fresh processes**:

```text
pnpm exec vitest run tests/architecture/fix16-gate.test.ts --reporter=dot
run 1: 53 passed, 12.53 s
run 2: 53 passed, 12.44 s
run 3: 53 passed, 12.49 s
```

Three fresh full production scans returned the identical **379 findings**:
143 `bare_catch`, 173 `throw_without_code`, 41 `void_promise`, 16
`wrapper_without_cause`, and 6 `zone_import`.

```text
run 1: 26.001 s
run 2: 24.561 s
run 3: 24.365 s
```

All three remained below the frozen 30-second bound and retained an identical
inventory distribution.

- `pnpm typecheck` reproduced exactly the pinned eight diagnostics, all in
  `tests/unit/s14-ui.test.ts`; there was no C1 diagnostic.
- `node --import tsx tools/orphan-audit/src/cli.ts source` reproduced exactly
  the pinned three obs-capture installer environment-read blockers and no C1
  blocker.
- `REPOSITORY_TEXT_CONTROL_BYTES=0 node --import tsx
  tools/check-text-control-bytes.ts` passed.
- `git diff --check b624a6a4..873c81c8` passed.
- Static inspection retained TypeScript AST predicates for catch, throw, void,
  wrapper, callable, and import semantics; retained finite flow, iteration,
  callable, file, byte, node, and candidate bounds; found no filesystem API in
  `zone-check.ts`; and found no TODO, FIXME, mutant, suppression, or debug
  marker in the changed C1 source/test or implementer report.

## Scope

The reviewed commit changes only `tools/obs-inventory/src/scan.ts`,
`tests/architecture/fix16-gate.test.ts`, and the round-8 implementer report.
It does not change frozen FIX-16 authority, product source, a baseline,
`zone-check.ts`, CLI/package wiring, `tools/orphan-audit/**`, C2, or V surface.
Pre-existing untracked Sol reports were preserved. This report is the only
repository write made by this review.

## SPEC verdict

**REWORK.** The two exact R8 examples, bounded recursion/order controls, the
five R6 regressions, and the production bound pass. However, an ordinary
object-destructured global `require` argument and a global callee stored in a
captured property at saturation both escape the inventory. FIX-16-R01 and
FIX-16-R04 are therefore not established.

## CODE QUALITY verdict

**REWORK.** Moving parameter binding before subsumption is correct for the
domains `updatePattern` actually transfers, and the direct-require
preservation kills the reported overreach. The abstraction is still
representation-sensitive: object destructuring is bound as unknown, while
cap widening preserves direct require bindings but discards equivalent stored
property bindings. The focused tests pin only the direct-identifier forms and
do not distinguish these two failures.

## Status boundary

This is a final Sol review of the FIX-16 C1 round-8 correction only. It makes
no product, specification, baseline, C2, V-acceptance, merge, board, or Done
change or claim.
