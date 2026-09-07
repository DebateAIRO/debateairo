# FIX-09 C1 round-eleven rework

Scope: the round-eleven C1 resolver-hook finding, its focused regression, and
this report only. This is not V acceptance and makes no claim about C2-C4,
merge readiness, or full FIX-09 completion.

## Review reproduction and root cause

The focused baseline passed 59/59 at reviewed head `4f3962d0`. The new
fresh-process regression was then added before product edits and failed with
the exact reviewed result:

```text
callbackCalls=1
environment=wrong
quickArm=ON
refused=false
descriptorRestored=true
hash=aa76b3fe955ca5d46bcdf05d7b8f78ac27c25341104bf0b3810b6fc833497ecd
```

`loader.ts` captured `import.meta.resolve`, but invoked it for the first time
inside `createPrivateZodValidator()`. Under the supported
`node --import tsx` runtime, that call entered tsx's registered ESM resolver.
The resolver read the synchronized live `node:url.fileURLToPath` binding, so a
self-restoring callback could change the injected environment after current
bundle validation began and before `custodian.ts` read the expected token.
The captured outer resolver identity therefore did not isolate the authority
operation from the loader hook's live dependencies.

## Correction

- `zod/package.json` is resolved and converted to a path exactly once during
  trusted loader module evaluation. The confined package directory and exact
  `index.cjs` entry are retained as module-private strings.
- Private Zod construction remains lazy and synchronous, but it receives only
  the retained paths. No host module resolver or tsx hook runs after a policy
  validation or repin begins.
- If the trusted Zod package cannot be resolved during initialization, that
  state is retained as `null`. Validation fails closed without a later
  resolution retry. This preserves the compiled hostile-preinitialization
  fixture, whose isolated output directory intentionally has no Zod package.
- The private VM, complete declared Zod schema, confined explicit-relative
  CommonJS graph, captured file/path/crypto/proxy capabilities, disabled
  string and wasm code generation, synchronous boolean boundary, and bounded
  public errors are unchanged.

The canonical bundle remains
`aa76b3fe955ca5d46bcdf05d7b8f78ac27c25341104bf0b3810b6fc833497ecd`.

## RED, GREEN, mutant, and neighbours

- Initial round-eleven RED: the self-restoring `fileURLToPath` replacement ran
  once, changed the environment from `correct` to `wrong`, and authorized the
  wrong-token `quick_arm: ON` proposal. No raw exception escaped, the exact
  descriptor restored, and the bundle hash stayed pinned.
- GREEN: the same fresh-process probe records zero callback calls, unchanged
  `correct` environment state, `REPIN_REFUSED`, no returned bundle, exact
  descriptor restoration, no raw escape, and the pinned hash.
- Restoring the reviewed lazy `RESOLVE_IMPORT("zod/package.json")` call as an
  exact harmful mutant failed the regression with the original one-call,
  changed-environment, armed-repin result. The eager-only implementation was
  restored before final verification.
- Safe neighbours remain green: normal declared-schema validation under tsx
  accepts the exact bundle, and the dependency-unavailable compiled-module
  hostile-preinitialization matrix imports successfully, calls none of its
  four hostile push variants, and returns bounded schema failure.

## Verification

- `pnpm exec vitest run tests/unit/fix09-bundle.test.ts --reporter=dot`:
  60/60 passed in each of three consecutive fresh processes.
- The thirteen resolver/schema/authority selections passed 13/13: hostile
  preinitialization push, normal tsx validation, cwd independence, CommonJS
  resolver isolation, the new live-`fileURLToPath` cross-call, Atomics and
  Worker absence, private regex/push isolation, the prior self-restoring
  callback isolation, captured crypto, current/request proxy rejection, and
  captured file reads.
- `node tests/unit/fixtures/fix09-independent-hash.mjs <
  tools/obs-listener/policy/bundle.json` emitted exact
  `aa76b3fe955ca5d46bcdf05d7b8f78ac27c25341104bf0b3810b6fc833497ecd`.
- `node node_modules/typescript/bin/tsc --project
  tests/unit/fixtures/fix09-interface-tsconfig.json --pretty false` exited 0;
  the frozen `TracerHook` and memberless `DispatchArm` interface remain exact.
- `node --import tsx packages/contract/src/generate.ts` exited 0 and
  `git diff --exit-code -- packages/contract/generated` was clean.
- `pnpm typecheck` returned only the same eight current diagnostics in
  `tests/unit/s14-ui.test.ts`: TS2307 twice, TS18046 twice, TS2339 twice, and
  TS7006 twice. No C1 diagnostic appeared.
- `pnpm audit:source` returned only the same three installer environment reads
  in `packages/obs-capture/install/api.ts`, `runner.ts`, and `scheduler.ts`.
  `pnpm audit:text-bytes` exited 0 with `REPOSITORY_TEXT_CONTROL_BYTES=0`.
- Static inspection found no inherited Hash chain, Worker, Atomics, shared
  buffer, typed signal, cwd lookup, CommonJS resolver, process launch, direct
  environment read, database import, `occurrence_detail`, provider access, or
  shared-prototype mutation in the three C1 policy modules. The only host
  module-resolution call is the initialization-time Zod package pin.
- The round-eleven delta is only `loader.ts`, the focused C1 test, and this
  regular report. No bundle, custodian/canonical/interface file, frozen
  SPEC/PLAN/DECISIONS, generated output, product source, C2-C4 file, package
  state, or `.hermes` path changed.

This report records C1 implementation evidence and does not constitute
acceptance of FIX-09.
