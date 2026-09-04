# FIX-09 C1 round-fifteen rework

Scope: the round-fifteen C1 implicit-dispatch finding, its bounded systemic
neighbors, the focused regression, the three owning policy modules, and this
report only. The rework base is
`61812db4e3cb86ca3f6a0b1405394ea944036336`. This is not V acceptance and
makes no claim about C2-C4, merge readiness, or full FIX-09 completion.

## Review reproduction and root cause

The independent round-fifteen Sol review found that ordinary `this.name`
assignments in the schema-error and refusal-error constructors retained an
implicit main-realm `[[Set]]` callback before `repin()` captured the expected
custodian token. Exact fresh-process regressions were added before the source
correction for setters on both `Error.prototype.name` and the narrower
exported `RepinRefusedError.prototype.name`. Each initially produced:

```text
callbackCalls=1
environment=wrong
quickArm=ON
reentrantError=null
outerRefused=true
nameRestored=true
someRestored=true
escaped=null
hash=aa76b3fe955ca5d46bcdf05d7b8f78ac27c25341104bf0b3810b6fc833497ecd
```

The setters restored themselves and a transient `Array.prototype.some`
replacement before re-entering `repin()` with the newly written wrong token.
The outer refusal did not revoke the armed bundle already returned by the
inner call.

The required systemic audit found two bounded instances of the same implicit
dispatch class adjacent to the reviewed syntax:

- ordinary descriptor objects passed to the captured `Object.defineProperty`
  still let `ToPropertyDescriptor` consult inherited `get` and `set`
  accessors;
- ordinary option objects passed to the captured private-VM capabilities
  still let Node consult inherited context and script option accessors.

Self-restoring getters on `Object.prototype.get` and `.set` each initially
changed `correct` to `wrong` and returned an inner `quick_arm: ON` while the
outer call refused. Self-restoring getters on `Object.prototype.name` and
`.displayErrors` each initially let both the re-entrant and outer wrong-token
calls return `quick_arm: ON`. All four restored the exact descriptor, emitted
no raw error, and retained the pinned hash.

The supported `tsx` runtime also emits a name-definition helper for a named
callable created inside a later function. Such generated descriptor
conversion was visible in the live stacks for three nested helpers. This was
not an application need: those helpers could be created during trusted module
initialization instead.

## Correction

- The schema, load, and refusal error constructors now define `name` as an
  own data property through the captured `Object.defineProperty` capability.
  Its writable, enumerable, and configurable attributes remain `true`,
  preserving the shape previously produced by ordinary assignment without
  inherited-setter dispatch.
- Every post-initialization `Object.defineProperty` call in `loader.ts`,
  `canonical.ts`, and `custodian.ts` receives a null-prototype data descriptor
  built through a captured `Object.create`. Descriptor conversion can no
  longer resolve an absent accessor field through `Object.prototype`.
- Private context and script options are null-prototype records with own data
  fields for every option read by the supported Node runtime. The existing
  private realm, static schema source, resolver boundary, and exact Zod
  semantics remain unchanged.
- The private CommonJS loader, duplicate-string check, numeric-prototype
  check, and recursive glob matcher were lifted out of later call frames.
  The only later-created private require function is anonymous and was shown
  by the exact supported-runtime regressions not to invoke the transpiler name
  helper.
- Product code does not modify a global or shared prototype. Prior callable,
  reflection, resolver, push/iterator, hash, crypto, `isProxy`, file-read,
  private-Zod, floor, schema, proxy, duplicate, and interface protections
  remain in place.

The canonical bundle remains
`aa76b3fe955ca5d46bcdf05d7b8f78ac27c25341104bf0b3810b6fc833497ecd`.

## RED, GREEN, mutants, and neighbors

- Initial review RED: both inherited error-name setters produced one callback,
  environment `wrong`, inner `quick_arm: ON`, outer `REPIN_REFUSED`, exact
  restoration, no raw escape, and the pinned hash.
- Systemic-neighbor RED: inherited `Object.prototype.get` and `.set`
  descriptor getters produced the same successful inner wrong-token repin.
  Inherited `name` and `displayErrors` VM-option getters also produced a
  successful outer wrong-token repin. All exact descriptors restored.
- Static RED first identified the three ordinary `this.name` writes, all 13
  ordinary post-initialization define-property descriptors, and the remaining
  runtime-created named glob helper. The final guard additionally fixes the
  accepted null-prototype descriptor and private-VM option constructors.
- Reintroducing `this.name` only in `RepinRefusedError` killed the exact
  exported-prototype case with the original harmful result.
- Reintroducing `this.name` only in `PolicyBundleSchemaError` killed the exact
  `Error.prototype` case with the original harmful result.
- Reintroducing `this.name` only in the neighboring load error was killed by
  the static implicit-`this` guard.
- Reintroducing an ordinary descriptor only in canonical active-set insertion
  killed the exact inherited-`get` case with the original harmful result.
- Before their respective corrections, the static guard killed the named
  runtime glob helper and both ordinary private-VM option call sites. Every
  mutant was restored before final verification.
- GREEN: each of three consecutive full focused runs passed 74/74. The exact
  six live implicit-dispatch cases plus the static guard passed 7/7 in each of
  three additional fresh-process runs. Every live case recorded zero hostile
  calls, unchanged `correct`, no returned bundle, `REPIN_REFUSED`, exact
  restoration, no raw escape, and the pinned hash.
- The 32-test authority selection passed 32/32. It covers inherited Hash,
  hostile push, supported-runtime/private-Zod isolation, resolver and file-URL
  isolation, prior explicit live helpers, all new implicit callbacks, the
  expanded static guard, Atomics/Worker absence, captured crypto/proxy/file
  calls, wrong-token refusal, floor/duplicate checks, proxy refusal, and the
  frozen interface.
- Ten bounded safe neighbors passed 10/10: the complete phase-one bundle,
  supported and cwd-independent private Zod, unreachable
  `Object.prototype.push`, semantic hash ordering, lawful null-prototype
  input, non-index numeric spellings, deferred-slot repin, second-custodian
  rejection, and the frozen interface.

## Verification

- `pnpm exec vitest run tests/unit/fix09-bundle.test.ts --reporter=dot`:
  74/74 passed in each of three consecutive fresh processes.
- The exact round-fifteen implicit-dispatch/static selection passed 7/7 in
  each of three consecutive fresh processes.
- The authority selection passed 32/32 and the bounded safe-neighbor
  selection passed 10/10.
- `node tests/unit/fixtures/fix09-independent-hash.mjs <
  tools/obs-listener/policy/bundle.json` emitted exact
  `aa76b3fe955ca5d46bcdf05d7b8f78ac27c25341104bf0b3810b6fc833497ecd`.
- Frozen-interface TypeScript compilation exited 0. `DispatchArm` remains
  memberless and `TracerHook` retains its frozen shape.
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

- The TypeScript-AST regression still rejects explicit uncaptured ambient
  callables and constructors in the three authority modules. It now also
  rejects ordinary `this` property assignment, ordinary descriptors passed to
  the captured define capability, named callables created after module
  initialization, and ordinary option objects passed to the private-VM
  capabilities. Its final violation set is empty.
- A focused source scan found no inherited Hash member call, Worker, Atomics,
  shared buffer, cwd lookup, CommonJS resolver hook, process launch, direct
  environment read, database/provider import, `occurrence_detail`, or
  product-side shared-prototype mutation in the three C1 policy modules.
- The round-fifteen delta is only this report, the focused C1 test,
  `loader.ts`, `canonical.ts`, and `custodian.ts`; all are regular files. No
  bundle, frozen SPEC/PLAN/DECISIONS, generated contract output, interface,
  C2-C4, package-state, or `.hermes` path changed. Root `node_modules` is a
  directory and no directory named `node_modules` is a symlink.

This report records C1 implementation evidence and does not constitute
acceptance of FIX-09.
