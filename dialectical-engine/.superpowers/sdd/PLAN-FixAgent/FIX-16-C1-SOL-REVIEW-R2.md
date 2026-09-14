# FIX-16 C1 Sol review — round 2

Date: 2026-09-04

Rework commit: `6df9ff6c59bab170c3ad713cb9e0a303587c7292`

Reviewed delta: `da0a2ddd21db29e8b3e2abc3e4f62040e01a5940..6df9ff6c59bab170c3ad713cb9e0a303587c7292`

## Findings

### [P1] Empty or undefined rejection callbacks suppress `void_promise`

`tools/obs-inventory/src/scan.ts:338-347`

`isObservedPromise` accepts every `.catch(...)` call and every `.then(...)`
with two arguments by name and arity alone. Both `void pending.catch()` and
`void pending.then(ok, undefined)` emitted no finding even though neither call
installs a rejection observer and each discards the returned Promise. The
rework correctly distinguishes Promise-typed operands from synchronous calls,
but its observation check still lets discarded production promises bypass the
class. Explicit `any` Promise values and `any`-returning calls also emitted no
finding because non-error `any` types are treated as known non-promises.

### [P1] Mutable aliases and later spreads can replace the caught cause unnoticed

`tools/obs-inventory/src/scan.ts:112-123,289-336,413-420`

Cause provenance records declaration initializers only and does not invalidate
an alias after assignment. The harmful source `let alias = caught; alias =
unrelated; new DomainError("WRAP_FAILED", "fixed", { cause: alias })` emitted
no `wrapper_without_cause`. Object evaluation order is also ignored:
`{ cause: caught, ...{ cause: unrelated } }` is accepted as soon as the first
`cause` is seen, even though the later spread replaces it at runtime. These are
direct cause-losing wrappers under FIX-16-R01.

### [P1] Valid CommonJS require forms still bypass the zone check

`tools/obs-inventory/src/zone-check.ts:124-172`

The visitor recognizes only identifier calls whose symbol was collected from
a variable-declaration initializer. A governed
`module.require("apps/api/src/registration.ts")` emitted no `zone_import`, as
did `let load; load = require; load("apps/api/src/registration.ts")`.
Conversely, `let load = require; load = local;
load("apps/api/src/registration.ts")` still emitted a false positive because
the alias set is never invalidated. `module.require` is itself a Node/CommonJS
require, and assignment aliases are ordinary JavaScript; simple `const`
aliases and lexical shadows are not sufficient for R04's “any require” rule.

### [P1] Lookalike manifest literals are checked only in one narrow AST shape

`tools/obs-inventory/src/zone-check.ts:174-200,239-241`

The exact real-manifest exemption now exists, but the lookalike check only
recognizes a direct identifier/string-named property whose initializer is a
direct array or one single-argument wrapper around an array. Equivalent
governed lookalikes using `{ ["zone_path_prefixes"]: [ZONE_LITERAL] }`, an
array spread, or an array identifier all emitted no finding. The review
contract grants the literal exemption only to the normalized exact manifest
source, so AST spelling changes in another file cannot be allowed to recreate
that exemption.

### [P2] Exact cause syntax and nested catch shadowing still false-positive

`tools/obs-inventory/src/scan.ts:300-335,392-455`

The safe neighbor `{ ["cause"]: caught }` emitted
`wrapper_without_cause` because computed literal property names are not
recognized. Separately, a nested function parameter that shadows the outer
catch binding still inherits the outer binding in `inheritedCauses`, so a
wrapper inside that function is reported even though the caught error is no
longer accessible there. Symbol-keyed aliases fixed same-spelled declarations,
but caught-binding scope and equivalent object syntax remain incomplete.

## Verdict

- **SPEC: REWORK** — the exact seven round-1 examples are repaired, but valid
  adjacent Promise, wrapper, require, and manifest syntax still produces
  false negatives in R01/R04.
- **CODE QUALITY: REWORK** — symbol-based bindings are a material correction,
  yet the analysis remains declaration-only or syntax/arity-only where runtime
  overwrite and observer semantics determine the verdict.

## Prior-finding retest

| Round-1 finding | Round-2 result |
|---|---|
| Promise-typed `void` versus synchronous calls and identifiers | Exact examples pass; rejection-observer and `any` gaps remain |
| Arbitrary identifier/property throws | PASS, including caught and coded aliases as safe neighbors |
| Transformed caught cause | Exact `Boolean(caught)` and lexical-shadow examples pass; mutation/spread gaps remain |
| TypeScript import type | PASS for `import(...)`, `typeof import(...)`, and static `import type` |
| Exact manifest-only exemption | Exact direct-array example passes; computed/spread/alias lookalikes remain |
| Symlink fail-closed without target reads | PASS |
| Lexical wrapper/namespace/require aliases and shadows | Exact `const`/import examples pass; assignment/CommonJS forms remain |

## Verification evidence

- `pnpm vitest run tests/architecture/fix16-gate.test.ts` passed **17/17 on
  three consecutive runs**: 1.30 s, 1.23 s, and 1.23 s.
- The production scan emitted **375 rows in 10,423 ms**: 143 `bare_catch`, 182
  `throw_without_code`, 34 `void_promise`, 16 `wrapper_without_cause`, and 0
  `zone_import`. This is below the 30,000 ms seed.
- All 12 rework-report mutants were independently applied one at a time in a
  detached temporary worktree and exited RED: syntax-only Promise, blanket
  identifier/property throw, recursive transformed cause, missing import-type,
  global manifest exemption, silent symlink, wrapper spelling, require
  spelling, broad every-void, every-throw, no-cause-alias, and
  every-string-literal. The restored copy returned to 17/17.
- A full-tree injected-filesystem run produced 375 rows through 364 operations
  and recorded **zero operations addressed to a classified zone path**.
- File count, repository path escape, invalid limit, and malformed syntax
  closed with `OBS_INVENTORY_FILE_LIMIT`, `OBS_INVENTORY_PATH_ESCAPE`,
  `OBS_INVENTORY_LIMIT_INVALID`, and `OBS_INVENTORY_PARSE_FAILED`.
- `pnpm typecheck` reproduced only the pinned eight diagnostics in
  `tests/unit/s14-ui.test.ts`; no C1 diagnostic appeared.
- `pnpm audit:source` reproduced only the pinned three installer
  environment-read blockers. `pnpm audit:text-bytes` passed with
  `REPOSITORY_TEXT_CONTROL_BYTES=0`. `git diff --check` was clean.

## Scope check

The rework commit changes only the two C1 scanner sources, the focused FIX-16
architecture test and two existing C1 fixtures, plus its rework report. It does
not change a baseline, CLI/index, README, package manifest, product source,
frozen FIX-16 artifact, `tools/orphan-audit/**`, or any C2 surface.
