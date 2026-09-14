# FIX-09 C1 round-sixteen rework

Scope: the round-sixteen C1 derived-error superclass-dispatch finding, its
three exact supported-runtime regressions, systemic static coverage across the
three C1 policy modules, one bounded lawful neighbor, and this report only.
The rework base is
`77978e4b5e8ac4ceb3f8e7bc298df3e9bd9d336d`. This is not V acceptance and
makes no claim about C2-C4, merge readiness, or full FIX-09 completion.

## Review reproduction and root cause

The independent round-sixteen Sol review found that a derived constructor's
`super()` resolves through the derived constructor object's live internal
`[[Prototype]]`. The three C1 derived-error constructor objects remained
extensible after module initialization:

- exported `RepinRefusedError` in `custodian.ts`;
- `PolicyBundleSchemaError`, recoverable through
  `policyBundleSchema.safeParse({}).error.constructor`, in `loader.ts`;
- exported `PolicyBundleLoadError` in `loader.ts`.

Exact fresh-process regressions were added before the source correction. The
first selected run failed 4/4: all three live attacks plus the expanded static
authority guard.

The exported refusal-class attack replaced only that class's superclass,
self-restored it, changed the injected token to `wrong`, and re-entered
`repin()` with a schema-valid `quick_arm: ON` proposal. It produced one hostile
callback, environment `wrong`, a returned `quick_arm: ON` bundle, no reentrant
error, the ordinary outer `RepinRefusedError`, exact superclass restoration,
and the pinned hash.

The schema-class attack recovered the private constructor through
`safeParse({})`, replaced only its superclass, and used a preserving
`Array.prototype.some` replacement to enter schema failure before token
capture. It produced the same one-callback, `wrong`, and `quick_arm: ON`
authority bypass while restoring both exact modified relations.

The load-class attack installed a self-restoring hostile superclass that
threw `SyntaxError("RAW_CONSTRUCTOR_CALLBACK")`. Loading a missing path invoked
that callback once and leaked the raw `SyntaxError` instead of the required
`PolicyBundleLoadError`.

The static RED identified exactly these three source locations as
`mutable-derived-super`. The root cause was therefore the mutable constructor
superclass relation itself, before constructor-local instance definitions
could execute, rather than the already-closed inherited `name`, descriptor,
or VM-option paths.

## Correction

- Each of the three derived-error constructor objects is frozen immediately
  after its declaration, before any later module statement can expose or use
  it.
- `loader.ts` uses its initialization-time `FREEZE_OBJECT` capture.
  `custodian.ts` captures the same `Object.freeze` capability during trusted
  initialization and uses that capture.
- Only constructor objects are frozen. `Error`, `Error.prototype`, and each
  derived error's instance prototype remain extensible.
- The expanded TypeScript-AST guard walks `loader.ts`, `canonical.ts`, and
  `custodian.ts`; every class declaration with an `extends` clause must be
  followed immediately by `FREEZE_OBJECT` applied to that exact class.
- `instanceof`, `name`, `code`, `message`, `stack`, and `cause` behavior is
  unchanged. Caller-defined subclasses remain constructible and extensible,
  and their instances remain instances of both the caller subclass and the C1
  error superclass.

The canonical bundle remains
`aa76b3fe955ca5d46bcdf05d7b8f78ac27c25341104bf0b3810b6fc833497ecd`.

## RED, GREEN, mutants, and neighbors

- Initial exact RED: the refusal and schema attacks each produced
  `callbackCalls=1`, environment `wrong`, and inner `quick_arm=ON`; the load
  attack produced one callback and raw `SyntaxError`; the static guard listed
  all three mutable derived-super edges.
- Removing only the refusal constructor freeze re-enabled its exact wrong-token
  bypass and emitted its single static violation.
- Removing only the schema constructor freeze re-enabled its exact wrong-token
  bypass and emitted its single static violation.
- Removing only the load constructor freeze re-enabled the raw `SyntaxError`
  escape and emitted its single static violation.
- Adding a prototype-object freeze beyond the required constructor-object
  freeze was killed by the lawful-neighbor regression because the affected
  instance prototype became non-extensible.
- Every mutant was restored before final verification.
- The three exact live attacks passed 3/3 in each of three consecutive fresh
  processes. Each repin run recorded zero callbacks, unchanged `correct`, no
  returned bundle, exact `REPIN_REFUSED`, exact restoration, no raw escape,
  and the pinned hash. The load run recorded zero callbacks and an exact typed
  `PolicyBundleLoadError` with an `Error` cause.
- The static/lawful selection passed 2/2. It covers all current derived classes
  in the three authority modules and the non-overreach behavior above.
- The authority selection passed 38/38. The bounded safe-neighbor selection
  passed 11/11, adding lawful derived-error subclass behavior to the prior ten
  round-fifteen neighbors.
- Each of three consecutive complete focused runs passed 78/78.

## Verification

- `pnpm exec vitest run tests/unit/fix09-bundle.test.ts --reporter=dot`:
  78/78 passed in each of three consecutive fresh processes.
- The exact round-sixteen attack selection passed 3/3 in each of three
  consecutive fresh processes.
- The authority selection passed 38/38 and the bounded safe-neighbor selection
  passed 11/11.
- `node tests/unit/fixtures/fix09-independent-hash.mjs <
  tools/obs-listener/policy/bundle.json` emitted exact
  `aa76b3fe955ca5d46bcdf05d7b8f78ac27c25341104bf0b3810b6fc833497ecd`.
- Frozen-interface TypeScript compilation exited 0. `DispatchArm` remains
  memberless and `TracerHook` retains its frozen shape.
- `pnpm generate:contract` exited 0 and
  `git diff --exit-code -- packages/contract/generated` was clean.
- `pnpm typecheck` returned only the same eight existing diagnostics in the
  unchanged `tests/unit/s14-ui.test.ts`: TS2307 twice, TS18046 twice, TS2339
  twice, and TS7006 twice. No C1 diagnostic remained.
- `pnpm audit:source` returned only the same three installer environment reads
  in `packages/obs-capture/install/api.ts`, `runner.ts`, and `scheduler.ts`.
- `pnpm audit:text-bytes` exited 0 with
  `REPOSITORY_TEXT_CONTROL_BYTES=0`.

## Static and scope evidence

- The TypeScript-AST authority guard passes with an empty violation set and now
  rejects any current or later derived-class declaration in `loader.ts`,
  `canonical.ts`, or `custodian.ts` that lacks an immediate constructor-object
  freeze.
- A focused forbidden-source scan found no inherited Hash member call, Worker,
  Atomics, shared buffer, cwd lookup, CommonJS resolver hook, process launch,
  direct environment read, database/provider import, `occurrence_detail`, or
  product-side prototype mutation in the three policy modules.
- The round-sixteen delta is only this report, the focused C1 test,
  `loader.ts`, and `custodian.ts`; all are regular files. `canonical.ts` is
  covered by the systemic guard but unchanged.
- The policy bundle, frozen FIX-09 SPEC/PLAN/DECISIONS, generated contract
  output, interface files, C2-C4, package state, and `.hermes` paths are
  unchanged. Root `node_modules` is a directory and no directory named
  `node_modules` is a symlink.
- `git diff --check` is clean.

This report records C1 implementation evidence and does not constitute
acceptance of FIX-09.
