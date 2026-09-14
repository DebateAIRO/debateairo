# FIX-16 C1 Sol review — round 6 rework

Date: 2026-09-04

## Findings

### [P1] The callable execution bound skips the first harmful state after four safe nested calls

`tools/obs-inventory/src/scan.ts:2197-2211,2382-2392,2937-2944`

`executeCallable` returns a widened caller state as soon as a non-rejection
callable reaches `MAX_CALLABLE_EXECUTIONS` (four), before executing or scanning
the callable body. The first execution already placed the definition in
`analyzedCallables`, so the deferred pass later skips it. Widening therefore
does not make this bound fail closed: no candidate in the skipped body is
visited at all.

This fixed five-call probe returned `[]` in three unchanged runs:

```ts
declare const local: (path: string) => unknown;
function outer(): void {
  let load = local;
  const inner = () => load("apps/api/src/registration.ts");
  inner();
  inner();
  inner();
  inner();
  load = require;
  inner();
}
outer();
```

Moving `load = require` before the fourth call emitted the expected
`zone_import`, and leaving `load` local for all five calls returned `[]`. The
counterexample is thus a bounded call-state transfer error, not recursion,
unknown data, or an unbounded neighboring semantic. A new classified require
can pass the inventory when its first harmful nested-call state occurs after
four safe calls, so FIX-16-R04 inventory completeness remains unproved.

## Review basis

- Rework commit: `73f51a16dc708322da3e2d1872edbc2d8ead7011`
- Reviewed delta: `5f364191..73f51a16`
- Frozen authority read: `FIX-16/SPEC.md`, `FIX-16/DECISIONS.md`, and
  `FIX-16/PLAN.md`
- Prior review read: `FIX-16-C1-SOL-REVIEW-R6.md`
- Implementer report read: `FIX-16-C1-REWORK-R6-REPORT.md`

## Frozen-root validation

| Frozen root | Harmful result | Inverse/control result | Verdict |
|---|---|---|---|
| Stacked labelled `continue` routing | Direct and incrementor-neighbor probes emitted `zone_import` | Both safe forms returned `[]` | PASS |
| Aliased `for...of`, destructuring, and `for...in` | Array iteration/destructuring emitted `zone_import`; ordinary object key emitted `throw_without_code` | Local array aliases and `SAFE_CODE` object alias returned `[]` | PASS |
| Property assignment-valued `=`, `||=`, and `&&=` callees | All three property results emitted `zone_import` | Swapping each final result to the local callable returned `[]` | PASS |
| Nested closure call-state transfer | Exact prior harmful probe and a harmful fourth-call boundary emitted `zone_import` | Exact safe probe and five all-local calls returned `[]` | REWORK: harmful fifth call returned `[]` |
| Computed string index, `fill`, and indirect native push | Each classified mutation emitted `zone_import` | Each safe inverse returned `[]` | PASS |

The exact round-6 regression cases are closed on both sides. The sole review
finding is the finite boundary inside the already-frozen nested-closure root.

## Mutation evidence

Eight isolated one-at-a-time mutants were exercised in a detached temporary
copy and killed by direct harmful/inverse probes:

1. reject a stacked outer label at the loop transfer (killed by the incrementor
   neighbor, which distinguishes a routed back edge from unreachable scanning);
2. disable stored-array transfer for aliased `for...of` and destructuring;
3. classify every known `for...in` key as unsafe (killed by `SAFE_CODE`);
4. discard stored property require identity in callee position;
5. suppress nested call-site execution;
6. reject canonical string-form array indices;
7. remove `fill` from the tracked mutation set; and
8. remove trusted `Array.prototype.push.call` recognition.

The temporary scanner was restored from its pristine copy and byte-compared
with the repository scanner. No repository source or test was changed during
mutation work.

## Verification evidence

The focused suite passed **50/50 in three consecutive unchanged runs**:

```text
pnpm exec vitest run tests/architecture/fix16-gate.test.ts --reporter=dot
run 1: 50 passed, 11.03 s
run 2: 50 passed, 10.88 s
run 3: 50 passed, 11.01 s
```

Three independent full production scans returned the identical **379-row**
inventory: 143 `bare_catch`, 173 `throw_without_code`, 41 `void_promise`, 16
`wrapper_without_cause`, and 6 `zone_import` findings.

```text
run 1: 19.764 s scanner / 19.90 s wall
run 2: 19.930 s scanner / 20.06 s wall
run 3: 19.698 s scanner / 19.86 s wall
```

All three scans were below the frozen 30-second bound.

- `pnpm typecheck` reproduced exactly the pinned eight diagnostics, all in
  `tests/unit/s14-ui.test.ts`; no C1 diagnostic appeared.
- The `pnpm audit:source` wrapper could not create its sandboxed `tsx` IPC
  socket. `node --import tsx tools/orphan-audit/src/cli.ts source` reproduced
  exactly the pinned three obs-installer environment-read blockers and no C1
  blocker.
- The `pnpm audit:text-bytes` wrapper hit the same IPC restriction. The no-IPC
  equivalent passed with `REPOSITORY_TEXT_CONTROL_BYTES=0`.
- `git diff --check 5f364191..73f51a16` passed.
- Static searches found no filesystem API in `zone-check.ts`, no
  TODO/FIXME/mutant/debug marker in the changed scanner or focused test, and
  retained the TypeScript AST predicates and finite flow/call bounds.

## Scope

The reviewed commit changes only `tools/obs-inventory/src/scan.ts`,
`tests/architecture/fix16-gate.test.ts`, and the round-6 implementer report.
It does not change frozen FIX-16 authority, product source, a baseline,
`zone-check.ts`, CLI/package wiring, `tools/orphan-audit/**`, C2, or V surface.
Pre-existing untracked Sol reports were preserved. This report is the only
repository write made by this review.

## SPEC verdict

**REWORK.** Four frozen roots and every exact round-6 case pass, but the nested
closure root has a finite, reproducible false negative at the scanner's own
execution bound. Because the fifth harmful call can pass without a
`zone_import`, FIX-16-R04 is not yet established.

## CODE QUALITY verdict

**REWORK.** The new heap transfers are bounded and the exact inverse controls
remain clean, but the callable bound widens only the caller state while
permanently suppressing candidate-body inspection. A safety scanner must make
that transition conservatively visible instead of silently dropping the
inventory-bearing body.

## Status boundary

This is a Sol review of FIX-16 C1 round-6 rework only. It makes no product,
specification, baseline, C2, V-acceptance, merge, board, or Done change or
claim.
