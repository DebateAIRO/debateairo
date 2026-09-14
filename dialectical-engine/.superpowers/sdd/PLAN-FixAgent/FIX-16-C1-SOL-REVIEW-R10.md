# FIX-16 C1 final Sol review — round-9 correction

Date: 2026-09-04

## Findings

### [P1] A nested object binding still discards the argument's stored require value

`tools/obs-inventory/src/scan.ts:128-132,1609-1620,1716-1739,2442-2465`

The new object-pattern branch transfers a stored property only when the
binding element's `name` is an identifier. A one-level nested object binding
is sent to `bindUnknown`; moreover, `StoredValue` has no object-reference
field from which the inner object could be recovered. The nested formal
therefore receives `REQUIRE_NULLISH` instead of the argument's stored global
`require`, before callable-entry comparison or body execution.

This bounded variation of the frozen object-argument root returned `[]` in
three fresh unchanged runs:

```ts
declare const local: (path: string) => unknown;
function outer(): void {
  const inner = ({ holder: { load } }: {
    holder: { load: (path: string) => unknown };
  }) => load("apps/api/src/registration.ts");
  inner({ holder: { load: local } });
  inner({ holder: { load: local } });
  inner({ holder: { load: local } });
  inner({ holder: { load: local } });
  inner({ holder: { load: require } });
}
outer();
```

Changing the fifth stored property to `local` also returned `[]`. Exact
one-level shorthand, renamed string, computed-key, and aliased-object
parameters all emitted one `zone_import` for their harmful form and returned
`[]` for their local-only inverse. The failure is thus frozen to the nested
binding transfer, not to general callable or object syntax.

### [P1] Saturation widens away a stable computed property key

`tools/obs-inventory/src/scan.ts:640-710,1372-1392,1505-1531,2468-2503`

`widenCallableEntry` now restores a stable captured object reference and its
exact joined stored properties after generic widening, but it does not restore
the stable string binding used to select that property. `widenState` marks the
captured key unknown. `accessNames` therefore returns an unknown name,
`storedPropertyOf` returns `null`, and `requireOf` defaults the callee to
`REQUIRE_LOCAL`, even though the preserved object contains the global
`require` at the exact key.

This fixed harmful probe returned `[]` in three fresh unchanged runs:

```ts
declare const local: (path: string) => unknown;
function outer(): void {
  const holder = { load: local };
  const key = "load";
  let marker = "SAFE_A";
  const inner = () => {
    marker;
    holder[key]("apps/api/src/registration.ts");
  };
  inner();
  marker = "SAFE_B"; inner();
  marker = "SAFE_C"; inner();
  marker = "SAFE_D"; inner();
  marker = "SAFE_E"; holder.load = require; inner();
}
outer();
```

Keeping the final stored property local returned `[]`. Direct dot access,
string-literal element access, a stable alias of the same object, a harmful
sixth call after safe saturation, harmful-first order, and recursive
object-parameter execution all emitted exactly once in their harmful form and
stayed clean in their local-only inverse. The miss is the stable computed-key
form of the same captured-property saturation root.

## Review basis

- Correction commit: `972eaee9374182ddf7f0e518bf92e8f0f47c7fd1`
- Reviewed delta: `873c81c8..972eaee9`
- Frozen authority read: `FIX-16/SPEC.md`, `FIX-16/PLAN.md`, and
  `FIX-16/DECISIONS.md`
- Prior Sol report read: `FIX-16-C1-SOL-REVIEW-R9.md`
- Implementer report read: `FIX-16-C1-REWORK-R9-REPORT.md`
- Hermes was not used.

## Round-9 root validation

Twenty-eight bounded harmful/inverse probes were run in three fresh processes;
the outcomes were identical in all three runs.

| Boundary | Harmful result | Inverse/control result | Verdict |
|---|---|---|---|
| Exact object-destructured argument at the fifth call | one `zone_import` | five local stored values returned `[]` | PASS |
| Renamed string and computed object bindings | one `zone_import` each | local-only forms returned `[]` | PASS |
| Aliased stored argument object | one `zone_import` | local-only form returned `[]` | PASS |
| One-level nested object binding | returned `[]` | local-only form returned `[]` | REWORK |
| Exact captured property at saturation | one `zone_import` | all-local property returned `[]` | PASS |
| Literal element access and stable object alias | one `zone_import` each | local-only forms returned `[]` | PASS |
| Stable computed property key at saturation | returned `[]` | all-local property returned `[]` | REWORK |
| Post-cap sixth call and harmful-first order | one `zone_import` each | local-only forms returned `[]` | PASS |
| Recursive object-parameter call | one `zone_import` and termination | recursive local inverse returned `[]` | PASS |

Defaulted missing properties and captured-object rebinding were observed only
as scope controls. They were not opened as independent findings because they
expand beyond the frozen stored-argument and stable-object roots. The two
findings above need no such expansion.

## Exact prior regression

The exact two round-8 pins and the prior five round-6 groups were selected by
test name and passed **7/7 in three fresh processes**:

```text
run 1: 7 passed, 48 skipped, 0.927 s
run 2: 7 passed, 48 skipped, 0.862 s
run 3: 7 passed, 48 skipped, 0.844 s
```

The five round-6 groups were limited to stacked-label loop transfer, aliased
collection binding, property assignment-valued callee, nested captured
call-state transfer, and exact manifest-array index/mutation behavior. Their
harmful and inverse expectations all remained green. No adjacent historical
language surface was reopened.

## Mutation evidence

Four one-at-a-time scanner mutants were exercised in isolated temporary
copies, with repository source and tests left untouched:

1. disabling the new stored-object binding branch made the exact harmful
   object-parameter probe return `[]`;
2. adding possible-global `require` to every transferred object property made
   its exact local-only inverse emit `zone_import`;
3. disabling stable object preservation in callable widening made the exact
   harmful captured-property probe return `[]`; and
4. adding possible-global `require` to every preserved property made its exact
   local-only inverse emit `zone_import`.

Thus the exact committed pairs kill both omission and overreach mutations for
the code added in this correction. The independent nested-binding and
computed-key pairs expose representation seams those exact tests do not kill.

## Verification evidence

The complete committed focused suite passed **55/55 in three fresh
processes**:

```text
pnpm exec vitest run tests/architecture/fix16-gate.test.ts --reporter=dot
run 1: 55 passed, 11.33 s
run 2: 55 passed, 11.14 s
run 3: 55 passed, 11.16 s
```

Three fresh full production scans returned the identical **379 findings**:
143 `bare_catch`, 173 `throw_without_code`, 41 `void_promise`, 16
`wrapper_without_cause`, and 6 `zone_import`.

```text
run 1: 21.064 s
run 2: 20.206 s
run 3: 20.101 s
```

Every run remained below the frozen 30-second bound.

- `pnpm typecheck` reproduced exactly the pinned eight diagnostics, all in
  `tests/unit/s14-ui.test.ts`; there was no C1 diagnostic.
- `node --import tsx tools/orphan-audit/src/cli.ts source` reproduced exactly
  the pinned three obs-capture installer environment-read blockers and no C1
  blocker.
- `REPOSITORY_TEXT_CONTROL_BYTES=0 node --import tsx
  tools/check-text-control-bytes.ts` passed.
- `git diff --check 873c81c8..HEAD` passed.
- Static inspection retained TypeScript AST predicates for catch, throw, void,
  wrapper, callable, and import semantics; retained finite flow, iteration,
  callable, file, byte, node, and candidate bounds; found no filesystem API in
  `zone-check.ts`; and found no TODO, FIXME, mutation, suppression, or debug
  marker in the changed C1 source/test.

## Scope

The reviewed commit changes only `tools/obs-inventory/src/scan.ts`,
`tests/architecture/fix16-gate.test.ts`, and the round-9 implementer report. It
does not change frozen FIX-16 authority, product source, a baseline,
`zone-check.ts`, CLI/package wiring, `tools/orphan-audit/**`, C2, or V surface.
Pre-existing untracked Sol reports were preserved. This report is the only
repository write made by this review.

## SPEC verdict

**REWORK.** The exact round-9 examples, safe inverses, cap/order/recursion
controls, exact historical regression, and production bound pass. However, a
global `require` stored under a one-level nested object binding and a global
captured property selected through a stable computed key both escape the
inventory. FIX-16-R01 and FIX-16-R04 are therefore not established.

## CODE QUALITY verdict

**REWORK.** The correction is finite and kills both harmful and overreach
mutants for its exact direct forms, but the abstraction is still
representation-sensitive. Stored values cannot retain inner object identity
for recursive pattern binding, and callable widening preserves the object
without preserving the exact key needed to read it. The committed tests pin
only direct one-level bindings and direct property names, so neither failure
is distinguished.

## Status boundary

This is a final Sol review of the FIX-16 C1 round-9 correction only. It makes
no product, specification, baseline, C2, V-acceptance, merge, board, or Done
change or claim.
