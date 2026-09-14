# FIX-09 C1 round-ten rework

Scope: C1 declared-schema isolation, canonical hashing, custodian token
authentication, focused tests, and this report only. This is not V acceptance
and makes no claim about C2-C4, merge readiness, or full FIX-09 completion.

## Review reproduction

The focused baseline passed 49/49 before the original round-ten regressions
were added. Those regressions then failed before product edits:

- The pre-initialization matrix reached preserving hostile
  `Array.prototype.push` getter/data functions 165 times. A throwing getter
  escaped `RAW_PUSH_ESCAPE`, and non-callable data escaped a raw `TypeError`.
- The self-restoring cross-call entered main-realm Zod through 46 regular
  expression calls. That path could install its preserving push callback
  inside validation and replace the later live crypto export.
- With captured crypto calls temporarily absent, direct CommonJS export
  synchronization reached the forged hash three times and failed the focused
  authority assertion.

The initial worker-isolate correction closed both frozen P1 attacks, but the
fresh independent round-ten Sol review correctly found the worker transport
was itself not acceptable. Follow-up RED evidence against commit `23dd25f3`
was:

- normal `node --import tsx` validation returned `{ "success": false }`
  because serialized transpiler output referenced a missing helper;
- after `process.chdir()` to an unrelated directory, validation first returned
  false and then the worker emitted an uncaught `ERR_MODULE_NOT_FOUND`;
- replacing live `Atomics.wait`/`Atomics.load` forged the worker verdict for a
  Zod-invalid unsafe integer, and the regression observed the hostile wait;
- the review separately demonstrated that replacing live `Worker` could forge
  or disrupt the same authority path.

A second fresh Sol review of committed head `9ca2b17c` found one remaining
live-builtin cross-call. Replacing `node:util/types.isProxy`, synchronizing
builtin exports, and passing a current-bundle proxy whose `ownKeys` trap changed
the environment token from `correct` to `wrong` authorized the wrong-token
armed repin. RED observed `quick_arm: ON`, two proxy traps, and 315 forged
`isProxy` calls.

A third fresh Sol review of committed head `b57b1e3f` found that lazy
`createRequire().resolve` still consulted replaceable
`Module._resolveFilename`. Its shadow package made the declared schema accept
an unsafe integer after two forged resolver calls. Its stronger reproduction
used the host `localRequire` callback to reach the main global, change the
environment token from `correct` to `wrong` during validation, and authorize
the wrong-token armed repin. The focused fresh-process RED observed one forged
resolver call and bounded `{ "success": false }` when the forged resolver
threw.

The pre-initialization test compiles the three policy modules first and then
loads emitted JavaScript under hostile state. Its zero-call assertion therefore
covers product initialization rather than `tsx` loader-hook activity.

## Correction

- The complete declared Zod schema remains a single runtime schema program
  with the frozen strict objects, tuples, literals, unions, regexes, numeric
  constraints, and relative-glob refinement. The exported TypeScript policy
  shape mirrors that declaration without a runtime main-realm Zod import.
- Validation is now synchronous. A lazily created `node:vm` context owns the
  schema program, its regex literals and callbacks, `JSON.parse`, and a private
  Zod CommonJS module graph. String/wasm code generation is disabled in that
  context.
- The private loader obtains `zod/package.json` through its captured,
  module-private ESM resolver relative to `loader.ts`/its emitted module URL,
  not `process.cwd()` or CommonJS resolution. The exact pinned CommonJS entry
  is `index.cjs`; every Zod dependency is an explicit relative `.cjs` path
  normalized with captured path operations and confined to that package
  directory.
- Host capabilities used to create the private realm and load its trusted
  module files are captured at loader initialization. Candidate data crosses
  the boundary only as canonical JSON and the result crosses back only as an
  exact boolean.
- All three C1 modules now retain their initialization-time `isProxy` target.
  The loader also uses its initialization-time file-read target for bundle and
  private-Zod reads. Later builtin export synchronization cannot redirect
  proxy rejection or bundle input.
- There is no worker, `SharedArrayBuffer`, typed-array signal, `Atomics`
  verdict, asynchronous bootstrap, timeout, or function-stringification path.
  Setup and validation errors are caught synchronously and map to schema
  failure.
- A hostile push present before loader initialization is recorded as
  untrusted. `safeParse` refuses before creating the private realm or executing
  Zod, so getter, function, throwing, and non-callable push members neither run
  nor escape.
- Mid-validation main-realm `RegExp.prototype.test` and
  `Array.prototype.push` callbacks cannot run because schema construction and
  validation execute with private intrinsics. Product code never mutates a
  shared prototype.
- Canonical hashing and custodian authentication retain local call targets for
  Node's one-shot hash and constant-time comparison before caller-controlled
  validation. Later `syncBuiltinESMExports()` calls cannot redirect either
  authority decision.

The canonical bundle remains
`aa76b3fe955ca5d46bcdf05d7b8f78ac27c25341104bf0b3810b6fc833497ecd`.

## Regression, mutation, and neighbour evidence

- All four hostile pre-initialization push shapes import successfully, return
  bounded schema failure, execute zero hostile getters/functions, and expose no
  raw error.
- The self-restoring regex-to-push-to-crypto attack executes zero main-realm
  regex, push, or forged-hash callbacks; the wrong-token repin returns
  `REPIN_REFUSED`; hash, push, regex, and crypto descriptors are exact after
  restoration. A lawful token still returns the unchanged `quick_arm: OFF`
  bundle.
- Supported `tsx` validation succeeds for the exact valid bundle, including
  after changing to an unrelated current working directory. Replacing live
  worker and Atomics authority members executes zero hostile calls; the valid
  bundle remains valid and the Zod-invalid unsafe integer remains invalid.
- Replacing `Module._resolveFilename` after loader initialization executes zero
  forged resolver calls; private Zod validates the exact bundle successfully
  through the module-private ESM resolution path.
- Direct replacement and synchronization of both live crypto exports executes
  zero forged calls, preserves the exact hash, and refuses the wrong-token
  armed repin.
- Direct replacement and synchronization of live `isProxy` executes zero
  forged calls and zero current-bundle or request traps. Both the cross-call
  wrong-token armed repin and the forged request-descriptor repin return
  `REPIN_REFUSED`, and the environment remains exactly `correct`. Replacing the
  live file-read export likewise executes zero forged reads and the pinned file
  still loads with `quick_arm: OFF`.
- A main-realm schema-program mutant invoked hostile regex callbacks 23 times
  and failed both isolation regressions. A skip-Zod mutant accepted
  `Number.MAX_SAFE_INTEGER + 1` and failed the declared-schema authority test.
  A live-crypto-import mutant reached the forged hash three times. Live
  custodian-`isProxy` and file-read mutants authorized the forged request and
  read the armed replacement respectively. The committed CommonJS-resolution
  path consulted its forged resolver and failed the new resolver-isolation
  regression. Every mutant failed its capture regression and was restored.
- Safe neighbours remain green: clean declared-schema validation, the
  unreachable `Object.prototype.push` case, exact frozen snapshot membership,
  top-level/nested/revoked proxy refusal, all frozen-floor samples, and lawful
  custodian authentication.

## Verification

- `pnpm exec vitest run tests/unit/fix09-bundle.test.ts --reporter=dot`:
  59/59 passed in each of three consecutive fresh processes.
- The focused authority/floor/schema/proxy/token/neighbour selection passed
  12/12.
- `node tests/unit/fixtures/fix09-independent-hash.mjs <
  tools/obs-listener/policy/bundle.json` emitted exact
  `aa76b3fe955ca5d46bcdf05d7b8f78ac27c25341104bf0b3810b6fc833497ecd`.
- `node node_modules/typescript/bin/tsc --project
  tests/unit/fixtures/fix09-interface-tsconfig.json --pretty false` exited 0;
  the frozen C1 interface remains exact.
- `node --import tsx packages/contract/src/generate.ts` exited 0 and
  `git diff --exit-code -- packages/contract/generated` was clean.
- `pnpm typecheck` returned only the same eight documented diagnostics in
  `tests/unit/s14-ui.test.ts`; no C1 diagnostic appeared.
- The direct source audit returned only the same three installer environment
  reads. The direct text-byte audit exited 0 with
  `REPOSITORY_TEXT_CONTROL_BYTES=0`.
- Static inspection found no `createHash`, inherited Hash member call, shared
  prototype mutation, direct environment access, DB import,
  `occurrence_detail`, child process, worker, Atomics, shared-buffer, or typed
  signal path in the three policy modules.
- `git diff --check 7045681b` passed. Every changed source/test path is a
  regular file, root `node_modules` is a directory rather than a symlink, and
  the exact `7045681b` scope is the three C1 policy files, focused test, and
  this report.

Owned scope is `canonical.ts`, `custodian.ts`, `loader.ts`, the focused C1
test, and this report. No bundle, package state, product source, frozen
SPEC/PLAN/DECISIONS, generated output, C2-C4, `.hermes`, or reviewer report is
changed.
