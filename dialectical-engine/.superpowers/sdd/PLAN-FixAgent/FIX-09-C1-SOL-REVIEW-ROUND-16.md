# FIX-09 C1 Sol review — round 16

Review target: branch `codex/oa-fix-09`, commit
`77978e4b5e8ac4ceb3f8e7bc298df3e9bd9d336d`, reviewed as
`b1d3d2f5d9faf34877fef1049123783036d98400..77978e4b5e8ac4ceb3f8e7bc298df3e9bd9d336d`,
with the round-fifteen delta
`61812db4e3cb86ca3f6a0b1405394ea944036336..77978e4b5e8ac4ceb3f8e7bc298df3e9bd9d336d`
reviewed separately. Runtime evidence below is from Node `v22.23.1` with
`tsx`.

## Findings

### P0

None.

### F1 — P1 — derived-error `super()` remains a caller-mutable constructor dispatch and permits wrong-token repin

Round fifteen removes the reported inherited `name` setters and makes its
descriptor and VM option records null-prototype data. It does not close the
adjacent implicit constructor dispatch in the same failure path:

- `tools/obs-listener/policy/custodian.ts:46-50` declares the exported
  `RepinRefusedError extends Error` and executes `super()` whenever a request
  is refused;
- `tools/obs-listener/policy/loader.ts:1159-1163` does the same for
  `PolicyBundleSchemaError`, whose constructor is recoverable from the error
  returned by the exported `policyBundleSchema.safeParse` at lines
  1271-1312;
- `tools/obs-listener/policy/loader.ts:1316-1320` does the same for the
  exported `PolicyBundleLoadError`.

A derived constructor's `super()` resolves the superclass through the
derived constructor object's current internal `[[Prototype]]`. Those
constructor objects are not frozen or otherwise pinned. A caller can
therefore replace that relation after trusted module initialization with
`Object.setPrototypeOf`, causing caller code to execute when C1 constructs a
bounded error. Restoring the exact original relation before re-entry makes
the replacement self-removing and leaves the ordinary outward error shape
intact.

The first fresh-process reproduction replaced only the exported
`RepinRefusedError` superclass relation. Its hostile superclass changed the
injected token from `correct` to `wrong`, restored the exact original
superclass identity, re-entered `repin()` with the same clean current bundle
and a schema-valid `quick_arm: ON` proposal, then delegated to the original
`Error` constructor. All three runs returned identically:

```text
callbackCalls=1
environment=wrong
quickArm=ON
reentrantError=null
outerError={isExpectedInstance:true,name:RepinRefusedError,code:REPIN_REFUSED,message:REPIN_REFUSED}
superRestored=true
hash=aa76b3fe955ca5d46bcdf05d7b8f78ac27c25341104bf0b3810b6fc833497ecd
```

Thus even an ordinary wrong-token refusal is an authorization callback: the
outer call still appears correctly refused while the inner wrong-token call
has already returned the armed bundle.

A second three-run variant obtained the non-exported schema-error constructor
from `policyBundleSchema.safeParse({}).error.constructor`, replaced its
superclass relation, and installed a preserving `Array.prototype.some`
replacement to enter schema failure before token capture at
`custodian.ts:174-186`. The hostile superclass restored both its exact
original superclass identity and the exact original `some` descriptor before
re-entry. All three runs returned:

```text
callbackCalls=1
environment=wrong
quickArm=ON
reentrantError=null
outerError={isExpectedInstance:true,name:RepinRefusedError,code:REPIN_REFUSED,message:REPIN_REFUSED}
schemaSuperRestored=true
someRestored=true
hash=aa76b3fe955ca5d46bcdf05d7b8f78ac27c25341104bf0b3810b6fc833497ecd
```

The same derived-super bug class also defeats raw-error containment. In three
fresh processes, replacing the exported `PolicyBundleLoadError` superclass with a
self-restoring constructor that throws, then calling `loadBundle()` on a
missing path, produced:

```text
callbackCalls=1
escaped={isPolicyLoadError:false,name:SyntaxError,code:null,message:RAW_CONSTRUCTOR_CALLBACK}
superRestored=true
```

The static authority guard at
`tests/unit/fix09-bundle.test.ts:1753-1980` passes because it recognizes
enumerated explicit ambient roots, `this` property assignment, selected
descriptor/VM option shapes, and one runtime-created callable shape. It does
not model derived `super()` resolution or require an invoked error
constructor's superclass relation to be immutable. The seven committed
round-fifteen cases therefore pass while all three live variants above remain
reachable.

This violates FIX-09-R02: a caller without the original custodian token can
obtain a repinned bundle. Returning `quick_arm: ON` also violates the
phase-one OFF requirements in FIX-09-R01/R12. The load variant separately
shows that the claimed bounded error conversion is not systemic.

Smallest acceptable correction: remove caller-mutable derived-super dispatch
from every C1 error path, or make every invoked derived error constructor's
superclass relation immutable during trusted initialization before any
constructor or error instance is exposed. Add exact supported-runtime
regressions for the exported refusal constructor, the schema-error constructor
recoverable through `safeParse`, and the load-error constructor. The repin
cases must require zero callbacks, unchanged `correct`, no returned bundle,
exact `REPIN_REFUSED`, exact restoration, no raw escape, and the pinned hash;
the load case must require a `PolicyBundleLoadError` and no hostile callback.
If the static guard continues to claim the systemic ambient-authority
invariant, it must also reject an unpinned derived-super edge.

### P2

None.

### P3

None.

## Verdicts

### SPEC: REWORK

F1 leaves a wrong-token repin authority bypass and violates FIX-09-R02 plus
the phase-one OFF requirements in FIX-09-R01/R12.

### CODE QUALITY: REWORK

The round-fifteen ordinary/inherited `[[Set]]`, property-descriptor
conversion, VM option parsing, and generated-name corrections are effective
for their exact cases, but the systemic authority claim and static guard omit
the adjacent mutable derived-super constructor dispatch. The load-error
variant also escapes the typed error boundary as a raw `SyntaxError`.

This is a C1 review only. It is not V acceptance and makes no claim about
C2-C4, merge readiness, or full FIX-09 completion.

## Verification evidence

- The full focused command
  `pnpm exec vitest run tests/unit/fix09-bundle.test.ts --reporter=dot`
  passed 74/74 in a fresh process.
- The exact round-fifteen selection — the two inherited error-name setters,
  two inherited descriptor getters, two inherited VM-option getters, and the
  static ambient-authority guard — passed 7/7 in each of three consecutive
  fresh processes.
- Independent bounded live mutants reproduced the exported refusal-class
  wrong-token bypass 3/3, the recoverable schema-error-class wrong-token
  bypass 3/3, and the load-error raw escape 3/3. Every mutant ran in its own
  process; no repository file or shared parent-process prototype was changed.
- The focused suite also passed the ordinary/inherited `[[Set]]`, explicit
  callable capture, Object reflection, resolver/file-URL, array
  push/iterator, semantic hash, captured crypto/`isProxy`/file-read,
  private-VM Zod, floor, schema, proxy, duplicate-key, one-custodian,
  phase-one OFF, and frozen-interface regressions. Source inspection confirms
  the round-fifteen null-prototype data descriptors at
  `canonical.ts:42-54`, `custodian.ts:25-37`, and `loader.ts:85-97`, plus the
  complete supported-Node context/script option records at
  `loader.ts:443-500`. The runtime-created named helpers reported in round
  fifteen are now module-initialized; the remaining private-require function
  created at `loader.ts:502-521` is anonymous and does not invoke the
  supported `tsx` name-definition helper in the exact regressions.
- Independent hashing emitted exact
  `aa76b3fe955ca5d46bcdf05d7b8f78ac27c25341104bf0b3810b6fc833497ecd`.
  A fresh declared-schema parse emitted the same hash, `quick_arm: OFF`, an
  empty allowlist, exactly one custodian `{id: V,
  token_env: OBS_POLICY_CUSTODIAN_TOKEN}`, and all three deferred slots as
  `null` with gates `RP-1`, `RP-2`, and `RP-3`.
- Frozen-interface TypeScript compilation exited 0. `DispatchArm` remains
  memberless and `TracerHook` retains its frozen shape.
- The frozen FIX-09 SPEC/PLAN/DECISIONS and `packages/contract/generated`
  have empty diffs across the complete review range. The policy bundle,
  dispatch-arm interface, tracer interface, interface fixtures, `package.json`,
  and `pnpm-lock.yaml` also have empty diffs across both the complete range
  and round-fifteen delta.
- `pnpm typecheck` returned only the same eight diagnostics in the unchanged
  `tests/unit/s14-ui.test.ts`: TS2307 twice, TS18046 twice, TS2339 twice, and
  TS7006 twice. No C1 diagnostic appeared.
- The package-script form of each repository audit was blocked by sandboxed
  `tsx` IPC (`listen EPERM`). Running the same entry points with the supported
  `node --import tsx` runtime returned only the same three source-audit
  findings in `packages/obs-capture/install/api.ts`, `runner.ts`, and
  `scheduler.ts`; the text-byte audit exited 0 with
  `REPOSITORY_TEXT_CONTROL_BYTES=0`.
- A focused forbidden-source scan found no inherited Hash member call,
  Worker, Atomics, shared buffer, cwd lookup, CommonJS resolver hook, process
  launch, direct environment read, database/provider import,
  `occurrence_detail`, or product-side shared-prototype mutation in
  `loader.ts`, `canonical.ts`, or `custodian.ts`.
- Both requested diffs pass `git diff --check`. The complete range contains
  only the round-fourteen and round-fifteen implementation reports, the
  focused C1 test, and the three C1 policy modules. The round-fifteen delta
  contains only its implementation report, that test, and those three
  modules; all are regular files.

## Post-report state

This fresh independent Sol review changed only this round-sixteen report. It
did not modify product code, tests, fixtures, package state, frozen authority,
generated output, checkout/index/HEAD, or the pre-existing untracked review
reports, and performed no Hermes, V acceptance, C2-C4, merge, push, board, or
external-state operation.
