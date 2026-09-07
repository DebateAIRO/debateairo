# FIX-09 C1 round-twelve rework

Scope: the round-twelve C1 live-descriptor finding, its focused regression,
the three owning policy modules, and this report only. The rework base is
`d7891ee78ff3834c228ece3d8e1c0efc8cff994b`. This is not V acceptance and
makes no claim about C2-C4, merge readiness, or full FIX-09 completion.

## Review reproduction and root cause

The focused baseline passed 60/60 at the reviewed head. The new fresh-process
regression was added before product edits and failed with the exact reviewed
result:

```text
callbackCalls=1
environment=wrong
quickArm=ON
refused=false
descriptorRestored=true
escaped=null
hash=aa76b3fe955ca5d46bcdf05d7b8f78ac27c25341104bf0b3810b6fc833497ecd
```

`loader.ts`, `canonical.ts`, and `custodian.ts` each looked up
`Object.getOwnPropertyDescriptor` through the live main-realm `Object` after
trusted module initialization. `repin` validates the current bundle before it
reads the expected token. Its first live descriptor lookup entered the
self-restoring replacement, which changed the injected environment from
`correct` to `wrong`; custody then authenticated the request's original
`wrong` token and returned the schema-valid `quick_arm: ON` proposal.

## Correction

- Each owning policy module captures its own private
  `Object.getOwnPropertyDescriptor` capability during trusted module
  initialization.
- Every main-realm use of that exact descriptor primitive in the loader,
  canonicalizer, and custodian now goes through the owning module's capture.
- The one textual `Object.getOwnPropertyDescriptor` use that remains in
  `loader.ts` is inside the private-realm native-push initializer source. It is
  constructed and invoked during trusted initialization and cannot dispatch
  the later main-realm replacement.
- No global descriptor or prototype is changed by production code. The
  private synchronous VM, confined Zod graph, initialization-only resolver,
  captured crypto/proxy/file capabilities, numeric-prototype checks, schema,
  canonical projection, and frozen interfaces are otherwise unchanged.

The canonical bundle remains
`aa76b3fe955ca5d46bcdf05d7b8f78ac27c25341104bf0b3810b6fc833497ecd`.

## RED, GREEN, mutant, and neighbours

- Initial round-twelve RED: the self-restoring descriptor replacement ran
  once, changed the environment to `wrong`, authorized the wrong-token armed
  proposal, restored the exact original descriptor, emitted no raw escape,
  and retained the pinned bundle hash.
- GREEN: the same fresh-process probe records zero callback calls, unchanged
  `correct` environment state, `REPIN_REFUSED`, no returned bundle, exact
  descriptor restoration, no raw escape, and the pinned hash.
- Reintroducing the exact live
  `Object.getOwnPropertyDescriptor(value, "length")` lookup in loader
  `ownArrayLength` made the regression fail with the original one-call,
  changed-environment, armed-repin result. The captured call was restored
  before final verification.
- Safe neighbours remain green: the supported tsx/Zod validation path accepts
  the exact bundle, and a correct-token custodian can populate the lawful
  deferred hash slot without changing its gate.

## Verification

- `pnpm exec vitest run tests/unit/fix09-bundle.test.ts --reporter=dot`:
  61/61 passed in each of three consecutive fresh processes.
- The exact live-descriptor selection passed 1/1 in each of three fresh
  processes.
- The 22-test authority selection passed 22/22: inherited Hash,
  pre-initialization and mid-parse push, supported-runtime and cwd-independent
  Zod, CommonJS and ESM-hook resolver isolation, the new live-descriptor
  isolation, unsafe integer/Atomics, Worker absence, private regex/push,
  self-restoring Zod callbacks, captured crypto, both proxy checks, captured
  file reads, wrong-token refusal, floor, duplicate JSON, top-level/nested
  proxies, and the frozen interface.
- Ten bounded safe neighbours passed 10/10: the complete phase-one bundle,
  supported-runtime and cwd-independent Zod, unreachable
  `Object.prototype.push`, semantic hash ordering, lawful null-prototype data,
  non-index numeric spellings, lawful deferred-slot repin, second-custodian
  rejection, and the frozen interface.
- `node tests/unit/fixtures/fix09-independent-hash.mjs <
  tools/obs-listener/policy/bundle.json` emitted exact
  `aa76b3fe955ca5d46bcdf05d7b8f78ac27c25341104bf0b3810b6fc833497ecd`.
- The frozen-interface TypeScript compiler exited 0. `DispatchArm` remains the
  exact memberless export, and `TracerHook` is unchanged.
- `node --import tsx packages/contract/src/generate.ts` exited 0 and
  `git diff --exit-code -- packages/contract/generated` was clean.
- `pnpm typecheck` returned only the same eight existing diagnostics in
  `tests/unit/s14-ui.test.ts`: TS2307 twice, TS18046 twice, TS2339 twice, and
  TS7006 twice. No C1 diagnostic appeared.
- `pnpm audit:source` returned only the same three installer environment reads
  in `packages/obs-capture/install/api.ts`, `runner.ts`, and `scheduler.ts`.
  `pnpm audit:text-bytes` exited 0 with
  `REPOSITORY_TEXT_CONTROL_BYTES=0`.

## Static and scope evidence

- Static inspection found no post-initialization main-realm live use of
  `Object.getOwnPropertyDescriptor` in the loader, canonicalizer, or
  custodian. The modules contain one private capture each; the loader's only
  other textual use is the private-realm initialization source described
  above.
- Static inspection found no inherited Hash member call, Worker, Atomics,
  shared buffer, typed signal, cwd lookup, CommonJS resolver, process launch,
  direct environment read, database import, `occurrence_detail`, model access,
  or shared-prototype mutation in the three C1 policy modules. The only host
  package resolution remains the trusted-initialization Zod pin.
- The round-twelve delta is only this report, the focused C1 test,
  `loader.ts`, `canonical.ts`, and `custodian.ts`; all are regular files. No
  bundle, frozen SPEC/PLAN/DECISIONS, generated output, interface file,
  product source, C2-C4 file, package state, or `.hermes` path changed. Root
  `node_modules` is a directory, and no directory named `node_modules` is a
  symlink.

This report records C1 implementation evidence and does not constitute
acceptance of FIX-09.
