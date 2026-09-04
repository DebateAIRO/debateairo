# FIX-09 C1 round-seven rework report

## Scope

- Branch: `codex/oa-fix-09`
- Rework base: `e4ade6b5f57d1dd7b4527b8f29d6a87d291a21c6`
- Scope: C1 canonical serialization isolation, focused tests, and this report only.
- All reviewer-authored Sol reports remain untracked and are excluded from the implementation commit.
- Not performed: C2-C4, V acceptance, merge, board write, or operational arming.

## Correction

- `canonicalJson` no longer gives projected arrays or records to the generic JSON serializer. A dedicated canonical serializer emits arrays and records from own data descriptors only.
- Array serialization validates an exact own `length`, dense own indices, no extra own names, and no own symbols. Object serialization obtains own names, sorts them without an inherited method lookup, and reads each value through its own descriptor.
- The serializer never reads `toJSON`, invokes a getter/function, or consults the prototype of a projected container. Returned arrays retain `Array.prototype` for consumers; serialization alone is isolated.
- Only string primitives use `JSON.stringify` for standard JSON escaping. Null, booleans, and finite numbers are emitted directly, including JSON's `-0` to `0` spelling. Non-total values retain stable canonical `TypeError` codes, which the policy loader maps to its typed refusal boundary.
- Nested arrays and records, string control escapes, numeric spellings, whitespace independence, and sorted key order remain byte-compatible with the prior canonical JSON.

## RED, GREEN, mutant, and neighbors

- Initial round-seven RED: the focused `toJSON` run had **3 failed / 1 passed**. An inherited getter/returned function ran 13 times, an inherited data function ran 11 times, and a throwing inherited getter escaped raw. The non-function inherited-data neighbor retained the hash.
- GREEN: the complete focused suite passes **43/43**. Both `Object.prototype` and `Array.prototype` getter, function, and throwing variants produce zero getter/function calls, no raw escape, and the exact pinned hash.
- Generic-serializer mutant: restoring `JSON.stringify(canonicalProjection(value))` caused **3 focused failures / 1 pass**, reproducing 13 getter calls, 11 direct-function calls, and the raw throwing-getter escape.
- Safe neighbors: inherited non-function `toJSON` data remains accepted; checked-in load and lawful authenticated repin remain `OFF`; independent whitespace/key-order behavior and an explicit primitive-byte fixture are unchanged.
- The mutant was restored before final verification.

## Final verification

- `pnpm vitest run tests/unit/fix09-bundle.test.ts --reporter=dot` — **43/43 passed** on each of three consecutive fresh runs.
- `pnpm generate:contract` — passed with no generated delta.
- `pnpm typecheck` — no C1 diagnostic; exactly the documented eight pre-existing `tests/unit/s14-ui.test.ts` diagnostics remain.
- `pnpm audit:source` — no C1 finding; exactly the three documented pre-existing direct-environment findings under `packages/obs-capture/install/{api,runner,scheduler}.ts` remain.
- `pnpm audit:text-bytes` — passed with `REPOSITORY_TEXT_CONTROL_BYTES=0`.
- The loader-independent fixture produced the unchanged canonical bundle hash `aa76b3fe955ca5d46bcdf05d7b8f78ac27c25341104bf0b3810b6fc833497ecd`.
- The frozen-interface compiler exited zero; `DispatchArm` remains memberless and the frozen `TracerHook` surface is unchanged.
- Static inspection finds generic `JSON.stringify` only on a string primitive, no `toJSON` lookup, and no prototype access in canonical serialization. Product diffs contain no direct environment access, process launch, prototype mutation, forbidden C1 import, `.hermes` edit, or C2-C4 daemon/watchdog/launchd addition.
- The worktree dependency tree remains a directory, not a symlink. `git diff --check` is clean and the exact owned scope is `canonical.ts`, the focused test, and this report.

This report records a C1 implementation milestone and does not constitute acceptance of FIX-09.
