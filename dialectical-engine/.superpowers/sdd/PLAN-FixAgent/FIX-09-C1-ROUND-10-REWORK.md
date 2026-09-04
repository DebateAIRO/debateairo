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
- The local CommonJS loader resolves `zod` and `zod/package.json` relative to
  `loader.ts`/its emitted module URL, not `process.cwd()`. It accepts only
  relative dependencies whose resolved files remain inside that exact Zod
  package directory.
- Host capabilities used to create the private realm and load its trusted
  module files are captured at loader initialization. Candidate data crosses
  the boundary only as canonical JSON and the result crosses back only as an
  exact boolean.
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
- Direct replacement and synchronization of both live crypto exports executes
  zero forged calls, preserves the exact hash, and refuses the wrong-token
  armed repin.
- A main-realm schema-program mutant invoked hostile regex callbacks 23 times
  and failed both isolation regressions. A skip-Zod mutant accepted
  `Number.MAX_SAFE_INTEGER + 1` and failed the declared-schema authority test.
  A live-crypto-import mutant reached the forged hash three times and failed
  the capture test. Every mutant was restored.
- Safe neighbours remain green: clean declared-schema validation, the
  unreachable `Object.prototype.push` case, exact frozen snapshot membership,
  top-level/nested/revoked proxy refusal, all frozen-floor samples, and lawful
  custodian authentication.

## Verification

- `pnpm exec vitest run tests/unit/fix09-bundle.test.ts --reporter=dot`:
  55/55 passed in each of three consecutive fresh processes.
- The focused floor/schema/proxy/token/neighbour selection passed 7/7.
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
