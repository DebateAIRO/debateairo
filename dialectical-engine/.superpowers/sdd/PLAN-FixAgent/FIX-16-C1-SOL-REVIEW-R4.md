# FIX-16 C1 Sol review — round 3 rework

Date: 2026-09-04

Rework commit: `c6057c5490edf416708c64d50886edac67de06e2`

Reviewed delta: `053fa09687381f30ac6b8b3f8b718ede90e16e49..c6057c5490edf416708c64d50886edac67de06e2`

## Findings

### [P1] Structured control flow is not a sound all-path model

`tools/obs-inventory/src/scan.ts:748-884`

`tools/obs-inventory/src/zone-check.ts:331-453`

Loops are evaluated exactly once and joined with the entry state, switch
clauses are evaluated independently without fallthrough, try/catch is traversed
sequentially without an exceptional join, and `return`/`break`/`continue` do
not terminate a path. These are not conservative approximations in both
directions.

A finite two-iteration callback probe returned `[]`:

```ts
let a = consume;
let b = consume;
let c = (_error: unknown) => undefined;
for (let i = 0; i < 2; i += 1) { a = b; b = c; }
void pending.catch(a);
```

At runtime `a` is the ignoring callback. The same two-step transfer returned
`[]` for caught-cause aliases, possible-global `require`, and manifest data.
Likewise, this fallthrough returned `[]` although `mode === 0` invokes global
`require`:

```ts
let load = local;
switch (mode) {
  case 0: load = require;
  case 1: load("apps/api/src/registration.ts"); break;
}
```

This exceptional path also returned `[]`: `let load = require; try { task();
load = local; } catch (caught) {} load(ZONE)`. If `task()` throws, the call is
global. Conversely, a branch which assigned `require` and then returned before
a later local-only call produced a false `zone_import`; equivalent callback,
cause, and manifest safe neighbours also false-positive. R01/R04 therefore
still admit reachable violations and reject code whose violating state cannot
reach the candidate.

### [P1] Rejection consumption is inferred from binding shape, and computed observers are rejected

`tools/obs-inventory/src/scan.ts:416-475,477-497`

Every non-empty destructuring parameter is accepted without checking its body.
The concrete ignoring callback below returned `[]` instead of
`void_promise`:

```ts
void pending.catch(({ message }: { message: unknown }) => undefined);
```

Imported or otherwise unresolved callback identifiers are also accepted as
observing by the `definition === undefined` branch. In the opposite direction,
`void pending["catch"](consume)` and
`void pending["then"](fulfilled, consume)` each emitted `void_promise`, because
only property-access spellings of `catch`/`then` are recognized. Direct and
mutable callback assignments, empty `{}`/`[]` destructuring, conditional joins,
optional `catch?.()`, and `.catch(...).finally(...)` worked in the controls.

### [P1] A visible caught-cause alias does not keep wrapper checking active when the catch name is shadowed

`tools/obs-inventory/src/scan.ts:709-730,913-923`

Catch context visibility is proved only by resolving the original catch
variable name. A caught value can remain in scope through an alias while that
name is shadowed. This cause-losing wrapper returned `[]`:

```ts
try { task(); } catch (caught) {
  const root = caught;
  {
    const caught = unrelated;
    new DomainError("WRAP_FAILED", "fixed");
    void root;
  }
}
```

`root` keeps the caught error in scope, so R01 requires the wrapper to pass it
as `cause`. The round-2 safe neighbour with no visible caught alias remains
clean, but it does not cover this alias-preserving shadow case.

### [P1] Common object mutations still erase a caught cause without detection

`tools/obs-inventory/src/scan.ts:601-707,913-923`

Object identity, binary property assignments, computed keys, spreads, and
branch joins now work for the exact round-3 cases. Mutations outside binary
assignment do not update `objectProperties`. Both of these returned `[]`:

```ts
const options = { cause: caught };
delete options.cause;
new DomainError("WRAP_FAILED", "fixed", options);
```

```ts
const options = { cause: caught };
Object.assign(options, { cause: unrelated });
new DomainError("WRAP_FAILED", "fixed", options);
```

Both wrappers have lost the caught cause at construction time.

### [P1] Throw and wrapper constructor aliases still use stale declaration snapshots

`tools/obs-inventory/src/scan.ts:112-183,191-287`

The new flow state does not replace the older declaration-only tables used for
throw codes and `TypedDomainError` constructor identity. These two throw
neighbours invert the verdict:

```ts
let failure = new Error("DECLARED_CODE");
failure = new Error("ordinary text");
throw failure; // returned []
```

```ts
let failure = new Error("ordinary text");
failure = new Error("DECLARED_CODE");
throw failure; // emitted throw_without_code
```

Similarly, assigning `DomainError` into a mutable constructor alias was missed,
while replacing an initially aliased `DomainError` with a local class still
emitted `wrapper_without_cause`. Exact immutable aliases, coded throws, arbitrary
identifier throws, and caught rethrows remain correct.

### [P1] Ordinary global-require expressions still bypass R04

`tools/obs-inventory/src/zone-check.ts:254-269,326-329,431-451`

Compound assignments are reduced to definite local/unknown state rather than
their short-circuit semantics. This returned `[]`, although `require` is
non-nullish and the assignment is skipped:

```ts
let load = require;
load ??= local;
load("apps/api/src/registration.ts");
```

The common indirect-call spelling
`(0, require)("apps/api/src/registration.ts")` also returned `[]` because a
comma expression is never a possible require. Conditional joins,
`module["require"]`, sequential `=` invalidation/reintroduction, and lexical
`require`/`module` shadows passed their controls.

### [P1] Manifest-shaped property mutation is outside the data-flow model

`tools/obs-inventory/src/zone-check.ts:431-493`

Mutable identifiers feeding a later object literal now use their current or
joined data. Assignment to an already-created manifest-shaped object's
property is not classified, because binary flow updates only identifier
left-hand sides. Both direct and constant-computed forms returned `[]`; the
direct reproduction was:

```ts
const lookalike = {
  zone_path_prefixes: ["packages/kernel/src/error.ts"],
};
lookalike.zone_path_prefixes = ["apps/api/src/registration.ts"];
export { lookalike };
```

The same mutation at the exact normalized manifest path stayed exempt, as
required, but governed lookalikes can acquire classified data after creation
without a `zone_import`.

## Round-3 finding validation

| Round-3 item | Exact result | Adjacent result |
|---|---|---|
| Mutable callbacks, empty destructuring, conditional joins | PASS for the committed assignment/empty `{}`/join cases | REWORK: unused non-empty destructuring, unresolved callbacks, multi-iteration/switch/exception paths |
| Object alias identity, property writes, branch-safe caught-cause proof, constant computed key | PASS for exact alias `=` writes, branch joins, catch-binding reassignment, and `[CAUSE]` | REWORK: alias-preserving name shadow, `delete`, `Object.assign`, exceptional/abrupt paths |
| Possible-global require joins, `module["require"]`, reassignment and lexical shadows | PASS for exact `if`, computed module member, sequential `=`, and shadows | REWORK: multi-iteration/switch/exception paths, `??=`, comma-call |
| Mutable computed/spread/aliased manifest data and exact-file exemption | PASS for exact identifier/key assignments, joins, spreads, aliases, and normalized exact file | REWORK: multi-iteration/switch/exception paths and property mutation |
| Zero-iteration loop and reassigned catch context additions | PASS | REWORK: the model has no 2+ iteration fixed point or abrupt/exceptional reachability |

## Earlier-semantics recheck

- Promise/PromiseLike values, synchronous calls, explicit `any`, direct
  `catch`/`then` observers, `finally`, and empty callbacks matched the focused
  expectations; computed observers and the callback cases above did not.
- Arbitrary identifier/property throws, immutable coded aliases, coded
  constructors, and caught rethrows passed; mutable coded aliases did not.
- Static imports/re-exports, dynamic imports, import-equals, `import(...)`,
  `typeof import(...)`, relative/path-separator normalization, and governed-tree
  selection passed.
- The source-symlink trap passed in all three focused runs and did not read its
  classified target. A full-tree injected filesystem run recorded zero
  operations addressed to a classified zone path.
- Independent guards closed with `OBS_INVENTORY_PATH_ESCAPE`,
  `OBS_INVENTORY_LIMIT_INVALID`, `OBS_INVENTORY_FILE_SIZE_LIMIT`,
  `OBS_INVENTORY_NODE_LIMIT`, `OBS_INVENTORY_CANDIDATE_LIMIT`,
  `OBS_INVENTORY_FILE_LIMIT`, and `OBS_INVENTORY_PARSE_FAILED`.
- More than 32 caught-object or manifest-data alternatives became unknown and
  failed closed. The same over-cap data at the exact manifest path remained
  exempt. Unknown computed module keys and unknown Promise callbacks also
  failed closed.

## Verification evidence

- `pnpm vitest run tests/architecture/fix16-gate.test.ts --reporter=dot`
  passed **28/28 three consecutive times**: 1.80 s, 1.73 s, and 1.73 s.
- Full production scan: **398 rows in 12,470 ms** — 143 `bare_catch`, 182
  `throw_without_code`, 57 `void_promise`, 16 `wrapper_without_cause`, and 0
  `zone_import`; below the 30,000 ms seed.
- The full-tree injected-filesystem scan returned the same 398 rows through
  364 operations and recorded zero classified-zone addresses.
- Independent harmful/safe-neighbour probes covered sequential, conditional,
  ternary, nested-if, finite-loop, switch-fallthrough, try/catch, abrupt return,
  alias mutation, computed members, exact exemption, caps, and unknown state.
  Ternary and nested-if controls passed; the seven groups above reproduced.
- Five isolated one-at-a-time implementation mutants were killed by the
  focused suite: accepting empty destructuring (27/28), dropping the
  zero-iteration loop join (27/28), ignoring computed `module.require`
  (27/28), discarding object identity (26/28), and discarding assignment flow
  for require/manifest data (24/28). The detached copy was restored to 28/28
  and removed; the reviewed checkout was not mutated.
- `pnpm typecheck` reproduced exactly the pinned eight diagnostics, all in
  `tests/unit/s14-ui.test.ts`; no C1 diagnostic appeared.
- `pnpm audit:source` reproduced only the three ruled obs-installer
  environment-read blockers. `pnpm audit:text-bytes` passed with
  `REPOSITORY_TEXT_CONTROL_BYTES=0`.
- `git diff --check 053fa096..c6057c54` passed. Static searches found no
  filesystem API in `zone-check.ts`, no TODO/FIXME/mutation marker in the C1
  delta, and no residual temporary mutation worktree.

## Scope

The reviewed delta changes only the two C1 scanner sources, the focused FIX-16
architecture test, and the round-3 implementer report. It does not change a
baseline, CLI/index, package manifest, product source, frozen FIX-16 artifact,
`tools/orphan-audit/**`, or C2 surface. The pre-existing Sol review artifacts
remain untracked; this report is the only new review write.

## SPEC verdict

**REWORK.** The round-3 examples are repaired and the finite resource and
importer-only filesystem properties hold, but ordinary reachable R01/R04
violations still pass through loop, switch, exception, callback, cause,
mutable-alias, require-expression, and manifest-mutation forms.

## CODE QUALITY verdict

**REWORK.** The bounded alternative sets, object identities, exact-file
exemption, and direct conditional joins are useful improvements. The analysis
is still a source-order state walker rather than a control-flow fixed point:
it conflates unreachable and reachable exits, loses exceptional paths, and
retains declaration-only side tables beside the newer flow state. Those model
boundaries explain the reproduced false negatives and false positives.

## Status boundary

This is a Sol review of FIX-16 C1 round-3 rework only. It makes no baseline,
C2, merge, board, Done, or V-acceptance claim.
