# FIX-09 C1 Sol review — round 15

Review target: branch `codex/oa-fix-09`, commit
`61812db4e3cb86ca3f6a0b1405394ea944036336`, reviewed as
`b1d3d2f5d9faf34877fef1049123783036d98400..61812db4e3cb86ca3f6a0b1405394ea944036336`.

## Findings

### F1 — P1 — error-name assignment preserves a self-restoring pre-authentication callback and wrong-token repin

The patch captures the named callable and constructor bindings, but the
failure path still performs ordinary prototype-dispatching assignment in two
places on the repin authority path:

- `tools/obs-listener/policy/loader.ts:1080` assigns
  `this.name = "PolicyBundleSchemaError"`;
- `tools/obs-listener/policy/custodian.ts:36` assigns
  `this.name = "RepinRefusedError"`.

Both assignments use ordinary `[[Set]]`. A setter installed after trusted
module initialization on `Error.prototype.name`, or more narrowly on the
exported `RepinRefusedError.prototype.name`, therefore runs caller-controlled
code. A transient `Array.prototype.some` descriptor replacement makes the
current valid bundle enter the deliberate prototype-mutation failure at
`loader.ts:1184-1185`. The error-name setter then executes before `repin()` can
capture the expected token at `custodian.ts:165-167`.

In a bounded fresh-process reproduction, the setter changed the injected
environment from `correct` to `wrong`, restored its own exact prior state and
the exact `Array.prototype.some` descriptor, and re-entered `repin()` with the
same clean bundle plus a schema-valid `quick_arm: ON` proposal. The re-entrant
call returned the armed bundle. The outer call subsequently threw
`REPIN_REFUSED`, which does not undo or expose the successful inner
authorization. Three fresh processes returned identically for the exported-
prototype variant:

```text
callbackCalls=1
environment=wrong
quickArm=ON
reentrantError=null
outerRefused=true
nameRestored=true
someRestored=true
hash=aa76b3fe955ca5d46bcdf05d7b8f78ac27c25341104bf0b3810b6fc833497ecd
```

An independent `Error.prototype.name` variant also reproduced 3/3 with the
same harmful authorization, exact restoration of both descriptors, and the
same pinned hash. Thus the issue is not limited to access through the exported
class prototype.

The new AST guard at `tests/unit/fix09-bundle.test.ts:1338-1486` passes despite
this live edge. Its visitor at lines 1455-1477 only recognizes explicit
references rooted at its enumerated ambient identifiers. It does not model
implicit callable dispatch caused by assignment to an inherited accessor, so
it cannot establish the claimed absence of main-realm callback authority.

This violates FIX-09-R02: a caller without the original token can still
obtain a repinned bundle. Returning `quick_arm: ON` also violates the phase-one
OFF posture required by FIX-09-R01/R12.

Smallest acceptable correction: make every error-name initialization on this
path an own data-property definition through the already captured
`DEFINE_PROPERTY` capability (or remove the writes), including both the
schema-error and refusal-error constructors. Add an exact self-restoring
setter regression that requires zero callbacks, unchanged `correct`, no
re-entrant bundle, outer `REPIN_REFUSED`, exact descriptor restoration, no raw
escape, and the pinned hash. The static regression must also cover implicit
prototype-dispatch syntax if it continues to claim the full ambient-authority
invariant.

No additional P0, P2, or P3 findings.

## Verdicts

### SPEC: REWORK

F1 leaves a wrong-token repin authority bypass and violates FIX-09-R02 plus
the phase-one OFF requirements in FIX-09-R01/R12.

### CODE QUALITY: REWORK

The four reported live helpers are captured, but the systemic authority claim
and its static guard omit implicit prototype setter dispatch on the same
pre-authentication path.

This is a C1 review only. It is not V acceptance and makes no claim about
C2-C4, merge readiness, or full FIX-09 completion.

## Verification evidence

- The new four-helper matrix plus static guard passed 5/5 in each of three
  consecutive fresh processes at the reviewed head.
- The full focused suite passed 68/68 in each of three consecutive fresh
  processes. This includes the prior Object reflection, resolver/file-URL,
  array push/iterator, semantic hash, crypto, `isProxy`, file-read, private-VM
  Zod, floor, schema, proxy, duplicate, and frozen-interface regressions.
- An isolated temporary tree using the committed round-fourteen tests with
  the exact base product files confirmed the claimed RED boundary: the four
  helper cases failed with one callback, environment `wrong`, returned
  `quick_arm: ON`, no refusal, exact restoration, and the pinned hash; the
  static guard independently failed with 54 violations. At the reviewed head
  those exact five tests are GREEN.
- Both error-name setter bypass variants reproduced identically in 3/3 fresh
  processes at the reviewed head. The outer refusal did not prevent the
  re-entrant wrong-token call from returning `quick_arm: ON`.
- Independent hashing emitted exact
  `aa76b3fe955ca5d46bcdf05d7b8f78ac27c25341104bf0b3810b6fc833497ecd`.
- Frozen-interface compilation exited 0; `DispatchArm` remains memberless and
  `TracerHook` retains its frozen shape.
- `pnpm typecheck` returned only the same eight pre-existing diagnostics in
  `tests/unit/s14-ui.test.ts`: TS2307 twice, TS18046 twice, TS2339 twice, and
  TS7006 twice. No C1 diagnostic appeared.
- `pnpm audit:source` returned only the same three installer environment reads
  in `packages/obs-capture/install/api.ts`, `runner.ts`, and `scheduler.ts`.
  `pnpm audit:text-bytes` exited 0 with
  `REPOSITORY_TEXT_CONTROL_BYTES=0`.
- The committed range contains exactly the round-fourteen rework report, the
  focused C1 test, and `loader.ts`, `canonical.ts`, and `custodian.ts`; all are
  regular files. The bundle, frozen SPEC/PLAN/DECISIONS, generated contract
  output, frozen interfaces, product source, and C2-C4 are unchanged.
- A focused source scan found no inherited Hash member call, Worker, Atomics,
  shared buffer, cwd lookup, CommonJS resolver hook, process launch, direct
  environment read, database import, `occurrence_detail`, or product-side
  shared-prototype mutation in the three policy modules. `git diff --check`
  was clean before this report was added.

## Post-report state

This fresh independent Sol review changed only this report. It did not modify
product code, tests, fixtures, package state, frozen authority, generated
output, or checkout/index/HEAD, and performed no V acceptance, merge, push,
board, or external-state operation.
