# FIX-09 C1 round-thirteen rework

Scope: the round-thirteen C1 live-reflection finding, its focused regression,
the three owning policy modules, and this report only. The rework base is
`b419451ddde5529c9f1378517df27194943a9527`. This is not V acceptance and
makes no claim about C2-C4, merge readiness, or full FIX-09 completion.

## Review reproduction and root cause

The focused baseline at the reviewed head passed 61/61. The existing
post-initialization descriptor regression was converted into a three-helper
fresh-process matrix before product edits. The singular
`Object.getOwnPropertyDescriptor` case remained green, while the new
`Object.getOwnPropertyNames` and `Object.getOwnPropertyDescriptors` cases each
failed with the exact reviewed result:

```text
callbackCalls=1
environment=wrong
quickArm=ON
refused=false
descriptorRestored=true
escaped=null
hash=aa76b3fe955ca5d46bcdf05d7b8f78ac27c25341104bf0b3810b6fc833497ecd
```

`repin` validates the current bundle before reading the expected custodian
token. The loader's numeric-prototype check reached the live
`Object.getOwnPropertyNames` binding, while canonical projection reached the
live `Object.getOwnPropertyDescriptors` binding. Either self-restoring
replacement could change the injected expected token from `correct` to
`wrong`, preserve the reflection result, and authorize the caller's original
wrong-token `quick_arm: ON` proposal.

Auditing the same authority path showed that capturing only the next reported
name would leave adjacent live `Object` reflection operations reachable before
token capture. The loader, canonicalizer, and custodian therefore needed their
complete actually used `Object` capability sets captured at trusted module
initialization.

## Correction

- `loader.ts` structurally captures its used `Object` capabilities for object
  creation, data-property definition, freezing, singular descriptor reads,
  own-name reads, prototype reads, own-member checks, key reads, and the base
  object prototype reference. All main-realm uses route through those local
  captures.
- `canonical.ts` structurally captures its used `Object` capabilities for
  object creation, data-property definition, freezing, singular and plural
  descriptor reads, own-name and own-symbol reads, prototype reads,
  own-member checks, numeric identity, and the base object prototype
  reference. All later canonical projection and serialization uses route
  through those captures.
- `custodian.ts` structurally captures its used `Object` capabilities for
  data-property definition, singular descriptor reads, prototype reads, and
  own-member checks. Request, environment, prototype-chain, and custodian
  selection use only those captures.
- The only remaining textual main source occurrence is inside the private VM
  initializer source. It resolves the private realm's own native array push
  during initialization of that isolated realm and cannot dispatch a later
  main-realm replacement.
- Production code mutates no global helper or prototype. The private
  synchronous VM and Zod graph, eager resolver pin, captured hash/crypto,
  captured `isProxy`, captured file reads, proxy rejection, numeric-prototype
  floor, path/glob floor, canonical hash, and frozen interfaces are otherwise
  unchanged.

The canonical bundle remains
`aa76b3fe955ca5d46bcdf05d7b8f78ac27c25341104bf0b3810b6fc833497ecd`.

## RED, GREEN, mutants, and neighbours

- Initial round-thirteen RED: the matrix selected three cases; the singular
  helper passed and both new helpers failed. Each failure recorded one hostile
  callback, environment `wrong`, `quick_arm: ON`, no refusal, exact helper
  restoration, no raw escape, and the pinned independent hash.
- GREEN: each of three consecutive fresh-process matrix runs passed 3/3. Every
  helper recorded zero hostile calls, environment `correct`,
  `REPIN_REFUSED`, no returned bundle, exact helper restoration, no raw
  escape, and the pinned hash.
- Reintroducing the live loader
  `Object.getOwnPropertyNames(prototype)` lookup made its exact focused case
  fail 1/1 with the original harmful result. The captured call was restored.
- Reintroducing the live canonical
  `Object.getOwnPropertyDescriptors(value)` lookup made its exact focused case
  fail 1/1 with the original harmful result. The captured call was restored.
- The former numeric-prototype time-of-check test intentionally expected a
  live plural-descriptor callback to execute. It now verifies the corrected
  boundary: the replacement remains uncalled and the clean bundle still
  validates, while the existing polluted-prototype tests continue to exercise
  fail-closed rejection.
- The 24-test authority selection passed 24/24, including inherited Hash,
  pre-initialization and mid-parse push, supported-runtime and cwd-independent
  Zod, CommonJS and file-URL resolver isolation, all three live-reflection
  cases, unsafe integer/Atomics, Worker absence, private regex/push and
  self-restoring Zod callbacks, captured crypto, both proxy checks, captured
  file reads, wrong-token refusal, floor and duplicate JSON checks, top-level
  and nested proxy rejection, proxy-normalized request descriptors, and the
  frozen interface.
- Ten bounded safe neighbours passed 10/10: the complete phase-one bundle,
  supported-runtime and cwd-independent Zod, unreachable
  `Object.prototype.push`, semantic hash ordering, lawful null-prototype data,
  non-index numeric spellings, lawful deferred-slot repin,
  second-custodian rejection, and the frozen interface.

## Verification

- `pnpm exec vitest run tests/unit/fix09-bundle.test.ts --reporter=dot`:
  63/63 passed in each of three consecutive fresh processes.
- The exact three-case live-reflection selection passed 3/3 in each of three
  consecutive fresh processes.
- The authority selection passed 24/24 and the bounded safe-neighbour
  selection passed 10/10.
- `node tests/unit/fixtures/fix09-independent-hash.mjs <
  tools/obs-listener/policy/bundle.json` emitted exact
  `aa76b3fe955ca5d46bcdf05d7b8f78ac27c25341104bf0b3810b6fc833497ecd`.
- `node node_modules/typescript/bin/tsc --project
  tests/unit/fixtures/fix09-interface-tsconfig.json --pretty false` exited 0;
  `DispatchArm` remains the exact 32-byte memberless export and `TracerHook`
  remains unchanged.
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

- Static inspection found no post-initialization main-realm `Object` method
  lookup in `loader.ts`, `canonical.ts`, or `custodian.ts`. The single textual
  occurrence is the private-realm native-push initializer described above.
- A forbidden-source scan found no inherited Hash member call, Worker,
  Atomics, shared buffer, cwd lookup, CommonJS resolver hook, process launch,
  direct environment read, database/provider import, `occurrence_detail`, or
  shared-prototype mutation in the three C1 policy modules.
- The round-thirteen delta is only this report, the focused C1 test,
  `loader.ts`, `canonical.ts`, and `custodian.ts`; all are regular files. No
  bundle, frozen SPEC/PLAN/DECISIONS, generated output, interface file,
  product source, C2-C4 file, package state, or `.hermes` path changed. Root
  `node_modules` is a directory, and no directory named `node_modules` is a
  symlink.

This report records C1 implementation evidence and does not constitute
acceptance of FIX-09.
