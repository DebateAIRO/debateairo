# FIX-09 C1 Sol review — round 13

Review target: branch `codex/oa-fix-09`, commit
`b419451ddde5529c9f1378517df27194943a9527`, reviewed as
`d7891ee78ff3834c228ece3d8e1c0efc8cff994b..b419451ddde5529c9f1378517df27194943a9527`.

## Findings

### F1 — P1 — adjacent live reflection bindings still run before custodian authentication

Affected code:

- `tools/obs-listener/policy/loader.ts:1075-1087,1157-1176`
- `tools/obs-listener/policy/canonical.ts:129-209`
- `tools/obs-listener/policy/custodian.ts:144-170`
- `tests/unit/fix09-bundle.test.ts:1092-1198,2566-2620`
- `.superpowers/sdd/PLAN-FixAgent/FIX-09-C1-ROUND-12-REWORK.md:31-41,103-108`

The patch captures the singular `Object.getOwnPropertyDescriptor` function in
all three owning modules, but the complete pre-authentication path is still
not restricted to trusted-initialization reflection capabilities. Before
`repin` reads the expected token, current-bundle validation calls the live
`Object.getOwnPropertyNames` binding in `hasNumericArrayPrototypePollution()`.
It then reaches the live `Object.getOwnPropertyDescriptors` binding while
`canonicalProjection()` snapshots nested arrays and records.

Two bounded preserving variants independently replaced one of those live
bindings after all C1 modules initialized. On the replacement's first call,
it changed the injected environment token from `correct` to `wrong`, restored
the exact original helper descriptor, and delegated to the original helper.
For both `Object.getOwnPropertyNames` and
`Object.getOwnPropertyDescriptors`, three fresh processes produced:

```text
callbackCalls=1 environment=wrong quickArm=ON refused=false escaped=null descriptorRestored=true hash=aa76b3fe955ca5d46bcdf05d7b8f78ac27c25341104bf0b3810b6fc833497ecd
callbackCalls=1 environment=wrong quickArm=ON refused=false escaped=null descriptorRestored=true hash=aa76b3fe955ca5d46bcdf05d7b8f78ac27c25341104bf0b3810b6fc833497ecd
callbackCalls=1 environment=wrong quickArm=ON refused=false escaped=null descriptorRestored=true hash=aa76b3fe955ca5d46bcdf05d7b8f78ac27c25341104bf0b3810b6fc833497ecd
```

The callbacks preserve the returned reflection data, so current-bundle
validation succeeds. `custodian.ts` subsequently reads the changed expected
token, authenticates the request's original `wrong` token, validates the
schema-valid proposal, and returns `quick_arm: ON`. The exact original helper
descriptor is present afterwards, the environment change is the only retained
side effect, no raw exception escapes, and the clean bundle still hashes to
the independent `aa76...497ecd` pin.

This is the same cross-call authority failure as round twelve through two
immediately adjacent reflection bindings. It is also visible in the committed
suite: the numeric-prototype time-of-check regression intentionally installs a
live `Object.getOwnPropertyDescriptors` callback and asserts that the callback
runs. That fail-closed prototype test does not cover a callback which changes
custody state while returning the original descriptors.

Smallest acceptable correction: make every main-realm reflection operation
reachable during current-bundle validation and custody use a
trusted-initialization capability, including the two reproduced bindings.
Extend the exact self-restoring cross-call matrix to require zero callback
calls, unchanged `correct` environment state, `REPIN_REFUSED`, no returned
bundle, exact helper-descriptor restoration, no raw escape, and the pinned
hash for each retained authority-path helper.

## Verdicts

### SPEC: REWORK

F1 lets a caller without V's recorded custodian token install a valid
`quick_arm: ON` bundle. FIX-09-R02's single-custodian requirement and the
phase-one OFF posture in FIX-09-R01/R12 remain unsatisfied.

### CODE QUALITY: REWORK

The exact singular descriptor seam is correctly captured across the loader,
canonicalizer, and custodian, but the correction protects a function name
rather than the end-to-end reflection authority boundary. Equivalent adjacent
bindings still execute caller-installed code between validation start and
token capture, and the focused regression asserts only the singular helper.

This is a C1 review only. It is not V acceptance and makes no claim about
C2-C4, merge readiness, or full FIX-09 completion.

## Round-twelve finding disposition

- The exact self-restoring live `Object.getOwnPropertyDescriptor` replacement
  is closed. Three fresh processes each recorded zero hostile calls, unchanged
  `correct` environment state, `REPIN_REFUSED`, no returned bundle, exact
  descriptor restoration, no raw escape, and hash
  `aa76b3fe955ca5d46bcdf05d7b8f78ac27c25341104bf0b3810b6fc833497ecd`.
- `loader.ts`, `canonical.ts`, and `custodian.ts` each capture the singular
  descriptor reader during module initialization. All later source-level
  singular descriptor reads, including descriptor-map entries, active-array
  entries, nested array items, register-seed keys, descriptor-field checks,
  request/prototype traversal, environment tokens, and custodian selection,
  use the owning module's capture.
- The remaining textual singular call in `loader.ts` is inside a private-realm
  initializer created and run during trusted module initialization; it is not
  reached after a policy operation begins.
- Reintroducing the exact live singular lookup in loader `ownArrayLength`
  made the new committed regression fail 1/1 with one callback, environment
  `wrong`, `quick_arm: ON`, no refusal, exact descriptor restoration, no raw
  escape, and the pinned hash.
- The eager Zod resolver pin, private synchronous VM/Zod graph, hostile
  pre-initialization and mid-parse push containment, captured hash/crypto,
  captured `isProxy`, captured file reads, CommonJS and ESM resolver
  isolation, proxy rejection, numeric-prototype floor, unsafe-integer
  rejection, duplicate-member rejection, path/glob floor, and frozen
  interfaces remain green. F1 is an adjacent live-binding defect.

## Verification evidence

- Full focused suite, three consecutive fresh runs:
  `pnpm exec vitest run tests/unit/fix09-bundle.test.ts --reporter=dot` —
  **61/61 passed** each time.
- Exact round-twelve live-descriptor selection, three consecutive fresh runs —
  **1/1 passed** each time.
- The 22-test authority selection passed **22/22**: inherited Hash,
  pre-initialization and mid-parse push, supported-runtime and cwd-independent
  Zod, CommonJS and ESM-hook resolver isolation, file-URL and singular
  descriptor isolation, unsafe integer/Atomics, Worker absence, private
  regex/push and self-restoring Zod callbacks, captured crypto, both proxy
  checks, captured file reads, wrong-token refusal, floor, duplicate JSON,
  top-level/nested proxies, request descriptor proxies, and frozen interfaces.
- Ten bounded safe neighbours passed **10/10**: the complete phase-one bundle,
  supported-runtime and cwd-independent Zod, unreachable
  `Object.prototype.push`, semantic hash ordering, lawful null-prototype data,
  non-index numeric spellings, lawful deferred-slot repin, second-custodian
  rejection, and the frozen interface.
- The loader-independent fixture emitted exactly
  `aa76b3fe955ca5d46bcdf05d7b8f78ac27c25341104bf0b3810b6fc833497ecd`.
- The frozen-interface compiler exited 0. `DispatchArm` remains the exact
  32-byte memberless export, and `TracerHook` retains its ten-verdict shape.
- `node --import tsx packages/contract/src/generate.ts` exited 0 and
  `git diff --exit-code -- packages/contract/generated` was clean.
- `pnpm typecheck` returned only the same eight existing diagnostics in
  `tests/unit/s14-ui.test.ts`: TS2307 twice, TS18046 twice, TS2339 twice, and
  TS7006 twice. No C1 diagnostic appeared.
- `pnpm audit:source` returned only the same three installer environment reads
  in `packages/obs-capture/install/api.ts`, `runner.ts`, and `scheduler.ts`.
  `pnpm audit:text-bytes` exited 0 with
  `REPOSITORY_TEXT_CONTROL_BYTES=0`.

## Mutation, static, and scope evidence

- The exact singular-call mutant described above is killed by the focused
  regression with the round-twelve harmful outcome.
- The two live-reflection variants are harmful in three of three fresh
  processes each while all 61 committed tests remain green. Exact helper
  restoration and the clean independent hash distinguish them from persistent
  mutation or dirty-process artifacts.
- Static inspection found the singular capture and all its main-realm uses in
  each owning module. It also found the two uncaptured live plural descriptor
  reads at `canonical.ts:147,187` and the uncaptured live property-name read at
  `loader.ts:1077` which the independent variants exercised.
- Static inspection found no inherited Hash member call, Worker, Atomics,
  shared buffer, typed signal, cwd lookup, CommonJS resolver, process launch,
  direct environment read, database import, `occurrence_detail`, model/provider
  access, or shared-prototype mutation in the three C1 policy modules. The only
  host package resolution remains the trusted-initialization Zod pin.
- The reviewed range contains exactly the round-twelve rework report, focused
  C1 test, `canonical.ts`, `custodian.ts`, and `loader.ts`; all are regular
  files. `git diff --check d7891ee7..b419451d` is clean. No frozen
  SPEC/PLAN/DECISIONS, bundle, generated output, interface file, product
  source, C2-C4 file, package state, or `.hermes` path changed. Root
  `node_modules` is a directory, and no directory named `node_modules` is a
  symlink.

## Post-report state

This review wrote only this round-thirteen Sol report. It did not edit product,
tests, fixtures, package state, frozen authority, generated output, or
`.hermes`, and it performed no V acceptance, merge, push, or external-state
operation.
