# FIX-16 C1 Sol review — round 4 rework

Date: 2026-09-04

Rework commit: `5ebeb2b40675f66e2459d1aa4173c0623b4cdb98`

Reviewed delta: `c6057c5490edf416708c64d50886edac67de06e2..5ebeb2b40675f66e2459d1aa4173c0623b4cdb98`

## Findings

### [P1] Labelled loop completions and the iteration cap still lose reachable states

`tools/obs-inventory/src/scan.ts:1541-1604,1766-1816`

The statement interpreter consumes only unlabelled `continue` at a loop back
edge. The enclosing `LabeledStatement` converts a matching labelled `break`,
but never routes a matching labelled `continue` back into its target loop. A
finite, reachable global loader therefore disappeared:

```ts
declare const local: (path: string) => unknown;
let load = local;
outer: for (let i = 0; i < 2; i += 1) {
  load = require;
  continue outer;
}
load("apps/api/src/registration.ts");
```

`scanSource` returned `[]`. A nested labelled-`break` control did emit
`zone_import`, so this is the `continue` routing, not label resolution in
general.

The 64-iteration cap is also fail-open. At the cap, line 1599 widens `header`,
but only the pre-body states accumulated in `exitState` and `breaks` are
returned. The widened state is never joined into any emitted completion. An
exact generated chain of 65 bindings (`r0 = r1; ...; r63 = r64`, with `r64 =
require`) returned `[]` for `r0(ZONE)` even though 64 iterations transfer the
global loader to `r0`. The same 65-binding probe returned `[]` for an ignoring
callback, an uncoded thrown value, a `TypedDomainError` constructor, and a
non-caught cause transferred to the first binding. The manifest-data neighbor
failed closed only because its distinct literal set overflowed the separate
32-alternative domain.

This leaves bounded but reachable R01/R04 violations out of the inventory and
means the claimed conservative widening is not applied to observable exits.

### [P1] Iteration and destructuring bindings do not receive their source values

`tools/obs-inventory/src/scan.ts:1099-1137,1795-1807`

`for...of` executes a declaration with no initializer once and then interprets
the body without assigning an element on any iteration. General destructuring
likewise calls `bindUnknown`; only the special kernel-namespace constructor
pattern receives a value. These ordinary programs both returned `[]`:

```ts
for (const load of [require]) {
  load("apps/api/src/registration.ts");
}
```

```ts
import { TypedDomainError as DomainError } from "@debateai/kernel";
for (const Wrapper of [DomainError]) {
  try { task(); } catch (caught) {
    new Wrapper("WRAP_FAILED", "fixed");
    void caught;
  }
}
```

The inverse `for (const root of [caught])` safe cause neighbor emitted
`wrapper_without_cause`. Array destructuring repeated the inversion: `[load] =
[require]` and `[Wrapper] = [DomainError]` missed their violations, while
`const [root] = [caught]` caused a lawful wrapper to be rejected. This is a
two-sided binding-transfer error, not merely a conservative unknown result.

### [P1] Logical assignments and assignment-valued callees erase the tracked value

`tools/obs-inventory/src/scan.ts:874-1016,1234-1246,1312-1355`

Only `??=` has short-circuit state semantics. Every other compound assignment
passes `undefined` to `updateIdentifier`, replacing all domains with their
fallback local/unsafe/unknown values after scanning the right side
unconditionally. Consequently all of these reachable zone loads returned
`[]`:

```ts
let load = require;
load ||= local; // require is truthy, so this does not assign
load("apps/api/src/registration.ts");
```

```ts
let load = local;
load &&= require; // local is a function and therefore truthy
load("apps/api/src/registration.ts");
```

```ts
let load = local;
(load = require)("apps/api/src/registration.ts");
```

The last case first updates `load`, but `requireOf` has no value rule for an
assignment expression and classifies the callee itself as local. Direct `??=`,
comma-form global require, and ternary assignment controls emitted the expected
findings.

The defect crosses the unified domains. `Wrapper ||= Local` from an initial
domain constructor and `Wrapper &&= DomainError` from a truthy local class both
missed `wrapper_without_cause`. Conversely, a consuming callback retained by
`||=` or installed by `&&=` emitted `void_promise`; a coded thrown value
retained by `||=` emitted `throw_without_code`; and a truthy safe manifest
array retained by `||=` emitted `zone_import`.

### [P1] Function bodies and rejection callbacks do not share the statement CFG semantics

`tools/obs-inventory/src/scan.ts:516-700,1477-1495,1530-1539`

Hoisted function declarations are analyzed before surrounding variable
declarations execute and are never revisited. Function expressions are
analyzed at creation rather than at any possible call state. Both of these
governed programs returned `[]`:

```ts
const load = require;
function run(): void {
  load("apps/api/src/registration.ts");
}
run();
```

```ts
let load = local;
const run = () => load("apps/api/src/registration.ts");
load = require;
run();
```

A constructor alias captured by a hoisted function also missed a cause-losing
wrapper. The inverse coded-throw closure was rejected because the same early
snapshot sees its binding as unsafe.

Rejection callbacks use a second, smaller control-flow walker rather than the
statement interpreter. An unhandled labelled statement falls through to a
whole-subtree binding search, so an unreachable use proves consumption:

```ts
void pending.catch((error: unknown) => {
  done: {
    break done;
    console.error(error);
  }
});
```

This returned `[]` although every completion ignores `error`. In the other
direction, `try { console.error(error); } catch (caught) { return; }` emitted
`void_promise`: the call's throwing completion has already observed `error`,
but the catch restarts from the pre-try boolean. A callback whose only use is a
switch case expression also false-positive because case expressions are not
visited by the callback walker. The committed direct/computed `catch` and
`then`, imported-unresolved callback, ordinary switch-body, and finally
controls retain their expected results; the divergence is inside callback-body
completion analysis.

### [P1] Cause and manifest mutations are recognized only through narrow spellings

`tools/obs-inventory/src/scan.ts:744-872,1219-1286,1383-1412`

Direct `delete`, direct `Object.assign`, binary property writes, and their
object-alias controls pass. Equivalent common mutations are outside the state
transfer. This cause-losing wrapper returned `[]`:

```ts
const options = { cause: caught };
Object["assign"](options, { cause: unrelated });
new DomainError("WRAP_FAILED", "fixed", options);
```

`applyObjectAssign` accepts only property-access spelling. Conversely,
`const options = Object.assign({}, { cause: caught })` emitted
`wrapper_without_cause` because the call result does not inherit the target
object identity.

Manifest data has no mutation transfer for array methods. Both of these
governed lookalikes returned `[]`:

```ts
const paths = ["packages/kernel/src/error.ts"];
paths.push("apps/api/src/registration.ts");
export const LOOKALIKE = { zone_path_prefixes: paths };
```

```ts
const LOOKALIKE = { zone_path_prefixes: ["packages/kernel/src/error.ts"] };
LOOKALIKE.zone_path_prefixes.push("apps/api/src/registration.ts");
export { LOOKALIKE };
```

The exact normalized manifest path still exempts classification data only;
a real static import from that exact file remained a `zone_import`.

## Round-4 finding validation

| R4 item | Exact result | Adjacent result |
|---|---|---|
| Structured completion CFG, fixed-point loops, switch, try/catch/finally, abrupt paths | PASS for committed unlabelled finite loops, fallthrough/order, exceptional joins, return/break/continue/finally cases | REWORK: labelled continue and the 64-iteration exit widening fail open |
| Callback body/computed/unresolved | PASS for committed direct/computed members, imported-unresolved callbacks, basic every-path bodies | REWORK: labelled blocks miss ignoring callbacks; catch state and case-expression uses reject consuming callbacks |
| Caught alias under shadow | PASS for the exact alias-preserving shadow and inverse no-alias neighbor | REWORK through for-of/destructuring/cap transfers, not ordinary name shadow |
| `delete` / `Object.assign` | PASS for direct spellings, aliases, overwrite and restore | REWORK for computed `Object["assign"]` and the returned target identity |
| Mutable throw/constructor aliases | PASS for direct `=` and direct joins | REWORK through cap, logical assignment, binding transfer and closures |
| `??=` / comma / global require | PASS for exact `??=`, comma, conditional and lexical-shadow controls | REWORK for `||=`, `&&=`, assignment-valued calls, iteration bindings and closures |
| Manifest property mutation / exact exemption | PASS for direct and exact-computed `=` plus normalized exact exemption | REWORK for array/property method mutation and safe logical assignment |

## Earlier-semantics and boundary recheck

- Promise/PromiseLike operands, synchronous calls, explicit `any`, direct and
  computed `catch`/`then`, `finally`, arbitrary identifier/property throws,
  caught rethrows, coded values, exact mutable `=` aliases, and foreign wrapper
  imports matched the committed expectations. The callback/body cases above
  did not.
- Static imports/re-exports, dynamic imports, import-equals declarations,
  `import(...)`, `typeof import(...)`, source-extension equivalence, path
  traversal/separator normalization, and all three governed importer trees
  matched the expected zone classifications.
- The source-symlink test passed in each focused run and did not read its
  classified target. A fresh full-tree injected-filesystem scan returned the
  same 379 findings through 364 operations and recorded zero operations
  addressed to a classified zone path.
- Fresh independent guards produced `OBS_INVENTORY_PATH_ESCAPE`,
  `OBS_INVENTORY_LIMIT_INVALID`, `OBS_INVENTORY_FILE_LIMIT`,
  `OBS_INVENTORY_FILE_SIZE_LIMIT`, `OBS_INVENTORY_NODE_LIMIT`,
  `OBS_INVENTORY_CANDIDATE_LIMIT`, and `OBS_INVENTORY_PARSE_FAILED`.
- Direct conditional, nested-loop labelled break, do/finally override, exact
  manifest exemption, lexical shadow, and unknown-value neighbors did not add
  another root cause beyond the five findings above.

## Verification evidence

- `pnpm vitest run tests/architecture/fix16-gate.test.ts --reporter=dot`
  passed **40/40 in three independent fresh runs**: 3.28 s, 3.28 s, and
  3.30 s. The worst run is green.
- Full production scan: **379 rows in 20,327 ms** — 143 `bare_catch`, 173
  `throw_without_code`, 41 `void_promise`, 16 `wrapper_without_cause`, and 6
  `zone_import`; below the 30,000 ms seed.
- Four isolated one-at-a-time mutants were killed by the focused suite:
  one-iteration flow (39/40), removed exact manifest exemption (38/40),
  disabled direct `Object.assign` transfer (39/40), and disabled special
  `??=` flow (39/40). The detached copy was restored to 40/40 and removed.
- `pnpm typecheck` reproduced exactly the pinned eight diagnostics, all in
  `tests/unit/s14-ui.test.ts`; no C1 diagnostic appeared.
- `pnpm audit:source` reproduced exactly the pinned three obs-installer
  environment-read blockers. `pnpm audit:text-bytes` passed with
  `REPOSITORY_TEXT_CONTROL_BYTES=0`.
- `git diff --check c6057c54..5ebeb2b4` passed. Static searches found no
  filesystem API in `zone-check.ts`, no TODO/FIXME/mutation marker or stale
  collector in the C1 source/test delta, and no residual mutant checkout.

## Scope

The reviewed delta changes only the two C1 scanner sources, the focused FIX-16
architecture test, one existing scanner fixture, and the round-4 implementer
report. It does not change a baseline, CLI/index, package manifest, product
source, frozen FIX-16 artifact, `tools/orphan-audit/**`, or C2 surface. The
pre-existing Sol reports remain untracked; this R5 report is the only review
write.

## SPEC verdict

**REWORK.** The exact R4 regression groups and finite importer-only filesystem
property pass, but ordinary labelled, binding, logical-assignment, closure,
callback-completion, object-mutation, and cap-bound paths still admit reachable
R01/R04 violations. Both false negatives and inverse false positives were
reproduced against the shipped `scanSource`.

## CODE QUALITY verdict

**REWORK.** A single statement-level completion structure now covers the
direct committed cases, but callback bodies still use a separate CFG model,
function bodies use snapshots rather than callable flow, several binding and
mutation transfers are absent, and the finite-loop widening is disconnected
from returned completions. Those architectural seams account directly for all
confirmed findings.

## Status boundary

This is a Sol review of FIX-16 C1 round-4 rework only. It makes no baseline,
C2, merge, board, Done, or V-acceptance claim.
