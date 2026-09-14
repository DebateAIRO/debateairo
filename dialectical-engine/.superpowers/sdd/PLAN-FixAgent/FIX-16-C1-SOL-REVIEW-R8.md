# FIX-16 C1 Sol review — round 7 correction

Date: 2026-09-04

## Findings

### [P1] Entry-state subsumption ignores call arguments and drops a later harmful binding

`tools/obs-inventory/src/scan.ts:2197-2211,2397-2400,2418-2432`

The new memo key is made from the caller `FlowState` before the callable's
parameters are bound. When only an argument changes, `statesEqual` therefore
returns true and exits before `updatePattern` can make that argument visible to
the candidate body. The first safe execution has already put the definition in
`analyzedCallables`, so deferred analysis does not recover the skipped state.

This fixed probe returned `[]` in three unchanged runs:

```ts
declare const local: (path: string) => unknown;
function outer(): void {
  const inner = (load: (path: string) => unknown) =>
    load("apps/api/src/registration.ts");
  inner(local);
  inner(local);
  inner(local);
  inner(local);
  inner(require);
}
outer();
```

The five-local inverse also returned `[]`. Adjacent argument-only transitions
reproduced the same miss for a coded error followed by an uncoded error passed
to `throw failure`, and for `caught` followed by an unrelated value passed as
the `cause` of a captured `TypedDomainError` constructor. This is the same
nested candidate-call binding boundary as the correction, not a new scanner
domain: the memoized entry excludes the formal bindings that determine the
candidate verdict. A later harmful parameter state can therefore pass the C1
inventory, leaving FIX-16-R01 and FIX-16-R04 unproved.

### [P1] Saturation turns a definitely local callee into global `require`

`tools/obs-inventory/src/scan.ts:640-680,2397-2409`

Distinctness and saturation operate on the whole caller state. After four
different non-classifying string states, the fifth call widens the joined state
with `widenState`, which changes every tracked local require binding to
`REQUIRE_GLOBAL | REQUIRE_LOCAL | REQUIRE_NULLISH`. The candidate body is then
scanned against that invented global possibility even though every concrete
call keeps the callee local.

This all-local probe emitted a false `zone_import` at line 5 in three unchanged
runs:

```ts
declare const local: (path: string) => unknown;
function outer(): void {
  let load = local;
  let marker = "SAFE_A";
  const inner = () => { marker; load("apps/api/src/registration.ts"); };
  inner();
  marker = "SAFE_B"; inner();
  marker = "SAFE_C"; inner();
  marker = "SAFE_D"; inner();
  marker = "SAFE_E"; load = local; inner();
}
outer();
```

Changing only the final `load = local` to `load = require` emitted the same
single finding. The saturation path therefore cannot distinguish the harmful
case from its exact safe inverse. Because this inventory drives the new-entry
build gate, the overreach can fail a build for a source construct that does not
contain a global require import, contrary to FIX-16-R01/R02.

## Review basis

- Correction commit: `b624a6a41951c6ad7adb40d43f48ec1a15fa83a9`
- Reviewed delta: `73f51a16..b624a6a4`
- Frozen authority read: `FIX-16/SPEC.md`, `FIX-16/PLAN.md`, and
  `FIX-16/DECISIONS.md`
- Prior Sol report read: `FIX-16-C1-SOL-REVIEW-R7.md`
- Implementer report read: `FIX-16-C1-REWORK-R7-REPORT.md`

## Nested-call validation

Seventeen independent direct probes were run three times. Fifteen matched and
the same two mismatches above reproduced in every run.

| Boundary | Harmful result | Inverse/control result | Verdict |
|---|---|---|---|
| Exact captured fifth call after four identical safe calls | one `zone_import` | five all-local calls returned `[]` | PASS |
| Fifth argument-only harmful call after four safe calls | returned `[]` | five local arguments returned `[]` | REWORK |
| Joined distinct captured entry states | later global state emitted `zone_import` | ordinary repeated-state control stayed clean | PASS |
| Subsumption | eight identical safe calls did not consume the cap; later captured global state emitted | repeated all-local control stayed clean before saturation | PASS |
| Widened saturation at four distinct states | harmful fifth state emitted `zone_import` | all-local fifth state emitted the same false finding | REWORK |
| Recursive candidate call | direct harmful body emitted once and terminated | recursive all-local body returned `[]` | PASS |
| Looped candidate calls | later captured global state emitted once and terminated | looped all-local body returned `[]` | PASS |

The two failing pairs are exact binding failures in the new entry-state/cap
mechanism. No speculative callable or syntax root is opened by this review.

## Round-6 regression

The prior five groups were rechecked only as regression. Independent harmful
probes for stacked-label routing, aliased collection binding, property
assignment-valued callees, nested captured call-state transfer, and exact
manifest-array index mutation all emitted their expected finding. Their safe
neighbors remain covered by the unchanged focused suite. No regression was
found in those five groups.

## Mutation evidence

Two isolated scanner mutants were exercised in a temporary copy and killed by
the direct boundary probes:

1. disabling the new entry-state subsumption made the exact repeated all-local
   control reach saturation and emit the forbidden `zone_import`; and
2. restoring an immediate return at the distinct-state execution cap made the
   fifth harmful saturation probe return `[]`.

The temporary scanner was restored and byte-compared with the repository
scanner at SHA-256
`46895466affe3c75adeb7bf6b7048211e57f109265b90c9ba88b46c6e02ee299`,
then the temporary copy and probe script were removed. No repository source or
test was changed during mutation work. The harmful/local source pairs above
also distinguish false-negative behavior from overreach rather than accepting
an unconditional report.

## Verification evidence

The committed focused suite passed **51/51 in three consecutive unchanged
runs**:

```text
pnpm exec vitest run tests/architecture/fix16-gate.test.ts --reporter=dot
run 1: 51 passed, 10.91 s
run 2: 51 passed, 10.87 s
run 3: 51 passed, 10.93 s
```

Three separate full production-scan processes returned the identical **379
rows**: 143 `bare_catch`, 173 `throw_without_code`, 41 `void_promise`, 16
`wrapper_without_cause`, and 6 `zone_import` findings.

```text
run 1: 19.814 s
run 2: 20.304 s
run 3: 20.188 s
```

Every run remained below the frozen 30-second bound, with no material timing or
inventory-distribution regression.

- `pnpm typecheck` reproduced exactly the pinned eight diagnostics, all in
  `tests/unit/s14-ui.test.ts`; no C1 diagnostic appeared.
- `node --import tsx tools/orphan-audit/src/cli.ts source` reproduced exactly
  the pinned three obs-installer environment-read blockers and no C1 blocker.
- `REPOSITORY_TEXT_CONTROL_BYTES=0 node --import tsx
  tools/check-text-control-bytes.ts` passed.
- `git diff --check 73f51a16..b624a6a4` passed.
- Static searches retained TypeScript AST predicates for catch, throw, void,
  wrapper, and callable semantics; retained finite flow, iteration, and
  callable bounds; found no filesystem API in `zone-check.ts`; and found no
  TODO, FIXME, debug, mutant, suppression, or console marker in the changed C1
  source/test.

## Scope

The reviewed commit changes only `tools/obs-inventory/src/scan.ts`,
`tests/architecture/fix16-gate.test.ts`, and the round-7 implementer report.
It does not change frozen FIX-16 authority, product source, a baseline,
`zone-check.ts`, CLI/package wiring, `tools/orphan-audit/**`, C2, or V surface.
Pre-existing untracked Sol reports were preserved. This report is the only
repository write made by this review.

## SPEC verdict

**REWORK.** The exact captured-variable regression and bounded production scan
pass, but argument-only harmful states are suppressed and a distinct-state
all-local inverse is reported as a zone import. FIX-16-R01/R02/R04 are not yet
established.

## CODE QUALITY verdict

**REWORK.** The joined-state mechanism is finite and closes the exact reported
example, but its memo key omits formal-argument bindings and its saturation
widening promotes unrelated safe caller-state variation into inventory-bearing
values. Both defects are deterministic at the new abstraction boundary.

## Status boundary

This is a Sol review of the FIX-16 C1 round-7 correction only. It makes no
product, specification, baseline, C2, V-acceptance, merge, board, or Done
change or claim.
