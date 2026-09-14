# FIX-16 C1 Sol review — round-2 rework

Date: 2026-09-04

Rework commit: `053fa09687381f30ac6b8b3f8b718ede90e16e49`

Reviewed delta: `6df9ff6c59bab170c3ad713cb9e0a303587c7292..053fa09687381f30ac6b8b3f8b718ede90e16e49`

## Findings

### [P1] Rejection observers still use stale declarations and treat empty binding patterns as consumption

`tools/obs-inventory/src/scan.ts:357-425`

`collectRejectionHandlerDefinitions` records only the declaration-time function,
and `isRejectionObserver` consults that immutable definition before following any
other state. Consequently this harmful source returned `[]` instead of a
`void_promise` at line 5:

```ts
declare const pending: Promise<void>;
declare function observe(error: unknown): void;
let callback = (error: unknown) => observe(error);
callback = (_error: unknown) => undefined;
void pending.catch(callback);
```

The inverse safe neighbour (empty declaration, then reassigned to the consuming
callback) emitted `void_promise` at line 5. A separate harmful
`void pending.catch(({}) => undefined)` also returned `[]`, because line 386
accepts every non-identifier binding pattern without checking whether it binds
or reads anything. Direct empty callbacks, `undefined`, `.then` rejection slots,
and immutable callback aliases from the round-2 test are repaired; mutable
aliases and empty destructuring still invert both sides of the gate.

### [P1] Cause state is neither object-alias-aware nor path-sensitive

`tools/obs-inventory/src/scan.ts:312-343,491-542,559-580`

Object state is stored per variable symbol, not per referenced object, and every
visited assignment mutates one shared state as though every control-flow branch
ran. Both of these cause-losing wrappers returned `[]`:

```ts
import { TypedDomainError as DomainError } from "@debateai/kernel";
declare const unrelated: unknown;
try { task(); } catch (caught) {
  const options = { cause: caught };
  const alias = options;
  alias.cause = unrelated;
  new DomainError("WRAP_FAILED", "fixed", options);
}
```

```ts
import { TypedDomainError as DomainError } from "@debateai/kernel";
declare const unrelated: unknown;
declare const flag: boolean;
try { task(); } catch (caught) {
  let alias = unrelated;
  if (flag) alias = caught;
  new DomainError("WRAP_FAILED", "fixed", { cause: alias });
}
```

The first loses `cause` through the same object; the second loses it whenever
`flag` is false. The safe inverse of the first example (`options` initially
unrelated, then restored through `alias.cause = caught`) emitted
`wrapper_without_cause`. Direct identifier reassignment, direct property writes,
and later object-spread overwrites from round 2 now work, but aliases and branch
joins can still hide a cause-losing wrapper or reject a preserving one.

### [P1] Valid CommonJS forms still bypass possible-require flow

`tools/obs-inventory/src/zone-check.ts:138-169,274-316`

The alias set is updated in source traversal order with no branch join. This
valid program returned `[]`, although the final call is the global `require`
whenever `flag` is false:

```ts
declare const flag: boolean;
declare const local: (path: string) => unknown;
let load = require;
if (flag) load = local;
load("apps/api/src/registration.ts");
```

`module["require"]("apps/api/src/registration.ts")` also returned `[]`, because
`isUnshadowedModuleRequire` accepts only `PropertyAccessExpression`. Direct
`module.require`, assignment introduction, sequential invalidation and
re-introduction pass, and a shadowing `module` parameter remains a safe
neighbour. R04 nevertheless says any `require` of a zone prefix must fail, so a
possible global loader cannot be erased by one conditional branch or an
equivalent computed member spelling.

### [P1] Mutable manifest aliases are resolved from stale declaration initializers

`tools/obs-inventory/src/zone-check.ts:172-249,261,336-353`

`collectExpressionInitializers` snapshots only variable declarations. It does
not apply later writes when resolving computed property names or aliased arrays.
This governed lookalike returned `[]` instead of a `zone_import` for the zone
literal at line 2:

```ts
let paths = ["packages/kernel/src/error.ts"];
paths = ["apps/api/src/registration.ts"];
export const LOOKALIKE = { zone_path_prefixes: paths };
```

The inverse safe neighbour (zone initializer, then reassigned to the kernel
path before the object is built) emitted `zone_import` at line 1. The same
two-sided error occurs for a mutable computed key changed to or from
`"zone_path_prefixes"`. Immutable computed/spread/aliased lookalikes are now
caught, immutable shadowed shorthand data stays ignored, and equivalent data
at the normalized exact manifest path remains exempt. Mutation invalidation is
still missing from the alias evaluator that decides which value becomes
manifest-shaped data.

### [P2] A constant alias of the exact computed `cause` key is rejected

`tools/obs-inventory/src/scan.ts:303-309,328-340`

Only an inline computed string literal is recognized as `cause`. This lawful
safe neighbour emitted `wrapper_without_cause` at line 4:

```ts
import { TypedDomainError as DomainError } from "@debateai/kernel";
const CAUSE = "cause" as const;
try { task(); } catch (caught) {
  new DomainError("WRAP_FAILED", "fixed", { [CAUSE]: caught });
}
```

The direct `{ ["cause"]: caught }` syntax and nested catch-binding shadow from
the round-2 finding both pass. A compiler-resolved constant key is the same
runtime property, however, and R01 classifies wrappers that omit `cause`, not
wrappers based on whether the key is written inline.

## Round-2 finding validation

| Prior round-2 finding | Exact rework result | Adjacent result |
|---|---|---|
| Empty/undefined rejection callbacks and explicit `any` | PASS for all checked exact examples, including immutable callback aliases | REWORK: mutable callbacks and empty destructuring produce false negatives; the inverse mutation produces a false positive |
| Mutable cause aliases and later spreads | PASS for direct alias reassignment, direct property writes and last-write-wins spreads | REWORK: object aliases and conditional assignments can still lose cause unnoticed |
| `module.require` and assignment aliases | PASS for direct `module.require`, introduction, invalidation and re-introduction | REWORK: conditional invalidation and `module["require"]` bypass the check |
| Computed/spread/aliased lookalike manifest data | PASS for immutable computed keys, array spreads and aliases; the exact real manifest remains exempt | REWORK: mutable value/key aliases use stale declaration state in both directions |
| Computed `cause` and nested catch shadowing | PASS for inline `["cause"]` and the checked nested shadow | REWORK: a constant computed key is still a false positive |

## Independent harmful and safe-neighbour probes

All probes called the shipped `scanSource` directly; they did not modify the
checkout.

| Area | Harmful mutant | Observed | Safe neighbour | Observed |
|---|---|---|---|---|
| Promise rejection | consuming callback reassigned to empty; empty `{}` binding callback | both missed | empty callback reassigned to consuming | false `void_promise`; immutable consuming alias stayed clean |
| Cause lineage | same object overwritten through an alias; preservation only on one branch; computed-key overwrite | all missed | same object restored through an alias | false `wrapper_without_cause`; direct spread order passed |
| CommonJS | possible `require` after conditional invalidation; `module["require"]` | both missed | parameter-shadowed `module.require` | clean; direct sequential reassignment passed |
| Manifest data | safe declaration reassigned to zone value/key | missed | zone declaration reassigned to safe value/key | false `zone_import`; immutable computed/spread/alias lookalike was caught |
| Exact exemption/shadow | computed/spread/alias data outside exact manifest | caught | same data at normalized exact manifest path; shadowed shorthand/calls | clean |

## Verification evidence

- `pnpm vitest run tests/architecture/fix16-gate.test.ts --reporter=dot`
  passed **22/22 on three consecutive fresh runs**: 1.52 s, 1.41 s and
  1.41 s.
- The full production scan returned **431 rows in 11,322 ms**: 143
  `bare_catch`, 226 `throw_without_code`, 57 `void_promise`, 5
  `wrapper_without_cause`, and 0 `zone_import`. This is below the 30,000 ms
  seed.
- A full-tree injected-filesystem run returned the same 431 rows through 364
  operations and recorded **zero operations addressed to a classified zone
  path**. The focused suite's source-symlink trap passed in all three runs and
  did not read its linked classified target.
- Independent guard probes closed with `OBS_INVENTORY_PATH_ESCAPE`,
  `OBS_INVENTORY_LIMIT_INVALID`, `OBS_INVENTORY_FILE_LIMIT`,
  `OBS_INVENTORY_PARSE_FAILED`, and `OBS_INVENTORY_CANDIDATE_LIMIT`.
- `pnpm generate:contract` exited 0 and left no generated-source delta. The
  following `pnpm typecheck` reproduced exactly the pinned eight diagnostics,
  all in `tests/unit/s14-ui.test.ts`; no C1 diagnostic appeared. `typescript`,
  `vitest`, and `tsx` all resolved inside this worktree.
- `pnpm audit:source` reproduced only the three ruled installer
  environment-read blockers. `pnpm audit:text-bytes` passed with
  `REPOSITORY_TEXT_CONTROL_BYTES=0`.
- Static searches found no filesystem API in `zone-check.ts`, no regex
  classifier, no mutation marker, and no TODO/FIXME in either C1 source.
  `git diff --check 6df9ff6c..053fa096` passed.

## Scope

The reviewed commit changes only the two C1 scanner sources, the focused
FIX-16 architecture test, two existing FIX-16 fixtures, and the implementer
report. There is no baseline, CLI/index, package manifest, product source,
frozen FIX-16 artifact, `tools/orphan-audit/**`, or C2 change. Contract
generation left the pre-existing two untracked review reports as the only
working-tree entries before this report was added.

## SPEC verdict

**REWORK.** The five exact round-2 examples are repaired, and the importer-only
filesystem and finite-bound constraints hold in the probes. Four independent
P1 semantic groups still escape R01/R04 through stale or path-insensitive state,
so C1 does not yet enforce “new violation” for ordinary adjacent JavaScript and
TypeScript forms.

## CODE QUALITY verdict

**REWORK.** Compiler-symbol resolution, last-write-wins object spreads, lexical
shadow filtering, and typed Promise detection are material improvements. The
remaining declaration snapshots and single mutable traversal maps are not a
sound flow model: reassignment, alias identity, and branch joins can reverse
both harmful and safe verdicts.
