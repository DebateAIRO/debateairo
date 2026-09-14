# FIX-09 C1 Sol review — round 10

Review target: branch `codex/oa-fix-09`, commit
`7045681b8990ab4acbdbda7e514c7b6905dc0868`, reviewed as
`fc9a46bed1130b75d6181d4267937fbf8628a24b..7045681b8990ab4acbdbda7e514c7b6905dc0868`.
The original C1 base remains
`2b670d3059c60d7262cf655bd5d402c88100dff3`.

## Findings

### F1 — P1 — the push snapshot can be restored before the post-check and poison the new live `crypto.hash` binding

Affected code:

- `tools/obs-listener/policy/loader.ts:57-65,885-910`
- `tools/obs-listener/policy/canonical.ts:1,354-355`
- `tools/obs-listener/policy/custodian.ts:1,25-26,155-160`
- `tests/unit/fix09-bundle.test.ts:714-824`

The round-nine patch replaces the mutable `Hash` instance with a named
`node:crypto` `hash` import and compares the live `Array.prototype.push`
descriptor before and after Zod. This closes the exact `Hash.prototype.update`
and `digest` variants, but it does not make the validation path independent of
inherited `push`, and descriptor equality observes only the state at each
checkpoint.

An independent probe installed a preserving `RegExp.prototype.test` wrapper.
On the first declared-regex call it installed a preserving hostile
`Array.prototype.push`. When Zod invoked that push, the callback replaced the
writable/configurable `node:crypto` CommonJS `hash` export with a constant
32-byte/64-hex result, called Node's `syncBuiltinESMExports()`, restored the
exact native push descriptor, and then performed the real push. The check at
`loader.ts:906-908` therefore saw the original push identity and accepted the
parse. The live named `hash` imports at `canonical.ts:1` and `custodian.ts:1`
had changed, so both token digests were equal. `repin(current, {token:
"wrong", next_bundle: {...current, quick_arm: "ON"}},
{OBS_POLICY_CUSTODIAN_TOKEN: "correct"})` returned the schema-valid armed
bundle.

Three fresh processes produced the same result:

```text
regexp_test_calls=46
hostile_push_calls=1
forged_hash_calls=2
repin_result.quick_arm=ON
push_restored=true
regexp_test_restored=true
crypto_hash_restored=true
clean_hash_after_restore=aa76b3fe955ca5d46bcdf05d7b8f78ac27c25341104bf0b3810b6fc833497ecd
```

This is the cross-call authority failure from round nine with a different
mutable digest target. It violates FIX-09-R02's single-custodian requirement
and defeats FIX-09-R01/R12's phase-one `quick_arm = OFF` posture.

The added mid-parse test does not cover this mutation. Its hostile push remains
installed until `finally`, so the post-Zod descriptor check detects it. It does
not restore push from inside the callback or mutate the live function now used
by the token decision. The pre-initialization test likewise asserts only
`success: false`; it does not assert zero hostile calls or bounded import
failure.

Smallest acceptable correction: make the complete declared-schema path avoid
attacker-replaceable inherited array dispatch, including module-time schema
construction, or isolate validation so callbacks cannot mutate any later hash
or authentication primitive. Add the self-restoring cross-call case above and
require zero hostile callbacks, `REPIN_REFUSED`, exact pinned hash, and exact
native descriptor restoration.

### F2 — P1 — the pre-initialization guard runs after Zod has already executed hostile `push`, with raw import escapes

Affected code:

- `tools/obs-listener/policy/loader.ts:4,21-43,57-65`
- `tests/unit/fix09-bundle.test.ts:714-758`
- `.superpowers/sdd/PLAN-FixAgent/FIX-09-C1-ROUND-9-REWORK.md:35-45,56-63`

The native proof describes the captured descriptor, but importing and building
the Zod schemas still uses the current inherited push. A fresh-process matrix
preloaded Zod and the two local dependencies, installed each push descriptor,
and only then imported a fresh query instance of `loader.ts`. Each case was run
three times with identical output:

```text
getter-returned preserving function: safeParse=false, getter_calls=174, function_calls=174
data preserving function:            safeParse=false, getter_calls=0,   function_calls=174
throwing getter:                      raw Error:RAW_PUSH_ESCAPE
non-callable data value:              raw TypeError: out.push is not a function
```

The callable cases eventually fail closed because
`BASE_ARRAY_PUSH_IS_TRUSTED` is false, but only after the hostile function has
run 174 times. The other two forms prevent the loader module from initializing
and escape as raw errors. This contradicts the round-nine report's statement
that the push matrix executes zero hostile members and remains bounded, and it
leaves the pre-init entry point outside the intended authority isolation.

The added fresh-process test records `calls` but checks only `success: false`.
It therefore passes while its hostile wrapper executes during import. Extend
that matrix to getter-function, data-function, throwing getter, and non-callable
forms, assert zero hostile calls and no raw exception, and place the rejection
boundary before any Zod operation that dispatches through the candidate.

## Verdicts

### SPEC: REWORK

F1 permits a caller without the recorded custodian token to repin a valid
`quick_arm: ON` bundle. FIX-09-R02 and the OFF requirements in FIX-09-R01/R12
therefore remain unsatisfied.

### CODE QUALITY: REWORK

The exact inherited `Hash.prototype.update`/`digest` finding is closed, but the
replacement authority chain remains mutable across a validation callback. The
pre-init test also omits the call-count and raw-escape assertions needed to
prove its name, and the committed report claims `git diff --check` passes even
though the reviewed range exits 2 for a new blank line at that report's EOF.

This is a C1 review only. It is not V acceptance and makes no claim about
C2-C4, merge readiness, or full FIX-09 completion.

## Round-nine finding disposition

- Round-nine F1 is closed for the exact eight `Hash.prototype.update` and
  `digest` getter-function, data-function, throwing-getter, and non-callable
  variants. An independent matrix observed zero getter/function calls, exact
  `aa76...497ecd`, `REPIN_REFUSED` for `wrong` versus `correct`, no raw escape,
  and exact descriptor restoration in every case.
- Round-nine F2 is not closed end to end. A persistent push replacement is
  refused before direct `safeParse`, `loadBundle`, and `repin` can use it, and
  the unchanged `Object.prototype.push` neighbour remains green. F1 and F2
  above show the uncovered pre-init and self-restoring mid-parse paths.

## Carried-boundary evidence

- Focused command `pnpm vitest run tests/unit/fix09-bundle.test.ts
  --reporter=dot`: 49/49 passed on each of three consecutive fresh runs.
- A targeted floor/schema/proxy/token run passed 5/5: all enumerated floor
  samples, complete own-data schema membership, top-level/nested proxies,
  revoked proxies, and the lawful/wrong custodian-token boundary.
- The independent canonical fixture emitted exactly
  `aa76b3fe955ca5d46bcdf05d7b8f78ac27c25341104bf0b3810b6fc833497ecd`.
- The interface fixture compiled with exit 0. `DispatchArm` remains memberless
  and the C1 interface surface remains unchanged.
- `node --import tsx packages/contract/src/generate.ts` exited 0 and
  `git diff --exit-code -- packages/contract/generated` was clean. The package
  wrapper is blocked by the known sandbox `tsx` IPC `EPERM`.
- `pnpm typecheck` returned the eight current baseline diagnostics, all in
  `tests/unit/s14-ui.test.ts`, and no C1 diagnostic.
- The direct source audit returned only the three current installer environment
  reads. The direct text-byte audit exited 0 with
  `REPOSITORY_TEXT_CONTROL_BYTES=0`.
- Static inspection found no `createHash`, inherited Hash member call,
  product/global prototype mutation, direct environment access, DB import,
  `occurrence_detail`, process launch, or model/provider access in the changed
  policy files.
- Reviewed scope is exactly the round-nine rework report, the focused test, and
  `canonical.ts`, `custodian.ts`, and `loader.ts`. Each changed source/test path
  is a regular file and root `node_modules` is a directory, not a symlink. No
  bundle, frozen SPEC/PLAN/DECISIONS, generated file, product file, C2-C4 file,
  or `.hermes` path changed.

## Mutation and report-integrity evidence

- The self-restoring push-to-live-hash mutation is harmful in three of three
  fresh processes: it turns a wrong token into `quick_arm: ON` while all tested
  descriptors appear restored at the check boundary.
- Leaving push changed is caught by the new post-Zod check; restoring it inside
  the callback distinguishes the missing temporal guarantee.
- Restoring every Hash/push/regex/crypto descriptor returns the canonical hash
  to the exact pin, so the failures are not dirty-process artifacts.
- `git diff --check fc9a46be..7045681b` exits 2 at
  `.superpowers/sdd/PLAN-FixAgent/FIX-09-C1-ROUND-9-REWORK.md:100` for a new
  blank line at EOF; the report's `git diff --check passes` statement is not
  reproducible.

## Post-report state

This review wrote only this round-ten Sol report. It did not edit product,
tests, fixtures, package state, frozen authority, generated output, or
`.hermes`, and it performed no V acceptance, merge, push, or external-state
operation.
