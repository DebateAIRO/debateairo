# FIX-09 C1 Sol review — round 8

Review target: branch `codex/oa-fix-09`, commit
`d342e042fb9e556e880e9584bf75aa71b6d2a3ab`, reviewed as
`e4ade6b5f57d1dd7b4527b8f29d6a87d291a21c6..d342e042fb9e556e880e9584bf75aa71b6d2a3ab`.
The original C1 base remains
`2b670d3059c60d7262cf655bd5d402c88100dff3`.

## Findings

### F1 — P1 — inherited array helpers still execute before the own-descriptor serializer and can rewrite the canonical hash

Affected code:

- `tools/obs-listener/policy/canonical.ts:121`
- `tools/obs-listener/policy/canonical.ts:139`
- `tools/obs-listener/policy/canonical.ts:293-300`
- `tests/unit/fix09-bundle.test.ts:376-574`

The new `serializeCanonical` emitter closes the round-seven inherited `toJSON`
path. `canonicalJson`, however, still feeds it through `canonicalProjection`.
That projection calls `.some()` on an internal array, calls `.sort()` on another
internal array, and consumes the sorted array with `for...of`. Those operations
resolve executable properties through `Array.prototype` before the new emitter
runs. The canonical hash is therefore still dependent on ambient inherited
code rather than solely on the policy input.

An independent probe loaded the valid checked-in bundle and first confirmed
`aa76b3fe955ca5d46bcdf05d7b8f78ac27c25341104bf0b3810b6fc833497ecd`.
A temporary inherited `Array.prototype.sort` data function returning `[]` ran
once and silently changed the same bundle's hash to
`44136fa355b3678a1146ad16f7e8649e94fb4fc21fe77e8310c060f61caaff8a`,
the SHA-256 of `{}`. An inherited `Symbol.iterator` getter and returned function
ran once each and produced that same altered hash. A throwing inherited `sort`
getter escaped directly from `bundleHash` as the raw
`INHERITED_SORT_GETTER_RAN` sentinel; `loadBundle` wrapped the hook in
`PolicyBundleLoadError`, and `repin` mapped it to `RepinRefusedError`. A
throwing inherited `some` getter at the array projection path ran once and also
escaped raw from `bundleHash`.

Every temporary descriptor was restored in `finally`, after which the clean
hash returned to `aa76...497ecd`. No product source mutated a global prototype.

Replace the `.some()`, `.sort()`, and `for...of` projection operations with
own-descriptor indexed loops, including an intrinsic-free deterministic key
sort. Add inherited getter, data-function, throwing, and non-function neighbors
for `sort`, `some`, and `Symbol.iterator`; they must execute zero times and keep
the pinned hash across direct hash, load, and authenticated repin calls.

### F2 — P1 — inherited `Array.prototype.some` can clear the frozen path/glob floor

Affected code:

- `tools/obs-listener/policy/loader.ts:666-674`
- `tests/unit/fix09-bundle.test.ts:576-638`

`isFloorDenied` calls `bundle.floor_deny_globs.some(...)`. The loaded array is
frozen and dense, but intentionally retains `Array.prototype`, so a later
inherited method change remains executable at the enforcement point. In an
independent lifecycle probe, a temporary `Array.prototype.some` data function
returning `false` ran once and changed the verdict for
`tools/obs-listener/policy/bundle.json` from denied to clear. Restoring the
descriptor immediately restored the denial.

This is a direct floor bypass of FIX-09-R01/R05/R12. It also shows that the
existing path matrix proves the checked-in patterns only under a clean ambient
prototype. Evaluate the frozen glob array through its own `length` and own
indexed data descriptors, without an inherited array method. Add a regression
requiring the tools path and every frozen-floor sample to remain denied with
zero inherited `some` getter/function calls, plus the existing safe-neighbor
set.

## Verdicts

### SPEC: REWORK

F1 violates FIX-09-R02 because a party hashing the unchanged valid bundle can
obtain a different digest or a raw exception solely from inherited ambient
code. F2 violates the mandatory path/glob floor in FIX-09-R01/R05/R12.

### CODE QUALITY: REWORK

The new emitter is own-descriptor based, byte-compatible, and closes inherited
`toJSON`, but the trust boundary is not end-to-end: its projection and floor
consumer still dispatch through mutable inherited array helpers. The focused
suite does not exercise those helpers, and a no-sort emitter mutant survived
because projection had already performed the vulnerable inherited sort.

This is a C1 round-eight review of the round-seven rework only. It is not V
acceptance and makes no claim about C2-C4, merge readiness, or full FIX-09
completion.

## Round-seven finding disposition

- Round-seven F1 is closed at the new emitter. A nine-case independent matrix
  installed inherited getter/returned-function, data-function, and throwing
  `toJSON` variants on `Object.prototype`, `Array.prototype`, and
  `String.prototype`. All cases produced zero getter/function calls, no raw
  escape, the pinned bundle hash, and exact nested bytes. Custom nested object
  and array prototypes carrying throwing `toJSON` getters refused as canonical
  non-plain data with zero getter calls.
- Primitive encoding matched native JSON bytes for nine unusual strings,
  including all control escapes, U+2028/U+2029, lone surrogates, a surrogate
  pair, composed/decomposed Unicode, and U+FFFF; eighteen finite numeric edge
  values matched as well, including `-0`, minimum/maximum values, exponent
  thresholds, and safe-integer boundaries. Three non-finite numbers and four
  unsupported primitive kinds refused with stable canonical errors.
- Dense nested arrays and records serialized exactly. Thirteen unusual object
  keys sorted deterministically. Sparse arrays, an extra array name, a
  non-enumerable index, own symbols on objects/arrays, a symbol value, and an
  accessor-backed member all refused; the accessor was never read.

## Carried-boundary evidence

- Focused command: `pnpm vitest run tests/unit/fix09-bundle.test.ts
  --reporter=dot` — **43/43 passed** on each of three consecutive fresh runs.
- Independent structural matrices refused **143/143** missing object members,
  **97/97** array holes, **52/52** extra named container members, **52/52** own
  symbol additions, and **143/143** accessor replacements with zero accessor
  reads. A proxy at each of all **52** container positions refused with zero
  `getPrototypeOf`, `ownKeys`, or descriptor traps.
- The 19 register/deferred-slot `value` boundaries refused all **19/19** direct
  accessor candidates and all **19/19** proxy-normalized descriptor candidates
  with zero source/inherited reads and no acceptance. Top-level, nested,
  cyclic-target, and revoked proxies remain proxy-first refusals. Cycles,
  excessive depth, and over-cap graphs retain their bounded canonical refusal.
- Numeric prototype matrices refused the eight canonical index/prototype pairs
  (`0`, `1`, `113`, `4294967294` on Object and Array), accepted all eighteen
  non-index neighbors, made zero getter/setter calls, and returned to clean
  acceptance after every restoration. Writable, non-writable, and accessor
  descriptor variants refused at all sampled canonical indices. Malformed
  registry counts and status/value mismatches remained schema failures.
- Custodian matrices refused fifteen malformed request tokens and nine malformed
  environments with zero accessor reads. Inherited/accessor/proxy request,
  environment, token, and `next_bundle` cases remained `REPIN_REFUSED`; a valid
  own-data token and valid own-data `next_bundle` still repinned lawfully.
- Duplicate-key probes rejected four top-level, nested, escaped-equivalent, and
  `__proto__` cases before last-member-wins parsing. Path probes denied eleven
  frozen-floor paths and eleven malformed/traversal paths while seven safe
  neighbors remained clear. The focused test independently covers 31 denied
  samples and eight safe neighbors.
- The loaded snapshot remains recursively frozen and own-data, with 41
  null-prototype records, 11 dense arrays, and 97 own indices. It retains 47
  floor globs, five production-source globs, twelve taxonomy classes, five
  V-owned routes, sixteen register seeds, an empty allowlist, exactly one
  literal V custodian, `quick_arm: OFF`, and null RP-1/RP-2/RP-3 values. The
  independent fixture, which imports only `node:crypto`, produced the pinned
  `aa76...497ecd` hash.

## Mutation, contract, interface, and static evidence

- In an isolated archive of `d342e042`, restoring generic
  `JSON.stringify(canonicalProjection(value))` produced **3 failed / 2 passed**
  across the five round-seven serializer tests, reproducing 13 getter calls,
  11 inherited data-function calls, and the raw throwing-getter escape. A
  second mutant disabling the new emitter's selection-sort comparison survived
  **2/2** order-focused tests because `canonicalProjection` had already sorted
  keys through the inherited `.sort()` identified in F1. The archive was
  restored after both probes.
- Contract generation ran in the isolated archive using the direct `tsx`
  loader entry point; all three generated artifacts were byte-identical to the
  checkout. The checkout remained unmodified.
- `pnpm typecheck` returned the same eight documented
  `tests/unit/s14-ui.test.ts` diagnostics and no C1 diagnostic. The focused
  frozen-interface compiler exited 0; `DispatchArm` remains the exact 32-byte
  memberless export, and the ten-verdict `TracerHook` surface is unchanged.
- The direct source-audit entry point reported only the three documented
  pre-existing environment reads under
  `packages/obs-capture/install/{api,runner,scheduler}.ts`. The direct text-byte
  audit exited 0 with `REPOSITORY_TEXT_CONTROL_BYTES=0`. The `pnpm` wrappers for
  those two TypeScript entry points could not create their sandboxed `tsx` IPC
  socket, so the same scripts were rerun as `node --import tsx ...`.
- Static/scope: the reviewed range contains exactly `canonical.ts`, the focused
  test, and the round-seven rework report; `git diff --check` is clean. It adds
  no direct environment access, process launch, product edit, `.hermes` edit,
  global prototype mutation, forbidden import, or C2-C4 daemon/watchdog/launchd
  work. The checkout dependency tree is a directory, not a symlink.

## Post-report verification

A fresh focused run passed **43/43**. Both the reviewed range and this report
passed `git diff --check`; HEAD remained at `d342e042`. Status contained only
the eight expected untracked Sol reports, including this round-eight report.
This review made no product, SPEC, PLAN, DECISIONS, test, fixture, `.hermes`, or
generated-file edit.
