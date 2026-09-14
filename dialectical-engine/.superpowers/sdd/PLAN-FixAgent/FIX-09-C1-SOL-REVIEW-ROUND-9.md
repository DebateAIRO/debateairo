# FIX-09 C1 Sol review — round 9

Review target: branch `codex/oa-fix-09`, commit
`fc9a46bed1130b75d6181d4267937fbf8628a24b`, reviewed as
`d342e042fb9e556e880e9584bf75aa71b6d2a3ab..fc9a46bed1130b75d6181d4267937fbf8628a24b`.
The original C1 base remains
`2b670d3059c60d7262cf655bd5d402c88100dff3`.

## Findings

### F1 — P1 — inherited Hash helpers can forge both the canonical hash and the custodian token digest

Affected code:

- `tools/obs-listener/policy/canonical.ts:354-357`
- `tools/obs-listener/policy/custodian.ts:25-26`
- `tools/obs-listener/policy/custodian.ts:155-160`

The round-eight rework removes inherited array dispatch from canonical
projection and serialization, but both security decisions end by dispatching
through the mutable prototype of Node's `Hash` object. `bundleHash` calls the
inherited `update` and `digest` methods, and `tokenDigest` repeats the same
dispatch for both the supplied and expected custodian tokens. The prototype is
reachable as `Object.getPrototypeOf(createHash("sha256"))` and both methods are
inherited writable/configurable data properties rather than own methods.

An independent eight-case matrix replaced each of `update` and `digest` with a
getter-returned function, data function, throwing getter, and non-function. The
getter/data `update` variants ran three times, changed the checked-in bundle
hash from `aa76b3fe955ca5d46bcdf05d7b8f78ac27c25341104bf0b3810b6fc833497ecd`
to the empty-input digest
`e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855`,
and authenticated `wrong` against `correct`. The corresponding `digest`
variants ran three times, returned an attacker-selected 64-zero hash, and also
authenticated `wrong` against `correct`. Throwing getters escaped directly as
the raw `HASH_MEMBER_RAN` error from both `bundleHash` and `repin`; non-function
variants escaped as raw `TypeError`s. Restoration in `finally` returned the
clean hash to the pinned `aa76...497ecd` value.

This is not only hash availability. Because both token inputs pass through the
same hostile function, an untrusted caller can make unequal tokens produce the
same digest and pass `timingSafeEqual`. In a separate authenticated-change
probe, a wrong token successfully returned a schema-valid next bundle with
`quick_arm: ON` after the inherited digest path was made constant.

Replace the chained prototype calls with a hash operation that does not resolve
executable members through a mutable object prototype. Add getter-returned,
data, throwing-getter, and non-callable cases for every helper used by canonical
hashing and token hashing. They must not execute, the canonical hash must remain
pinned, and every wrong-token repin must remain `REPIN_REFUSED`.

### F2 — P1 — the loader's three-member guard still enters inherited `Array.prototype.push` through Zod before authentication

Affected code:

- `tools/obs-listener/policy/loader.ts:824-853`
- `tools/obs-listener/policy/loader.ts:856-881`
- `tools/obs-listener/policy/custodian.ts:128-141`

`hasArrayAuthorityPrototypeMutation` checks only `some`, `sort`, and
`Symbol.iterator`, then `safeParsePolicyBundle` calls the complete Zod schema.
That schema path invokes inherited `Array.prototype.push` on arrays it builds.
Wrapping every unguarded callable member of `Array.prototype` while validating
the clean checked-in snapshot identified `push` as actually used 50 times;
the parse still returned success.

A four-variant `push` matrix then demonstrated the live boundary. A
getter-returned no-op function and a data no-op function each executed 45 times
across direct `safeParse`, `loadBundle`, and authenticated `repin`, while all
three operations reported success. A throwing getter and a non-function were
contained as schema/load/repin refusal, but that does not undo execution of the
callable variants inside the authority path.

The execution composes with F1. An independent cross-call probe installed a
`push` wrapper that preserved ordinary Zod behavior via the saved original
function but changed `Hash.prototype.update` to a constant digest path on its
first call. A wrong token then repinned an otherwise valid next bundle from
`quick_arm: OFF` to `quick_arm: ON`; the hostile inherited `push` ran 100 times
while current and next bundles were validated. Thus the unguarded helper is an
authentication-before-validation execution seam, not merely a fail-closed
availability difference.

Make the complete declared-schema validation path independent of inherited
array helpers, rather than enumerating the three helpers found in the previous
round. Add a systematic inherited-helper probe that detects callbacks reached
transitively through the schema library, and include cross-call pollution: a
validation callback must not be able to change the later hash or token result.

## Verdicts

### SPEC: REWORK

F1 violates FIX-09-R02: the same bundle can hash differently, raw exceptions
escape, and a caller without the single custodian's token can authenticate a
re-pin. The demonstrated `quick_arm: ON` repin also defeats the phase-one OFF
posture in FIX-09-R01/R12. F2 preserves an inherited code-execution seam before
that token decision and composes into the same unauthorized repin.

### CODE QUALITY: REWORK

The own-descriptor projection, serializer, floor matcher, and named
`some`/`sort`/iterator repairs are materially stronger, but the authority path
is not end-to-end isolated. A finite allowlist of prototype descriptors did not
cover the schema dependency's actual inherited `push`, and both cryptographic
call sites still use unguarded inherited methods. The new regression test is
therefore green while the same vulnerability class remains reachable.

This is a C1 round-nine review of the round-eight rework only. It is not V
acceptance and makes no claim about C2-C4, merge readiness, or full FIX-09
completion.

## Round-eight finding disposition

- Round-eight F1 is closed for the named projection helpers. A fresh 24-case
  matrix covered `Object.prototype` and `Array.prototype` crossed with `some`,
  `sort`, and `Symbol.iterator`, each as getter-returned function, data
  function, throwing getter, and non-function. There were zero hostile calls,
  zero hash mismatches, and zero raw escapes. All load and repin attempts were
  bounded refusals while a named authority descriptor was hostile.
- Round-eight F2 is closed at the floor consumer. Under all 24 cases, all 31
  frozen-floor samples remained denied and all eight safe neighbours remained
  clear. The clean hash after every restoration was the pinned
  `aa76...497ecd` value.
- Those closures do not close F1/F2 above: `Hash.prototype.update`,
  `Hash.prototype.digest`, and the Zod-reached `Array.prototype.push` are
  different inherited operations actually present in the same C1 authority
  path.

## Carried-boundary evidence

- Focused command: `pnpm vitest run tests/unit/fix09-bundle.test.ts
  --reporter=dot` — **44/44 passed** on each of three consecutive fresh runs.
- The focused suite re-exercised the prior structural matrices: **143/143**
  missing object members, **97/97** array holes, **52/52** extra named members,
  **52/52** own-symbol additions, **143/143** accessor replacements, and a
  proxy at each of all **52** container positions. Accessor/proxy traps remained
  unread.
- The 19 register/deferred-slot `value` boundaries remained refused for all
  **19/19** accessor candidates and **19/19** proxy-normalized candidates. The
  focused suite also retained top-level, nested, cyclic-target, and revoked
  proxy refusal; cycle/depth/node bounds; malformed registry counts;
  status/value consistency; duplicate register/glob rejection; and exact
  taxonomy, routing, register, slot, custody, and quick-arm pins.
- Numeric prototype coverage retained the Object/Array canonical-index matrix,
  clean recovery, eighteen non-index neighbours, and the pre-projection,
  post-projection, and pre-Zod mutation windows. The declared Zod schema still
  runs for a clean ordinary bundle; F2 is specifically the inherited helper it
  executes while doing so.
- Custodian coverage retained malformed request/environment matrices,
  own/inherited/accessor/proxy token and `next_bundle` cases, prototype-chain
  and revoked-proxy refusal, one lawful own-data token, and a lawful deferred
  hash update that leaves its RP gate unchanged. Four duplicate JSON member
  forms still refuse before last-member-wins parsing.
- An independent primitive encoder comparison matched native JSON bytes for
  **11/11** unusual strings and **18/18** finite numeric edges. All **3/3**
  non-finite numbers and **4/4** unsupported primitive kinds refused with
  canonical `TypeError`s.
- The loader-independent fixture, whose only import is `node:crypto`, produced
  `aa76b3fe955ca5d46bcdf05d7b8f78ac27c25341104bf0b3810b6fc833497ecd`.
  The own-descriptor canonical serializer retained exact nested array/record,
  unusual-key order, symbol, sparse/extra/non-enumerable member, accessor,
  proxy, cycle, depth, and node-cap coverage in the focused suite.

## Mutation, contract, interface, and static evidence

- The 24 named inherited-member variants were meaningful safe-neighbour
  mutations and all survived without changing hash or floor. The eight Hash
  prototype variants and the `push`-to-hash cross-call mutation exposed F1/F2;
  every descriptor was restored in `finally`, and a fresh clean hash was
  re-established afterward.
- `node node_modules/typescript/bin/tsc --project
  tests/unit/fixtures/fix09-interface-tsconfig.json` exited 0. The frozen
  compiler fixture still proves the four-field incident input, ten verdicts,
  four external boundaries, exact hook signature, and memberless
  `DispatchArm`; the dispatch file remains exactly 32 bytes.
- The `pnpm generate:contract` wrapper could not create its sandboxed `tsx` IPC
  socket. Running the same entry point as `node --import tsx
  packages/contract/src/generate.ts` exited 0. SHA-256 before and after matched
  for all three generated artifacts and `git diff --exit-code --
  packages/contract/generated` was clean.
- `pnpm typecheck` returned only the same eight documented diagnostics in
  `tests/unit/s14-ui.test.ts` and no C1 diagnostic. The direct source-audit
  entry point reported only the three documented environment reads in
  `packages/obs-capture/install/{api,runner,scheduler}.ts`. The direct text-byte
  audit exited 0 with `REPOSITORY_TEXT_CONTROL_BYTES=0`.
- Static review found no direct array/string/set helper dispatch, spread, or
  `for...of` in the four changed policy files; it did identify the inherited
  Hash chains and declared-schema call reported above. No changed product file
  adds `occurrence_detail`, identity access, `@debateai/db`, process launch,
  model/provider access, direct environment access, or global prototype
  mutation.
- Scope is exactly the round-eight report, focused test, and four C1 policy
  files. No bundle, interface, fixture, product, SPEC/PLAN/DECISIONS,
  `.hermes`, generated, C2-C4, V-acceptance, or merge change is present.
  `git diff --check` passed; `node_modules` is a directory and no nested
  `node_modules` symlink exists.

## Post-report verification

The report and reviewed range pass `git diff --check`. HEAD remains
`fc9a46bed1130b75d6181d4267937fbf8628a24b`. This review wrote only this
round-nine report; all Sol reports remain untracked and no product, test,
fixture, authority, `.hermes`, or generated-file content changed.
