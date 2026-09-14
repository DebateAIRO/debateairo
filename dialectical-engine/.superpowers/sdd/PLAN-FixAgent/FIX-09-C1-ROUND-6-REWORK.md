# FIX-09 C1 round-six rework report

## Scope

- Branch: `codex/oa-fix-09`
- Rework base: `6d4965245a1b7fa308367cc33beac99a0ea02777`
- Scope: C1 proxy rejection, bounded canonical projection, numeric-prototype time-of-check hardening, focused tests, and this report only.
- All reviewer-authored Sol reports remain untracked and are excluded from the implementation commit.
- Not performed: C2-C4, V acceptance, merge, board write, or operational arming.

## Corrections

### Trap-free proxy refusal

- Canonical projection uses Node's stable `node:util/types` `isProxy` detector before `Array.isArray`, prototype inspection, key enumeration, or descriptor extraction for every caller-provided object and array node.
- Proxy policy roots and recursively nested proxy records/arrays fail closed before `getPrototypeOf`, `ownKeys`, or `getOwnPropertyDescriptor` traps can run. Revoked proxies are refused without a raw throw.
- The custodian applies the same proxy-first boundary to request and environment containers and rejects proxy nodes encountered in request prototype traversal. Proxy-normalized token and `next_bundle` descriptors therefore cannot authenticate or select a replacement bundle.
- Canonical traversal tracks the active path and enforces depth and node caps. Cyclic and over-depth graphs return the stable canonical-data refusal instead of escaping as a stack overflow.

### Numeric-prototype time-of-check closure

- The generic numeric-prototype scan still runs before projection, and now runs again after the final caller-controlled traversal immediately before the declared Zod schema. A final scan also guards acceptance.
- A hostile attempted projection cannot install an inherited numeric setter and then enter Zod. The implementation does not invoke or mutate hostile prototypes and has no manual-validation or skip-Zod acceptance branch.
- Arrays continue to be projected with exact length and explicit own data-property definition for every index. Accepted records retain recursively null prototypes, and the returned validated snapshot—not Zod's ordinary-object clone—is frozen and returned.

## RED, GREEN, mutants, and neighbors

- Initial round-six RED: **7 failed / 29 passed**. The two 19-path proxy matrices reached 35 descriptor traps each, the custodian proxy case reached two descriptor traps, a transparent policy proxy was accepted, post-projection pollution was accepted, and a cyclic graph escaped as a raw stack overflow.
- GREEN: the focused suite now passes **38/38**. Both 19-path policy matrices reject with zero source/inherited getter calls and zero proxy traps. Top-level, nested-array, request, environment, prototype-chain, and revoked proxies produce bounded refusal; a proxy trap capable of installing numeric prototype pollution is never invoked.
- Missing-proxy-first mutant: disabling the canonical and custodian proxy gates caused **4 focused failures**; the tests observed 35 policy descriptor traps, two custodian descriptor traps, and policy-proxy acceptance.
- Missing-post-projection-guard mutant: deleting the guard immediately before Zod caused the focused temporal test to fail after **43 inherited setter calls**.
- Safe neighbors: checked-in ordinary JSON and recursively null-prototype policy records remain accepted; malformed nested values, cycles, and over-cap graphs reject; the existing numeric-index/non-index matrix, exact frozen shape, floor denial, independent hash, and authenticated lawful repin cases remain green.
- Every mutant was restored before final verification.

## Final verification

- `pnpm vitest run tests/unit/fix09-bundle.test.ts --reporter=dot` — **38/38 passed** on each of three consecutive fresh runs.
- `pnpm generate:contract` — passed with no generated delta.
- `pnpm typecheck` — no C1 diagnostic; exactly the documented eight pre-existing `tests/unit/s14-ui.test.ts` diagnostics remain.
- `pnpm audit:source` — no C1 finding; exactly the three documented pre-existing direct-environment findings under `packages/obs-capture/install/{api,runner,scheduler}.ts` remain.
- `pnpm audit:text-bytes` — passed with `REPOSITORY_TEXT_CONTROL_BYTES=0`.
- The loader-independent hash fixture produced the unchanged canonical bundle hash `aa76b3fe955ca5d46bcdf05d7b8f78ac27c25341104bf0b3810b6fc833497ecd`.
- The focused frozen-interface compiler exited zero; `DispatchArm` remains the exact 32-byte memberless interface and the frozen `TracerHook` surface is unchanged.
- Reflection/static scans confirm proxy detection precedes caller-object reflection. Product diffs contain no direct environment access, process launch, prototype mutation, forbidden C1 import, `.hermes` edit, or C2-C4 daemon/watchdog/launchd addition.
- The worktree dependency tree is a directory, not a symlink. `git diff --check` is clean and the exact owned scope is the three C1 product files, focused test, and this report.

This report records a C1 implementation milestone and does not constitute acceptance of FIX-09.
