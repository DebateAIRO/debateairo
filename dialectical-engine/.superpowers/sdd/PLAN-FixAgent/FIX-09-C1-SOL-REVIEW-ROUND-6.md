# FIX-09 C1 Sol review — round 6

Review target: branch `codex/oa-fix-09`, commit
`6d4965245a1b7fa308367cc33beac99a0ea02777`, reviewed as
`9afd1ef0b27e56c7dacaad1ab16d3e4d4ec0686b..6d4965245a1b7fa308367cc33beac99a0ea02777`.
The original C1 base remains
`2b670d3059c60d7262cf655bd5d402c88100dff3`.

## Findings

### F1 — P1 — proxy descriptor normalization still launders inherited values into policy data

Affected code:

- `tools/obs-listener/policy/canonical.ts:55-76`
- `tools/obs-listener/policy/canonical.ts:91-107`
- `tests/unit/fix09-bundle.test.ts:892-987`

The new `Object.hasOwn(descriptor, "value")` predicates correctly reject an
ordinary accessor descriptor. They run too late for a proxy, however.
`Object.getOwnPropertyDescriptors(proxy)` first converts the trap's returned
descriptor-like object with ECMAScript `ToPropertyDescriptor`. That conversion
uses inherited `value`; it then returns a newly normalized descriptor with an
*own* `value`. The predicate can no longer tell that the source property was an
accessor and the value came from `Object.prototype`.

An independent matrix replaced each of the 16 register-seed and three slot
`value` members with an own throwing accessor, wrapped that record in a proxy,
and had its descriptor trap return no own `value`. An inherited
`Object.prototype.value` getter supplied the original value. All **19/19**
invalid candidates were accepted; the inherited getter ran 19 times and the
source accessors zero times. A top-level variant supplied inherited `"ON"` for
an accessor-backed `quick_arm`; parsing succeeded and returned an own, frozen
armed policy.

Thus round-five F1 is closed only for non-proxy objects. Fail closed on proxies
before descriptor extraction, recursively (for example with a trusted
`node:util` proxy test), or narrow the public boundary to values produced by
the unique-key JSON parser. Add proxy trap-result cases with inherited getter
and inherited data `value`, not only direct accessor descriptors.

### F2 — P1 — proxy descriptors can authenticate a token and select an armed bundle

Affected code:

- `tools/obs-listener/policy/custodian.ts:28-36`
- `tools/obs-listener/policy/custodian.ts:47-60`
- `tests/unit/fix09-bundle.test.ts:1041-1190`

`Object.getOwnPropertyDescriptor(proxy, key)` performs the same normalization
before `ownStringProperty` or `ownOptionalDataProperty` receives the
descriptor. A proxy request whose real `token` and `next_bundle` properties
were throwing accessors returned descriptor-like objects with no own `value`;
an inherited `Object.prototype.value` getter supplied the matching token and
an `ON` policy. `repin` returned `quick_arm: ON`; the inherited getter ran twice
and neither source accessor ran. Separate non-writable inherited-data variants
also laundered the token and `next_bundle`, each producing an armed result.

This bypasses the single-custodian boundary rather than merely leaking a raw
error. Reject proxy request/environment containers before asking them for
descriptors, and cover normalized trap results independently for request token,
environment token, and optional `next_bundle`.

### F3 — P2 — numeric pollution introduced during projection passes the one-time gate

Affected code:

- `tools/obs-listener/policy/loader.ts:545-560`
- `tests/unit/fix09-bundle.test.ts:531-720`

The generic numeric scan runs once, before the only caller-controlled
projection. A transparent policy proxy installed an accessor at
`Object.prototype["1"]` from its first `getPrototypeOf` trap, after line 547
had reported a clean environment. The parser then entered Zod, invoked the
inherited setter **23** times, and returned `success: true`. The returned policy
was the safe snapshot, and this probe did not bypass a schema constraint, so
this is lower severity than F1/F2; it nevertheless contradicts the claimed
fail-closed-before-Zod behavior.

Recheck numeric prototypes after the last caller-controlled traversal and
immediately before secondary schema validation. Add a proxy that introduces
pollution during projection and assert bounded refusal with zero inherited
getter/setter calls.

## Verdicts

- **SPEC: REWORK** — F1 can synthesize `quick_arm: ON` policy input and F2 can
  authenticate/select an armed repin, violating FIX-09-R01/R02/R12. F3 also
  leaves the numeric fail-closed gate temporally incomplete.
- **CODE QUALITY: REWORK** — the predicates check normalized descriptor
  objects, not source-property provenance, and the numeric guard has a
  caller-traversal time-of-check/time-of-use gap.

This is a C1 round-six review of the round-five rework only. It is not V
acceptance and makes no claim about C2-C4, merge readiness, or full FIX-09
completion.

## Round-five finding disposition

- Round-five F1 is fixed for direct ordinary-object descriptors: the focused
  inherited-getter and inherited-data accessor matrices rejected 19/19 with
  zero source or inherited reads; an independent getter matrix and all 19
  missing `value` candidates also rejected. F1 above is the uncovered
  proxy-normalization path; its proxy matrix accepted 19/19.
- Round-five F2 is fixed for direct ordinary request/environment accessors,
  inherited members, and throwing descriptor traps: 15 malformed request and
  nine malformed environment forms all produced `REPIN_REFUSED`, with zero
  accessor reads. F2 is the adjacent successful descriptor-normalization case.
- Round-five F3 is fixed when numeric pollution exists before the call. Across
  both `Object.prototype` and `Array.prototype`, canonical indices including
  `0`, `1`, `113`, and `4294967294` refused; accessor, writable-data, and
  non-writable-data variants refused without reads/writes. Non-indices such as
  `00`, `01`, `-0`, `+0`, `1.0`, `1e0`, ` 1`, `4294967295`, and
  `9007199254740991` remained accepted neighbors. Removing pollution restored
  clean acceptance on the next call. Every clean accepted policy still entered
  the declared Zod schema, and 36 malformed count cases across all six pinned
  sets rejected. F3 above is the after-scan introduction gap.

## Verification evidence

- Focused command: `pnpm vitest run tests/unit/fix09-bundle.test.ts
  --reporter=dot` — **29/29 passed** on each of three consecutive fresh runs.
- Valid-policy probes: checked-in load and authenticated repin returned the
  exact recursively frozen own-data snapshot; record prototypes were null,
  arrays were dense and own-indexed, `quick_arm` was `OFF`, the allowlist was
  empty, registration remained floor-denied, and both hashes were
  `aa76b3fe955ca5d46bcdf05d7b8f78ac27c25341104bf0b3810b6fc833497ecd`.
- Independent boundary probes: four duplicate JSON forms (top-level, nested,
  escaped-equivalent, and `__proto__`) rejected; 11 floor samples and 11
  malformed paths denied while seven neighboring paths stayed clear; nested
  arrays projected exact/frozen/own and a nested hole rejected; own symbols
  rejected while prototype symbols were inert.
- Isolated harmful mutants: restoring prototype-aware `"value" in descriptor`
  produced **3 failed / 26 passed**; reducing numeric detection to key zero
  produced **2 failed / 27 passed**; skipping Zod produced **1 failed / 28
  passed**. A JSON-whitespace-only neighbor passed **29/29**.
- The loader-independent fixture imports only `node:crypto` and reproduced the
  pinned hash above.
- `pnpm generate:contract` — exit 0 and no tracked delta.
- `pnpm typecheck` — exit 1 with exactly the eight documented
  `tests/unit/s14-ui.test.ts` diagnostics and no C1 diagnostic. The focused
  frozen-interface compiler exited 0; `DispatchArm` remains the exact 32-byte
  memberless export.
- `pnpm audit:source` — only the three documented pre-existing direct
  environment findings in
  `packages/obs-capture/install/{api,runner,scheduler}.ts`.
  `pnpm audit:text-bytes` — exit 0 with
  `REPOSITORY_TEXT_CONTROL_BYTES=0`.
- Static/scope: the reviewed range is exactly the round-five rework report,
  focused test, `canonical.ts`, `custodian.ts`, and `loader.ts`; `git diff
  --check` is clean. Product source contains all four own-`value` predicates,
  an unconditional declared-Zod call, and no global prototype mutation,
  forbidden C1 import/environment access, `.hermes` edit, SPEC/PLAN/DECISIONS
  edit, or C2-C4 daemon/watchdog/launchd addition. The worktree dependency tree
  is a directory and contains no `node_modules` symlink.

## Post-report verification

A fresh focused run passed **29/29**. Both independent boundary scripts then
reproduced F1-F3 and all passing neighbor counts above; the frozen-interface
compiler exited 0 and `git diff --check 9afd1ef0..6d496524` remained clean.
HEAD remained at the reviewed commit. Status contained only the six expected
untracked Sol reports, including this round-six report; this review made no
product, SPEC, PLAN, DECISIONS, test, fixture, `.hermes`, or generated-file
edit.
