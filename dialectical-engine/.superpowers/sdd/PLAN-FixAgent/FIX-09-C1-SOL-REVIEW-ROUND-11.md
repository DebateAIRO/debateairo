# FIX-09 C1 Sol review — round 11

Review target: branch `codex/oa-fix-09`, commit
`4f3962d07bc336f9b3e92d06cd2c35ea6968ae5f`, reviewed as
`7045681b8990ab4acbdbda7e514c7b6905dc0868..4f3962d07bc336f9b3e92d06cd2c35ea6968ae5f`.
The original C1 base remains
`2b670d3059c60d7262cf655bd5d402c88100dff3`.

## Findings

### F1 — P1 — the captured ESM resolver still executes a live tsx resolver callback before custodian authentication

Affected code:

- `tools/obs-listener/policy/loader.ts:157,385-388,461-475`
- `tools/obs-listener/policy/custodian.ts:143-167`
- `tests/unit/fix09-bundle.test.ts:864-986`
- `.superpowers/sdd/PLAN-FixAgent/FIX-09-C1-ROUND-10-REWORK.md:63-75,111-126`

The latest patch removes `createRequire().resolve` and captures
`import.meta.resolve` in `RESOLVE_IMPORT`. That closes the exact live
`Module._resolveFilename` path, but calling the captured function lazily is not
an isolated resolution operation under the supported `node --import tsx`
runtime. It enters tsx's registered resolver hook. That hook reads its live
ESM binding of `node:url.fileURLToPath`, so synchronizing a changed CommonJS
export after loader initialization still installs a main-realm callback in the
first policy validation.

An independent fresh-process probe imported the C1 modules without validating
a policy, installed a preserving `node:url.fileURLToPath` replacement, and
called `syncBuiltinESMExports()`. On its first call from tsx's resolver hook,
the replacement changed the supplied environment's custodian token from
`correct` to `wrong`, restored the exact original descriptor, synchronized the
restoration, and delegated to the original function. `repin` had already begun
validating the current bundle, but had not yet read the expected token at
`custodian.ts:159`. It therefore authenticated the request's original `wrong`
token and returned the schema-valid proposed bundle with `quick_arm: ON`.

Three fresh processes produced the same result:

```text
callbackCalls=1 quickArm=ON refused=false escaped=null environment=wrong descriptorRestored=true hash=aa76b3fe955ca5d46bcdf05d7b8f78ac27c25341104bf0b3810b6fc833497ecd
callbackCalls=1 quickArm=ON refused=false escaped=null environment=wrong descriptorRestored=true hash=aa76b3fe955ca5d46bcdf05d7b8f78ac27c25341104bf0b3810b6fc833497ecd
callbackCalls=1 quickArm=ON refused=false escaped=null environment=wrong descriptorRestored=true hash=aa76b3fe955ca5d46bcdf05d7b8f78ac27c25341104bf0b3810b6fc833497ecd
```

A separate preserving wrapper captured the callback stacks. All calls came
from tsx's `getParentFilePath` / `resolveTsPathsSync` path beneath
`import.meta.resolve` at `loader.ts:387`; the private VM and private Zod module
graph themselves did not invoke the hostile function. A throwing replacement
instead made the valid bundle fail with `POLICY_BUNDLE_ZOD_INVALID`, confirming
that the lazy resolver remains a live validation dependency.

This violates FIX-09-R02's single-custodian requirement and defeats the
phase-one OFF requirements in FIX-09-R01/R12. It is the same cross-call class
as the `b57b1e3f` CommonJS-resolver finding, through the replacement ESM
resolution path rather than `Module._resolveFilename`.

Smallest acceptable correction: ensure no host resolver or loader hook runs
after a caller-controlled policy operation begins. For example, establish the
exact confined Zod package entry at module initialization and retain only the
resolved path for lazy private loading, or otherwise package the trusted
schema dependency without runtime resolution. Add the self-restoring
`fileURLToPath` cross-call above and require zero callback calls,
`REPIN_REFUSED`, unchanged `correct` environment state, exact descriptor
restoration, and the pinned hash.

## Verdicts

### SPEC: REWORK

F1 permits a caller without the recorded custodian token to repin a valid
`quick_arm: ON` bundle under the supported tsx runtime. FIX-09-R02 and the OFF
posture in FIX-09-R01/R12 are therefore unsatisfied.

### CODE QUALITY: REWORK

The private synchronous VM correctly isolates schema execution, but its lazy
bootstrap is not isolated end to end. Capturing `import.meta.resolve` freezes
the outer function identity, not the registered resolver hook or that hook's
live builtin dependencies. The new resolver regression mutates only
`Module._resolveFilename`, so it is green while the equivalent ESM-hook
callback remains reachable.

This is a C1 review only. It is not V acceptance and makes no claim about
C2-C4, merge readiness, or full FIX-09 completion.

## Round-ten and follow-up finding disposition

- Round-ten F1 is closed for the exact self-restoring
  `RegExp.prototype.test` to `Array.prototype.push` to live-crypto route. The
  focused regression observed zero main-realm regex, push, or forged-hash
  calls, refused the wrong token, retained the exact native descriptors, and
  kept the pinned hash. F1 above is a separate callback in the lazy resolver
  bootstrap.
- Round-ten F2 is closed for all four pre-initialization push shapes. Fresh
  compiled-module processes imported successfully, returned bounded schema
  failure, executed zero hostile getters/functions, and exposed no raw error.
- The `Hash.prototype.update` / `digest` paths remain closed. Canonical and
  token hashing use captured one-shot `crypto.hash` calls, and direct live
  `crypto.hash` / `timingSafeEqual` replacement plus builtin synchronization
  executed zero forged calls.
- The worker correction was removed. Current validation is synchronous and
  contains no Worker, `SharedArrayBuffer`, typed signal, Atomics, timeout,
  current-working-directory resolution, or function-source transport. The
  only `Function.prototype.toString` use is the isolated native-push identity
  comparison at initialization; no serialized function is moved into the
  private validator.
- The private VM owns the Zod module graph, schema literals, regular
  expressions, callbacks, and `JSON.parse`; string and wasm code generation
  are disabled. The exact valid bundle succeeds, and the Zod-specific unsafe
  integer is rejected.
- Captured `isProxy` still rejects current-bundle and request proxies before
  traps after live export synchronization. Captured `readFileSync` still reads
  the pinned OFF bundle, and captured crypto calls remain authoritative.
- The latest patch closes live CommonJS `Module._resolveFilename` use: the
  focused test recorded zero forged resolver calls and successful exact-bundle
  validation. F1 shows that this does not close transitive live callbacks in
  the supported ESM resolver hook.

## Carried-boundary evidence

- `pnpm exec vitest run tests/unit/fix09-bundle.test.ts --reporter=dot`:
  **59/59 passed** in each of three consecutive fresh processes.
- The twelve round-ten/eleven authority selections passed **12/12**: hostile
  pre-init push, normal tsx validation, cwd independence, CommonJS resolver
  isolation, Atomics and Worker absence, private regex/push isolation,
  self-restoring callback isolation, captured crypto, current/request proxy
  rejection, and captured file reads.
- Six safe neighbours passed **6/6**: the complete phase-one policy,
  unreachable `Object.prototype.push`, the enumerated floor with adjacent
  clear paths, lawful deferred-slot repin, second-custodian rejection, and the
  frozen interface.
- The loader-independent fixture emitted exactly
  `aa76b3fe955ca5d46bcdf05d7b8f78ac27c25341104bf0b3810b6fc833497ecd`.
- The frozen-interface compiler exited 0. `DispatchArm` is the exact 32-byte
  memberless export, and the independently declared `TracerHook` shape is
  unchanged.
- `node --import tsx packages/contract/src/generate.ts` exited 0 and
  `git diff --exit-code -- packages/contract/generated` was clean.
- `pnpm typecheck` returned only the same eight current diagnostics in
  `tests/unit/s14-ui.test.ts`; no C1 diagnostic appeared.
- The direct source audit returned only the same three installer environment
  reads. The direct text-byte audit exited 0 with
  `REPOSITORY_TEXT_CONTROL_BYTES=0`.
- The full focused suite retains the floor, proxy, revoked-proxy, duplicate
  JSON member, exact own-data snapshot, numeric prototype, Zod unsafe-integer,
  custody, canonical serialization, and interface regressions.

## Mutation and static evidence

- In an isolated archive, skipping `validateWithDeclaredSchema` made the
  unsafe-integer authority test fail **1/1** because the manual preflight
  accepted `Number.MAX_SAFE_INTEGER + 1`.
- In a second isolated archive, restoring the `b57b1e3f` CommonJS resolution
  path made the current resolver-isolation test fail **1/1**, with one forged
  `_resolveFilename` call and schema failure.
- The self-restoring live-`fileURLToPath` attack is harmful in three of three
  fresh processes while all 59 committed tests remain green. Descriptor
  restoration and an exact clean hash distinguish it from dirty-process or
  persistent-mutation artifacts.
- Static inspection found no `createHash`, inherited Hash member call,
  Worker, Atomics, shared buffer, typed signal, cwd lookup, CommonJS resolver,
  process launch, direct environment read, database import,
  `occurrence_detail`, model/provider access, or shared-prototype mutation in
  the three changed policy modules.
- The reviewed range contains exactly the round-ten rework report, focused
  test, `canonical.ts`, `custodian.ts`, and `loader.ts`; all are regular files.
  `git diff --check 7045681b..4f3962d0` is clean. Root `node_modules` is a
  directory and no nested directory named `node_modules` is a symlink. No
  bundle, frozen SPEC/PLAN/DECISIONS, generated file, product file, C2-C4 file,
  or `.hermes` path changed.

## Post-report state

This review wrote only this round-eleven Sol report. It did not edit product,
tests, fixtures, package state, frozen authority, generated output, or
`.hermes`, and it performed no V acceptance, merge, push, or external-state
operation.
