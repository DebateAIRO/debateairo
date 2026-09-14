# FIX-16 C1 Sol review — round 5 rework

Date: 2026-09-04

## Findings

### [P1] Stacked labels still invert the state after a labelled loop transfer

`tools/obs-inventory/src/scan.ts:1928-1996,2144-2148,2261-2266`

A loop receives only one optional label. Each `LabeledStatement` replaces that
value while descending, so in `outer: inner: for (...)` the loop knows only
`inner`. The legal `continue outer` completion therefore fails the
`result.label === loopLabel` test and is emitted as an abrupt completion rather
than a back edge. This harmful probe returned `[]`:

```ts
declare const local: (path: string) => unknown;
let load = local;
outer: inner: for (let i = 0; i < 1; i += 1) {
  load = require;
  continue outer;
}
load("apps/api/src/registration.ts");
```

The inverse started with `load = require`, assigned `local` before the same
`continue outer`, and then called `load`; it incorrectly emitted a
`zone_import`. Thus this is a two-sided reachable-state error, not an unknown
value conservatism choice. The committed single-label harmful and safe cases
pass, as do the cap-domain probes; the adjacent standard stacked-label form
does not.

### [P1] Collection transfer works only when the iterable and destructured value are inline literals

`tools/obs-inventory/src/scan.ts:1294-1365,2188-2257`

Known `for...of` iterations are formed only from a syntactically direct array
literal, and array destructuring transfers only from a syntactically direct
array literal. The scanner already tracks array identity/data, but does not use
that state at these binding sites. Both of these harmful probes returned `[]`:

```ts
const loaders = [require];
for (const load of loaders) {
  load("apps/api/src/registration.ts");
}
```

```ts
const loaders = [require];
const [load] = loaders;
load("apps/api/src/registration.ts");
```

The corresponding `local` controls returned `[]` as expected. `for...in` has
the same direct-syntax split: an aliased `{ ordinary: true }` emitted the
expected `throw_without_code`, but an aliased `{ SAFE_CODE: true }` emitted the
same false positive because the loop variable was bound as unknown. With an
inline spread, `{ ...{ ordinary: true } }` and `{ ...{ SAFE_CODE: true } }`
both returned `[]`, losing the harmful key. Direct inline array/object cases
remain green.

### [P1] Property assignment expressions are not modeled as the value of a callee

`tools/obs-inventory/src/scan.ts:1088-1122,1488-1500,1597-1654`

The new logical-assignment flow is restricted to identifier targets, and
`requireOf` explicitly returns `REQUIRE_LOCAL` for an assignment expression
whose target is not an identifier. Property writes update only the cause and
manifest domains, so the call expression cannot recover the assigned or
retained callable value. All three reachable calls returned `[]`:

```ts
const holder = { load: local };
(holder.load = require)("apps/api/src/registration.ts");
```

```ts
const holder = { load: require };
(holder.load ||= local)("apps/api/src/registration.ts");
```

```ts
const holder = { load: local };
(holder.load &&= require)("apps/api/src/registration.ts");
```

The inverse `(holder.load = local)(ZONE)` returned `[]`. Direct identifier
`=`, `||=`, and `&&=` cases pass, but the assignment-valued-callee root is not
closed for the ordinary property-target form.

### [P1] Nested callable execution is suppressed and later uses the definition snapshot

`tools/obs-inventory/src/scan.ts:1452-1471,1682-1704,1863-1906,2385-2393`

Calls are interpreted only while `callableBodyDepth === 0`. When a top-level
call enters `outer`, its call to `inner` is therefore skipped. The deferred
pass later analyzes `inner` from its definition snapshot rather than the state
at the nested call. This harmful closure returned `[]`:

```ts
declare const local: (path: string) => unknown;
function outer(): void {
  let load = local;
  const inner = () => load("apps/api/src/registration.ts");
  load = require;
  inner();
}
outer();
```

The inverse, which defines `inner` while `load` is global and changes it to
`local` before calling, incorrectly emitted `zone_import` at the inner body.
The committed top-level declaration/expression closures and direct rejection
callbacks pass, but they do not exercise a call made from an interpreted
callable. Corroborating test-gap evidence: an isolated mutant that disabled all
call-site callable execution still passed the focused closure/callback group.

### [P1] Manifest-array state ignores exact index writes and other standard mutations

`tools/obs-inventory/src/scan.ts:1379-1393,1488-1538`

`assignBinary` treats an element target as though its key were a manifest
object-property name; it does not update the referenced array identity.
Consequently the semantically exact string-index overwrite below returned
`[]` and the later export retained stale safe data:

```ts
const paths = ["packages/kernel/src/error.ts"];
paths["0"] = "apps/api/src/registration.ts";
export const LOOKALIKE = { zone_path_prefixes: paths };
```

The safe string-index inverse returned `[]`. The mutation helper also has a
closed whitelist of `push`, `unshift`, and `splice`; `paths.fill(ZONE)` and
`Array.prototype.push.call(paths, ZONE)` both returned `[]`, while their safe
inverses remained clean. Direct/computed `Object.assign`, returned target
identity, direct object-property writes, `delete`, spread, direct `push`, exact
manifest exemption, and a real import from the exact manifest continue to
match the committed expectations. The remaining misses are nevertheless
ordinary mutations of the same tracked manifest array and leave R04
inventory-incomplete.

## Review basis

- Rework commit: `5f36419188a21ea663ada2bb2293408b1f3cdd67`
- Reviewed delta: `5ebeb2b4..5f364191`
- Frozen authority read: `FIX-16/SPEC.md`, `FIX-16/PLAN.md`, and
  `FIX-16/DECISIONS.md`
- Prior review read: `FIX-16-C1-SOL-REVIEW-R5.md`
- Implementer report read: `FIX-16-C1-REWORK-R5-REPORT.md`

## Frozen-root validation

| Frozen root | Exact R5 regression | Independent adjacent validation |
|---|---|---|
| Labelled/cap loop exits | PASS for one label and all five cap domains | REWORK: stacked-label harmful miss and inverse false positive |
| `for...of` / `for...in` / destructuring | PASS for direct literals | REWORK: array aliases miss; safe object alias false-positives; object spread loses harmful key |
| `||=` / `&&=` / assignment-valued callees | PASS for identifier targets | REWORK: property `=`, `||=`, and `&&=` callee results miss global require |
| Unified callable/callback lexical flow | PASS for top-level closures and direct callbacks | REWORK: nested calls use definition state rather than call state |
| Identity / assign / computed / delete / spread / manifest mutation | PASS for the committed Object.assign, property, and direct method cases | REWORK: string-index, `fill`, and indirect push mutations miss classified data |

## Earlier semantics, path, symlink, and bounds recheck

- The repeated focused suite retained the prior promise/PromiseLike,
  synchronous-call, explicit-`any`, direct/computed `catch` and `then`,
  `finally`, arbitrary throw, caught-rethrow, code-token, wrapper-alias,
  lexical-shadow, mutable-alias, and foreign-wrapper outcomes.
- Static imports/re-exports, dynamic imports, import-equals, import types,
  source-extension equivalence, all governed importer roots, exact manifest
  exemption, and traversal/separator normalization retained their expected
  results.
- The injected-filesystem and symlink tests passed in all three focused runs,
  including the assertion that a classified symlink target is not read.
- The path escape, invalid-limit, file-count, file-size, AST-node, candidate,
  and parse-failure guards continued to produce their exact typed error codes.
- No additional root was opened beyond the five frozen roots; harmful and
  inverse probes were limited to the adjacent forms above.

## Verification evidence

- `pnpm vitest run tests/architecture/fix16-gate.test.ts --reporter=dot`
  passed **45/45 in three consecutive unchanged runs**: 10.59 s, 10.48 s,
  and 10.50 s.
- Three independent full production scans returned the identical **379-row**
  result each time: 143 `bare_catch`, 173 `throw_without_code`, 41
  `void_promise`, 16 `wrapper_without_cause`, and 6 `zone_import`. Wall times
  were 19.10 s, 19.09 s, and 19.09 s, all below the frozen 30-second bound.
- Six isolated one-at-a-time source mutants were exercised in a detached
  temporary tree. Five were killed: labelled-transfer matching, direct
  iteration element transfer, logical-assignment special flow, array mutation
  application, and Object.assign application. Disabling call-site callable
  execution survived the exact closure/callback group. The original source was
  byte-compared after restoration, the restored closure group passed, and the
  temporary tree was removed.
- `pnpm typecheck` reproduced exactly the pinned eight diagnostics, all in
  `tests/unit/s14-ui.test.ts`; no C1 diagnostic appeared.
- The `pnpm audit:source` wrapper could not create its local `tsx` IPC socket
  in the review sandbox. Running the identical entry point with
  `node --import tsx tools/orphan-audit/src/cli.ts source` reproduced exactly
  the pinned three obs-installer environment-read blockers and no C1 blocker.
  The no-IPC equivalent of `audit:text-bytes` passed with
  `REPOSITORY_TEXT_CONTROL_BYTES=0`.
- `git diff --check 5ebeb2b4..5f364191` passed. Static searches found no
  filesystem API in `zone-check.ts`, no TODO/FIXME/mutant marker in the changed
  C1 source/test, and no frozen-authority change.

## Scope

The reviewed commit changes only `tools/obs-inventory/src/scan.ts`,
`tests/architecture/fix16-gate.test.ts`, and the round-5 implementer report.
It does not change product source, frozen FIX-16 authority, a baseline,
`zone-check.ts`, CLI/package interface, `tools/orphan-audit/**`, C2, or V
surface. Pre-existing untracked Sol reports were preserved; this R6 report is
the only repository write made by this review.

## SPEC verdict

**REWORK.** The exact R5 cases and bounded production scan pass, but each of
the five frozen authority roots still has a reachable adjacent false negative;
three roots also have inverse false positives. R01/R04 inventory completeness
therefore remains unproven.

## CODE QUALITY verdict

**REWORK.** The implementation adds substantial state domains, but critical
transfers remain selected by direct AST spelling rather than the tracked
identity/value state, and nested-call evaluation is explicitly disabled.
The surviving callable mutant confirms that the focused tests do not yet
distinguish definition-time scanning from required call-time semantics.

## Status boundary

This is a Sol review of FIX-16 C1 round-5 rework only. It makes no product,
specification, baseline, C2, V-acceptance, merge, board, or Done change or
claim.
