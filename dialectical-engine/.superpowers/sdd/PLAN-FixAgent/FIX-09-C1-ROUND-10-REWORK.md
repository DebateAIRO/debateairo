# FIX-09 C1 round-ten rework

Scope: C1 declared-schema isolation, canonical hashing, custodian token
authentication, focused tests, and this report only. This is not V acceptance
and makes no claim about C2-C4, merge readiness, or full FIX-09 completion.

## Review reproduction

The focused baseline passed 49/49 before the new regressions were added. The
round-ten tests then failed before product edits:

- The pre-initialization matrix reached preserving hostile
  `Array.prototype.push` getter/data functions 165 times. A throwing getter
  escaped `RAW_PUSH_ESCAPE`, and non-callable data escaped a raw `TypeError`.
- The self-restoring cross-call entered main-realm Zod through 46 regular
  expression calls. The review attack could therefore install its preserving
  push callback inside validation and replace the later live crypto export.
- With captured crypto calls temporarily absent, direct CommonJS export
  synchronization reached the forged hash three times and failed the focused
  authority assertion.

The source trace also separated four `tsx` loader-hook push calls from product
execution. The committed pre-initialization test compiles the three policy
modules first and then loads the emitted JavaScript under hostile state, so its
zero-call assertion covers product initialization rather than the test runner.

## Correction

- The complete declared Zod schema remains one schema builder with the same
  strict objects, tuples, literals, unions, regexes, numeric constraints, and
  relative-glob refinement. The main policy module imports Zod as a type only.
- Schema construction and `safeParse` execute in one lazy worker isolate. The
  main realm passes only the canonical JSON string of the already checked,
  recursively frozen own-data snapshot and receives only a shared integer
  verdict. Worker initialization, parse errors, worker failure, and bounded
  waits all map to schema failure.
- A hostile push present before loader initialization is recorded as
  untrusted. `safeParse` refuses before creating the worker or performing any
  Zod operation. The module therefore initializes without invoking getter,
  function, throwing, or non-callable push members.
- Mid-validation main-realm `RegExp.prototype.test` and
  `Array.prototype.push` callbacks cannot run because the full Zod path has its
  own realm. No shared prototype is modified by product code.
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
- Direct replacement and synchronization of both live crypto exports executes
  zero forged calls, preserves the exact hash, and refuses the wrong-token
  armed repin.
- A main-realm Zod mutant failed all three isolation regressions. A skip-Zod
  mutant accepted `Number.MAX_SAFE_INTEGER + 1` and failed the declared-schema
  authority test. A live-crypto-import mutant reached the forged hash three
  times and failed the capture test. Every mutant was restored.
- Safe neighbours remain green: clean declared-schema validation, the
  unreachable `Object.prototype.push` case, exact frozen snapshot membership,
  top-level/nested/revoked proxy refusal, all frozen-floor samples, and lawful
  custodian authentication.

## Verification

- `pnpm vitest run tests/unit/fix09-bundle.test.ts --reporter=dot`: 51/51
  passed in each of three consecutive fresh processes.
- The focused seven-test floor/schema/proxy/token/neighbour selection passed
  7/7.
- `node tests/unit/fixtures/fix09-independent-hash.mjs <
  tools/obs-listener/policy/bundle.json` emitted the exact `aa76...497ecd`
  hash.
- `node node_modules/typescript/bin/tsc --project
  tests/unit/fixtures/fix09-interface-tsconfig.json` exited 0; the frozen C1
  interfaces remain unchanged.
- `node --import tsx packages/contract/src/generate.ts` exited 0 and
  `git diff --exit-code -- packages/contract/generated` was clean.
- `pnpm typecheck` reported only the same eight existing diagnostics in
  `tests/unit/s14-ui.test.ts`; no C1 diagnostic appeared.
- The package source-audit wrapper hit the known sandbox `tsx` IPC `EPERM`.
  `node --import tsx tools/orphan-audit/src/cli.ts source` reported only the
  same three existing installer environment reads. The direct text-byte audit
  exited 0 with `REPOSITORY_TEXT_CONTROL_BYTES=0`.
- Static, descriptor, regular-file, dependency-tree, diff, and exact-scope
  checks are recorded immediately before commit.

Owned scope is `canonical.ts`, `custodian.ts`, `loader.ts`, the focused C1
test, and this report. No bundle, package state, product source, frozen
SPEC/PLAN/DECISIONS, generated output, C2-C4, `.hermes`, or reviewer report is
changed.
