# FIX-09 C1 Sol review — round 7

Review target: branch `codex/oa-fix-09`, commit
`e4ade6b5f57d1dd7b4527b8f29d6a87d291a21c6`, reviewed as
`6d4965245a1b7fa308367cc33beac99a0ea02777..e4ade6b5f57d1dd7b4527b8f29d6a87d291a21c6`.
The original C1 base remains
`2b670d3059c60d7262cf655bd5d402c88100dff3`.

## Findings

### F1 — P1 — inherited `toJSON` executes after safe projection and rewrites the canonical bundle hash

Affected code:

- `tools/obs-listener/policy/canonical.ts:176-183`
- `tests/unit/fix09-bundle.test.ts:340-387`
- `tests/unit/fix09-bundle.test.ts:626-819`

`canonicalProjection` now rejects proxies before reflection and returns safe,
frozen data. Its arrays intentionally retain `Array.prototype`, however.
`canonicalJson` then passes that projection to `JSON.stringify`. The JSON
serialization algorithm retrieves `toJSON` before serializing each object, so
every projected array can still consult an inherited `Array.prototype.toJSON`
or `Object.prototype.toJSON`. That lookup occurs after all of the new proxy,
descriptor, and numeric-index gates.

An independent probe loaded the checked-in bundle first, confirmed its clean
hash as
`aa76b3fe955ca5d46bcdf05d7b8f78ac27c25341104bf0b3810b6fc833497ecd`,
and then temporarily installed an inherited `toJSON` getter returning a
function that maps arrays to `[]`. Under both `Object.prototype` and
`Array.prototype`, `bundleHash` invoked the getter **11** times and its
function **11** times and returned
`9f599457152605389d5f95356eda406a4f8bd458030bef876fe568e4d860b2e0` for
the same valid, recursively frozen bundle. A throwing inherited getter ran
once and escaped from `canonicalJson` as the raw
`INHERITED_TOJSON_GETTER_RAN` sentinel. An inherited non-function data value
was a safe neighbor and retained the pinned hash. Every temporary descriptor
was restored in `finally`; product code did not mutate a global prototype.

This makes the R02 authority proof depend on executable ambient prototype
state rather than solely on the policy input, and it gives inherited code a
post-projection execution point in the canonical trust boundary. Replace the
generic `JSON.stringify` traversal with an own-data canonical encoder (it may
use JSON string escaping for primitives, but it must emit projected arrays and
records without inherited `Get("toJSON")` operations). Add Object- and
Array-prototype getter/function cases that require zero calls and the exact
pinned hash, plus a throwing-getter case that cannot escape raw.

## Verdicts

### SPEC: REWORK

F1 violates FIX-09-R02: the canonical hash of the unchanged, valid checked-in
bundle is neither reproducible from its inputs alone nor side-effect-free under
an inherited serialization hook.

### CODE QUALITY: REWORK

The proxy-first projection and numeric lifecycle guards close the round-six
paths, but `canonicalJson` re-enters prototype-aware behavior after that trust
boundary. Canonical serialization must preserve the projection's own-data
guarantee end to end.

This is a C1 round-seven review of the round-six rework only. It is not V
acceptance and makes no claim about C2-C4, merge readiness, or full FIX-09
completion.

## Round-six finding disposition

- Round-six F1 is closed. An independent matrix placed a proxy at each of the
  16 register-seed and three deferred-slot `value` records while an inherited
  `value` getter was live. All **19/19** candidates rejected with zero accepts,
  zero raw escapes, zero source/inherited reads, and zero `getPrototypeOf`,
  `ownKeys`, or `getOwnPropertyDescriptor` traps. Top-level, nested-array,
  cyclic-target, and revoked proxies also refused before traps.
- Round-six F2 is closed. Proxy request, environment, `next_bundle`, and
  request-prototype cases all returned `REPIN_REFUSED` with zero reflection
  traps. Revoked request/environment/bundle proxies were bounded by the same
  refusal. Ordinary valid own-data authentication and lawful repinning remain
  accepted.
- Round-six F3 is closed. Pre-existing canonical indices `0`, `1`, `113`, and
  `4294967294` on both `Object.prototype` and `Array.prototype` refused with
  zero inherited reads/writes, and removal restored clean acceptance after
  every case. Pollution introduced during projection was caught by the
  pre-Zod recheck. Pollution introduced on the first verified Zod string
  refinement was caught by the final scan; cleanup again restored acceptance.
  Eighteen prototype/key neighbors using `00`, `01`, `-0`, `+0`, `1.0`,
  `1e0`, ` 1`, `4294967295`, and `9007199254740991` all accepted with zero
  inherited reads/writes.
- Cyclic ordinary graphs return the stable canonical-data refusal. A graph
  with 10,000 container nodes was accepted at the declared boundary, while
  10,001 container nodes returned `CANONICAL_JSON_NON_PLAIN_DATA`; depth-over-
  256 input also refused without a stack overflow.

## Verification evidence

- Focused command: `pnpm vitest run tests/unit/fix09-bundle.test.ts
  --reporter=dot` — **38/38 passed** on each of three consecutive fresh runs.
- Independent structural matrices rejected **143/143** missing object
  members, **97/97** array holes, and **52/52** extra named container members,
  with zero accepts and zero raw escapes. The separate 19-value proxy matrix
  and token/`next_bundle` matrix produced the round-six dispositions above.
- A clean load returned a recursively frozen own-data snapshot containing 41
  null-prototype records, 11 dense arrays, and 97 own indices. It retained
  `quick_arm: OFF`, an empty allowlist, exactly one literal V custodian, and
  null RP-1/RP-2/RP-3 slots. Eleven sampled frozen-floor paths denied and seven
  safe neighboring paths remained clear. The loaded bundle and the
  loader-independent fixture both produced the pinned `aa76...497ecd` hash;
  the fixture imports only `node:crypto`.
- Isolated harmful mutants from archives of the reviewed commit were killed:
  disabling the canonical/custodian proxy gates produced **6 failed / 32
  passed**; disabling the post-projection, pre-Zod numeric guard produced **1
  failed / 37 passed** and 23 inherited setter calls; skipping declared Zod
  rejection produced **1 failed / 37 passed**. All mutants lived under
  `/private/tmp`, not in this checkout.
- `pnpm generate:contract` — exit 0 in an isolated archive of HEAD. Its three
  generated files were byte-identical to the checkout, which remained
  read-only. `pnpm typecheck` — exit 1 with exactly the eight documented
  `tests/unit/s14-ui.test.ts` diagnostics and no C1 diagnostic. The focused
  frozen-interface compiler exited 0; `DispatchArm` remains the exact 32-byte
  memberless export and the ten-verdict `TracerHook` surface is unchanged.
- `pnpm audit:source` — only the three documented pre-existing direct
  environment findings in
  `packages/obs-capture/install/{api,runner,scheduler}.ts`.
  `pnpm audit:text-bytes` — exit 0 with
  `REPOSITORY_TEXT_CONTROL_BYTES=0`.
- Static/scope: the reviewed range contains exactly the round-six rework
  report, focused test, `canonical.ts`, `custodian.ts`, and `loader.ts`;
  `git diff --check` is clean. Proxy tests precede caller-object reflection at
  every new recursive/custodian boundary. The only success return follows the
  declared Zod validation, and the skip-Zod mutant is killed. Product source
  adds no global prototype mutation, direct environment access, forbidden C1
  import, product edit, `.hermes` edit, or C2-C4 daemon/watchdog/launchd work.
  The worktree dependency tree is a directory and not a `node_modules`
  symlink.

## Post-report verification

A fresh focused run passed **38/38**. Both the reviewed range and this report
passed `git diff --check`; HEAD remained at the reviewed commit. Status
contained only the seven expected untracked Sol reports, including this
round-seven report. This review made no product, SPEC, PLAN, DECISIONS, test,
fixture, `.hermes`, or generated-file edit.
