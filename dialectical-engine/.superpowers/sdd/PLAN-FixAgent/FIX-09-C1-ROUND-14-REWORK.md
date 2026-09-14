# FIX-09 C1 round-fourteen rework

Scope: the round-fourteen C1 ambient-authority finding, its focused
regressions, the three owning policy modules, and this report only. The rework
base is `b1d3d2f5d9faf34877fef1049123783036d98400`. This is not V acceptance and
makes no claim about C2-C4, merge readiness, or full FIX-09 completion.

## Review reproduction and root cause

The focused baseline passed 63/63 at the reviewed head. A four-helper
fresh-process matrix was added before product edits. Each case replaced one
main-realm callable after all C1 modules initialized, changed the injected
custodian token from `correct` to `wrong`, restored the exact helper
descriptor, and delegated to the original callable. The four cases were
`Reflect.deleteProperty`, `Number.isSafeInteger`, `Array.isArray`, and
`JSON.stringify`. Every case failed with the exact reviewed result:

```text
callbackCalls=1
environment=wrong
quickArm=ON
refused=false
descriptorRestored=true
escaped=null
hash=aa76b3fe955ca5d46bcdf05d7b8f78ac27c25341104bf0b3810b6fc833497ecd
```

`repin` validates the current bundle before reading the expected token. The
canonicalizer and loader still resolved several standard-library operations
through live main-realm bindings during that interval. Each preserving
replacement could therefore change custody state without making validation
fail, after which the original wrong token authorized a schema-valid
`quick_arm: ON` proposal.

The root was the post-initialization ambient-authority boundary rather than
the four reported function names. A TypeScript-AST audit added while still RED
identified 54 direct ambient member, callable, constructor, prototype, and
well-known-symbol references in `loader.ts`, `canonical.ts`, and
`custodian.ts`. That included adjacent number predicates and conversions,
string conversion, explicit array construction and prototype identity, error
construction, and the array iterator symbol.

## Correction

- `canonical.ts` captures its used array constructor, array predicate and
  prototype, number finite/safe-integer predicates, string converter,
  `TypeError` constructor, JSON stringifier, and reflective delete capability
  during module evaluation. Canonical projection and serialization use only
  those retained identities after initialization.
- `loader.ts` captures its used array predicate and prototype, number
  constructor and finite/integer/safe-integer predicates, string converter,
  `Error` constructor, symbol constructor, and iterator symbol during module
  evaluation. Policy structure checks, numeric-prototype checks, private-Zod
  setup failures, and snapshot traversal use only those retained identities.
- `custodian.ts` captures its safe-integer predicate and string converter
  during module evaluation. Prototype-chain traversal and request/environment
  inspection use those retained identities.
- The existing initialization-time `Object`, crypto, `isProxy`, file, path,
  resolver, VM, and constant-time comparison capabilities remain retained.
  The private schema program remains a string executed with its own VM-realm
  intrinsics and exact Zod semantics; the AST guard does not interpret that
  private-realm source as main-realm authority.
- Product code mutates no global helper or prototype. The policy bundle,
  frozen interfaces, floor/schema/proxy/duplicate checks, and custodian
  contract are unchanged.

The canonical bundle remains
`aa76b3fe955ca5d46bcdf05d7b8f78ac27c25341104bf0b3810b6fc833497ecd`.

## RED, GREEN, mutants, and neighbours

- Initial round-fourteen RED: all four fresh-process preserving replacements
  produced one hostile callback, environment `wrong`, returned `quick_arm:
  ON`, no refusal, exact descriptor restoration, no raw escape, and the pinned
  independent hash.
- The new static regression also failed before product edits. It parses all
  three policy modules through the repository TypeScript project and rejects
  an ambient standard-library member/constructor reference or a bare ambient
  value resolved inside a callable. It initially reported 54 live authority
  references and is now empty.
- GREEN: each of three consecutive full focused runs passed 68/68. The exact
  four-helper matrix plus static guard passed 5/5 in each of three additional
  fresh-process runs. Every helper recorded zero hostile calls, unchanged
  `correct`, `REPIN_REFUSED`, no returned bundle, exact descriptor
  restoration, no raw escape, and the pinned hash.
- Reintroducing the live `Reflect.deleteProperty` call in canonical active-set
  cleanup failed its exact focused case with the original harmful result.
- Reintroducing the live `Number.isSafeInteger` call in canonical array-length
  validation failed its exact focused case with the original harmful result.
- Reintroducing the live `Array.isArray` call in canonical projection failed
  its exact focused case with the original harmful result.
- Reintroducing the live `JSON.stringify` call in canonical primitive
  serialization failed its exact focused case with the original harmful
  result. Each retained call was restored before final verification.
- The 32-test authority selection passed 32/32, covering inherited Hash,
  hostile pre-initialization and mid-parse push, supported-runtime and
  cwd-independent Zod, CommonJS/file-URL resolver isolation, all seven prior
  and new live-helper cases, the static ambient guard, unsafe integer/Atomics,
  Worker absence, private regex/push and self-restoring Zod callbacks,
  captured crypto/proxy/file reads, wrong-token refusal, floor and duplicate
  JSON checks, policy/request proxy rejection, and the frozen interface.
- Ten bounded safe neighbours passed 10/10: complete phase-one bundle,
  supported-runtime and cwd-independent Zod, unreachable
  `Object.prototype.push`, semantic hash ordering, lawful null-prototype data,
  non-index numeric spellings, lawful deferred-slot repin, second-custodian
  rejection, and the frozen interface.

## Verification

- `pnpm exec vitest run tests/unit/fix09-bundle.test.ts --reporter=dot`:
  68/68 passed in each of three consecutive fresh processes.
- The exact round-fourteen helper/static selection passed 5/5 in each of three
  consecutive fresh processes.
- The authority selection passed 32/32 and the bounded safe-neighbour
  selection passed 10/10.
- `node tests/unit/fixtures/fix09-independent-hash.mjs <
  tools/obs-listener/policy/bundle.json` emitted exact
  `aa76b3fe955ca5d46bcdf05d7b8f78ac27c25341104bf0b3810b6fc833497ecd`.
- `node node_modules/typescript/bin/tsc --project
  tests/unit/fixtures/fix09-interface-tsconfig.json --pretty false` exited 0;
  `DispatchArm` remains memberless and `TracerHook` retains its frozen shape.
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

- The committed TypeScript-AST regression covers all three owning modules and
  fails if an ECMAScript/Node ambient callable root is directly invoked,
  constructed, dereferenced, or captured from inside a later callable. Its
  final result is an empty violation set.
- A separate forbidden-source scan found no inherited Hash member call,
  Worker, Atomics, shared buffer, cwd lookup, CommonJS resolver hook, process
  launch, direct environment read, database/provider import,
  `occurrence_detail`, or shared-prototype mutation in the three C1 policy
  modules.
- The round-fourteen delta is only this report, the focused C1 test,
  `loader.ts`, `canonical.ts`, and `custodian.ts`; all are regular files. No
  policy bundle, frozen SPEC/PLAN/DECISIONS, generated output, interface file,
  product source, C2-C4 file, package state, or `.hermes` path changed. Root
  `node_modules` is a directory, and no directory named `node_modules` is a
  symlink.

This report records C1 implementation evidence and does not constitute
acceptance of FIX-09.
