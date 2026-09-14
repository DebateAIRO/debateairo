# FIX-09 C1 Sol review — round 5

Review target: branch `codex/oa-fix-09`, commit
`9afd1ef0b27e56c7dacaad1ab16d3e4d4ec0686b`, reviewed as
`1659c41add4a8766fc5f1b629238458d54591081..9afd1ef0b27e56c7dacaad1ab16d3e4d4ec0686b`.
The original C1 base remains
`2b670d3059c60d7262cf655bd5d402c88100dff3`.

## Findings

### F1 — P1 — inherited descriptor `value` launders all 19 accessor-backed policy values

Affected code:

- `tools/obs-listener/policy/canonical.ts:15-25`
- `tests/unit/fix09-bundle.test.ts:685-753`

`dataPropertyValue` uses `"value" in descriptor`, which includes inherited
members. If `Object.prototype.value` exists, an accessor descriptor therefore
looks like a data descriptor; the subsequent `descriptor.value` read executes
the inherited getter and uses its result as policy data.

An independent matrix replaced each of the 16 `register_seeds[*].value` and
three `slots.*.value` data members with a throwing own accessor. A temporary
`Object.prototype.value` getter mapped each descriptor's own `get` function to
the original fixture value. `policyBundleSchema.safeParse` accepted **19/19**
invalid accessor-backed candidates, invoked the inherited getter **19** times,
and invoked the source accessors zero times. The same construction on
`quick_arm` returned a successful own, frozen `OFF` snapshot with the unchanged
canonical pin, even though the caller supplied no data value there.

This defeats the own-plain-data boundary and permits ambient prototype code to
synthesize validated policy content. The new missing-value tests cover deletion
only, so they do not exercise the accessor-descriptor plus descriptor-prototype
combination. Data-descriptor recognition must require an own `value` member
before it is read.

### F2 — P1 — the same collision reopens the token and `next_bundle` guards

Affected code:

- `tools/obs-listener/policy/custodian.ts:28-36`
- `tools/obs-listener/policy/custodian.ts:47-60`

Both custodian helpers repeat the prototype-aware `"value" in descriptor`
test. A request with throwing own accessors for both `token` and `next_bundle`
was combined with an `Object.prototype.value` getter that returned the matching
fixture token for the token descriptor and an `ON` candidate for the bundle
descriptor. With the ordinary matching environment token, `repin` returned a
policy whose `quick_arm` was `ON`; the inherited getter ran three times and
neither request accessor ran.

This does not break `timingSafeEqual`; it bypasses the preceding own-data
selection that is supposed to decide what bytes and candidate reach it. It also
means the purported descriptor-only `next_bundle` selection can execute and
accept inherited prototype behavior. Require an own data descriptor and read
its value once into a local before type checking or selection.

### F3 — P1 — the numeric-pollution escape hatch covers only index zero and weakens the schema

Affected code:

- `tools/obs-listener/policy/loader.ts:233-238`
- `tools/obs-listener/policy/loader.ts:528-552`
- `tests/unit/fix09-bundle.test.ts:464-588`

`numericArrayPrototypePollution` searches only for property `"0"`. With an
inherited numeric accessor at `Object.prototype["1"]`, the unchanged complete
bundle still parsed, but Zod's array/code-generation path invoked the inherited
setter 43 times; the captured first stack entered Zod `Doc.write` via
`Array.push`. With non-writable inherited data at indices `1`, `2`, `10`, or
`46`, the unchanged complete bundle returned `success: false`. Thus the
descriptor-safe projection is dense and exact, but the secondary validation
path still executes inherited setters or rejects a valid policy for every
tested live index beyond zero.

The `"0"` branch has the opposite failure: it skips Zod and trusts a manual
preflight that is not equivalent to the declared content schema. In particular,
`pinnedSet` uses `Number.isInteger`, while Zod `.int()` rejects unsafe integers.
Changing `scope_file_list.count` to `Number.MAX_SAFE_INTEGER + 1` was rejected
with a clean prototype but accepted when `Object.prototype["0"]` was present.

The pollution path must neither enter pollution-sensitive library array writes
nor omit any content constraint. Tests need live numeric indices beyond zero
and at least one differential invalid-value case between the preflight and the
secondary schema.

## Verdicts

- **SPEC: REWORK** — F1 accepts non-data policy input and executes an inherited
  getter; F2 reopens the one-custodian token/candidate boundary; F3 makes policy
  validity depend on ambient numeric prototype state. These violate the
  fail-closed bundle/loader and immutable authority-floor requirements in
  FIX-09-R01/R02/R12.
- **CODE QUALITY: REWORK** — the descriptor predicates are not actually own-data
  predicates, and the numeric-pollution fallback maintains two observably
  different validation contracts.

This is a C1 round-five review of the round-four rework only. It is not V
acceptance and makes no claim that C2-C4 are implemented.

## Prior-finding disposition

- Round-four F1 is closed for its exact index-zero projection case: the returned
  arrays are dense, own-indexed, recursively frozen, floor-exact, registration
  remains denied, and the canonical hash remains pinned under accessor and
  non-writable `Object.prototype["0"]`. Replacing `defineProperty` with indexed
  assignment was killed by two focused failures. F3 is the uncovered
  beyond-zero/Zod boundary.
- Round-four F2 is closed for missing data members: all 19 deleted `value` paths
  returned failure with zero inherited getter reads and zero raw escapes. F1 is
  the adjacent accessor-descriptor collision, not a deleted-member regression.
- Duplicate JSON members at top level, nested level, escaped-equivalent spelling,
  and `__proto__` remained rejected. All sampled live floor paths and redundant
  spellings denied, malformed paths failed closed, and safe neighboring paths
  remained clear.
- Registry/register pins, the frozen tracer interface, and the memberless
  dispatch arm remained protected by independent fixtures and harmful mutants.
  Clean-prototype accessor, inherited, and trapping token/`next_bundle` cases
  still refuse; F2 is their combined descriptor-prototype counterexample.
- Transparent policy proxies produced the validated snapshot. Throwing
  `getPrototypeOf`, `ownKeys`, and `getOwnPropertyDescriptor` traps each returned
  bounded schema failure without a raw escape.

## Verification evidence

- Focused command: `pnpm vitest run tests/unit/fix09-bundle.test.ts
  --reporter=dot` — **25/25 passed** on each of three consecutive fresh runs.
- Independent malformed matrices: **143/143** deleted object members,
  **52/52** extra named container members, and **97/97** array holes were
  rejected with zero raw escapes. The dedicated 19-path deleted-`value` matrix
  returned **19 failures, 0 escapes, 0 inherited reads**. The accessor-backed
  19-path matrix produced F1.
- Isolated harmful mutants from an archive of the reviewed commit: non-empty
  allowlist — **3 failed, 22 passed**; array indexed assignment — **2 failed,
  23 passed**; changed registry hash — **2 failed, 23 passed**; changed
  `obs.captureQueueMax` — **2 failed, 23 passed**; changed tracer
  `fingerprintVersion` — **1 failed, 24 passed**; added a dispatch member —
  **1 failed, 24 passed**. A JSON-whitespace-only neighbor passed **25/25**.
- The loader-independent fixture imports only `node:crypto` and reproduced
  `aa76b3fe955ca5d46bcdf05d7b8f78ac27c25341104bf0b3810b6fc833497ecd`,
  equal to the independent expected pin. The bundle still records 47 floor
  globs, 12 taxonomy classes, 16 register seeds, an empty allowlist, three null
  slots with exact RP-1/RP-2/RP-3 gates, `quick_arm: OFF`, and one literal V
  custodian.
- `pnpm generate:contract` — exit 0 and no tracked delta. `pnpm typecheck` —
  only the eight documented `tests/unit/s14-ui.test.ts` diagnostics and no C1
  diagnostic. The focused frozen-interface compiler exited 0.
- `pnpm audit:source` — only the three documented pre-existing direct-environment
  findings in `packages/obs-capture/install/{api,runner,scheduler}.ts`.
  `pnpm audit:text-bytes` — exit 0 with
  `REPOSITORY_TEXT_CONTROL_BYTES=0`.
- Static/scope: the reviewed range contains exactly the round-four rework report,
  focused test, `canonical.ts`, and `loader.ts`; `git diff --check` is clean.
  No C2-C4 daemon/watchdog/launchd, database, model, or dispatch behavior was
  added. `DispatchArm` remains one 32-byte memberless line. No product/spec file,
  `.hermes` file, or generated contract was changed by this review.
