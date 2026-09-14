# FIX-09 C1 Sol review — round 12

Review target: branch `codex/oa-fix-09`, commit
`d7891ee78ff3834c228ece3d8e1c0efc8cff994b`, reviewed as
`4f3962d07bc336f9b3e92d06cd2c35ea6968ae5f..d7891ee78ff3834c228ece3d8e1c0efc8cff994b`.
The original C1 base remains
`2b670d3059c60d7262cf655bd5d402c88100dff3`.

## Findings

### F1 — P1 — a live main-realm descriptor helper still executes before custodian authentication

Affected code:

- `tools/obs-listener/policy/loader.ts:499-507,1074-1086,1156-1163`
- `tools/obs-listener/policy/custodian.ts:135-167`
- `tests/unit/fix09-bundle.test.ts:988-1090`

The round-eleven correction closes the exact lazy `import.meta.resolve` and
`node:url.fileURLToPath` route, but a policy operation still calls mutable
main-realm `Object` methods through live property lookups. In particular,
`repin` validates the current bundle before it snapshots the expected token.
That validation enters `hasPolicyPrototypeMutation()`, whose array inspection
reaches the live `Object.getOwnPropertyDescriptor` binding through
`ownArrayLength()`.

An independent fresh-process probe imported `custodian.ts` and its loader,
without validating a policy, then installed a preserving replacement for
`Object.getOwnPropertyDescriptor`. On its first call after `repin` began, the
replacement changed the injected environment token from `correct` to `wrong`,
restored the exact original descriptor, and delegated to the original
function. Current-bundle validation succeeded. `custodian.ts` then read the
changed expected token, authenticated the request's original `wrong` token,
validated the proposed bundle, and returned `quick_arm: ON`.

Three fresh processes produced the same result:

```text
callbackCalls=1 quickArm=ON refused=false escaped=null environment=wrong descriptorRestored=true hash=aa76b3fe955ca5d46bcdf05d7b8f78ac27c25341104bf0b3810b6fc833497ecd
callbackCalls=1 quickArm=ON refused=false escaped=null environment=wrong descriptorRestored=true hash=aa76b3fe955ca5d46bcdf05d7b8f78ac27c25341104bf0b3810b6fc833497ecd
callbackCalls=1 quickArm=ON refused=false escaped=null environment=wrong descriptorRestored=true hash=aa76b3fe955ca5d46bcdf05d7b8f78ac27c25341104bf0b3810b6fc833497ecd
```

This is not a persistent dirty-process artifact: the exact original
descriptor was present after the call, the canonical bundle hash remained
pinned, and no raw exception escaped. All 60 committed focused tests remain
green in the same reviewed tree.

This violates FIX-09-R02's single-custodian requirement and defeats the
phase-one OFF posture in FIX-09-R01/R12. It is the same cross-call authority
class as the round-ten and round-eleven findings, now through an uncaptured
main-realm intrinsic rather than a Node loader hook.

Smallest acceptable correction: ensure the complete pre-authentication
validation and custody path uses only trusted-initialization captures for its
main-realm intrinsic operations, including the descriptor operation
demonstrated above. Add this exact self-restoring cross-call and require zero
callback calls, unchanged `correct` environment state, `REPIN_REFUSED`, no
returned bundle, exact descriptor restoration, no raw escape, and the pinned
hash. Correct the authority path rather than special-casing the single
observed call site, because the same live descriptor binding is used in the
loader, canonicalizer, and custodian.

## Verdicts

### SPEC: REWORK

F1 permits a caller without V's recorded custodian token to install a valid
`quick_arm: ON` policy. FIX-09-R02 and the phase-one OFF requirements in
FIX-09-R01/R12 remain unsatisfied.

### CODE QUALITY: REWORK

The Zod package pin is now initialization-only and the exact round-eleven
loader-hook regression is closed, but the authority boundary still depends on
a mutable main-realm helper before token capture. The focused suite protects
selected prototypes and imported Node capabilities without protecting this
equivalent intrinsic binding.

This is a C1 review only. It is not V acceptance and makes no claim about
C2-C4, merge readiness, or full FIX-09 completion.

## Round-eleven finding disposition

- Round-eleven F1 is closed for the exact self-restoring live
  `node:url.fileURLToPath` mutation. An independent probe observed zero
  callback calls, unchanged `correct` environment state, `REPIN_REFUSED`, no
  returned bundle, exact descriptor restoration, no raw escape, and hash
  `aa76b3fe955ca5d46bcdf05d7b8f78ac27c25341104bf0b3810b6fc833497ecd`.
- The package and entry pins occur at loader initialization only:
  `RESOLVE_IMPORT("zod/package.json")` and `FILE_URL_TO_PATH(...)` occur only
  in the top-level initializer, while `index.cjs` is derived there and retained
  as a private string. No `createRequire`, `_resolveFilename`, or later
  `import.meta.resolve` call exists in the loader.
- The dependency-unavailable compiled-module matrix imports successfully,
  invokes none of four hostile pre-initialization `Array.prototype.push`
  variants, and returns bounded schema failure. The retained unavailable state
  has no lazy host-resolver retry.
- Private-VM construction remains synchronous with string and wasm code
  generation disabled. The exact valid bundle succeeds, and the Zod-specific
  unsafe integer remains rejected.
- The Hash prototype, captured one-shot crypto, captured proxy checks,
  captured file reads, CommonJS resolver, pre-initialization and mid-parse
  push, wrong-token, raw-error, floor, duplicate-member, proxy, and frozen
  interface regressions remain green. F1 is a separate live intrinsic binding.

## Verification evidence

- Full focused suite, three consecutive fresh runs:
  `pnpm exec vitest run tests/unit/fix09-bundle.test.ts --reporter=dot` —
  **60/60 passed** each time.
- The exact round-eleven regression, three consecutive selections — **1/1
  passed** each time. The independent output included the exact error object
  `{code:"REPIN_REFUSED", message:"REPIN_REFUSED",
  name:"RepinRefusedError"}`.
- A 21-test authority selection passed **21/21**: inherited Hash,
  pre-initialization and mid-parse push, supported-runtime and cwd-independent
  Zod, CommonJS and ESM-hook resolver isolation, unsafe integer/Atomics,
  Worker absence, self-restoring Zod callbacks, captured crypto, both proxy
  checks, captured file reads, wrong-token refusal, floor, duplicate JSON,
  top-level/nested proxies, and frozen interfaces.
- Ten bounded safe neighbours passed **10/10**: the complete phase-one bundle,
  supported-runtime and cwd-independent Zod, unreachable
  `Object.prototype.push`, semantic hash ordering, lawful null-prototype data,
  non-index numeric spellings, lawful deferred-slot repin, second-custodian
  rejection, and the frozen interface.
- The loader-independent fixture emitted exactly
  `aa76b3fe955ca5d46bcdf05d7b8f78ac27c25341104bf0b3810b6fc833497ecd`.
- The frozen-interface compiler exited 0. `DispatchArm` remains the exact
  32-byte memberless export, and the ten-verdict `TracerHook` shape is
  unchanged.
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

- In an isolated archive, restoring the exact reviewed lazy
  `RESOLVE_IMPORT("zod/package.json")` implementation made the new regression
  fail **1/1** with one callback, changed environment, `quick_arm: ON`, no
  refusal, exact descriptor restoration, and the pinned hash.
- In the isolated archive, bypassing `validateWithDeclaredSchema` made the
  unsafe-integer authority test fail **1/1** because the manual preflight
  accepted `Number.MAX_SAFE_INTEGER + 1`. The temporary archive was removed.
- Static inspection found exactly one host package-resolution call and one URL
  conversion, both in the top-level Zod initializer. It found no `createHash`,
  inherited Hash member call, Worker, Atomics, shared buffer, typed signal, cwd
  lookup, CommonJS resolver, process launch, direct environment read, database
  import, `occurrence_detail`, model/provider access, or shared-prototype
  mutation in the three C1 policy modules.
- The reviewed range contains exactly the round-eleven rework report, focused
  test, and `loader.ts`; all are regular files. `git diff --check
  4f3962d0..d7891ee7` is clean. No frozen SPEC/PLAN/DECISIONS, bundle,
  canonical/custodian/interface file, generated output, product source, C2-C4
  file, package state, or `.hermes` path changed. Root `node_modules` is a
  directory, and no directory named `node_modules` is a symlink.

## Post-report state

This review wrote only this round-twelve Sol report. It did not edit product,
tests, fixtures, package state, frozen authority, generated output, or
`.hermes`, and it performed no V acceptance, merge, push, or external-state
operation.
