# FIX-09 C1 round-three rework report

## Scope

- Branch: `codex/oa-fix-09`
- Rework base: `0813fc71be6555452e6104c56b6767158fa326d1`
- Scope: C1 policy snapshot return semantics, single-pass hostile-input handling, focused tests, and this report only.
- All reviewer-authored Sol reports remain untracked and are excluded from the implementation commit.
- Not performed: C2-C4, V acceptance, merge, board write, or operational arming.

## Corrections

### Return the validated snapshot

- Canonical projection recursively creates and freezes fresh own-data snapshots. Object records have null prototypes; arrays are fresh, dense, own-indexed, and frozen.
- The exported policy schema performs one guarded projection of caller input. It validates that snapshot with the content schema, discards Zod's ordinary-object output, and returns the exact frozen snapshot.
- Cross-field status/value and duplicate checks execute against the snapshot rather than Zod's reconstructed objects.
- The focused test recursively compares the returned bundle with the independently parsed fixture: every expected record member and array index is own data, every record prototype is null, and every container is frozen.
- Under non-writable inherited `quick_arm: ON` and a setterless inherited `floor_deny_globs` getter returning `[]`, load returns own `quick_arm: OFF`, the exact own floor list, and a true live floor decision without invoking the getter.

### Bound volatile repins

- Policy snapshot errors are converted into schema issues inside the single transform, so `safeParse` does not leak projection traps.
- Custodian policy parsing maps any schema or projection failure to the bounded `RepinRefusedError` / `REPIN_REFUSED` outcome.
- A stateful proxy is accepted on its permitted first traversal, proves exactly one caller traversal, and is refused without leaking its sentinel when an authenticated repin encounters its hostile second traversal.

The independent canonical bundle hash remains `aa76b3fe955ca5d46bcdf05d7b8f78ac27c25341104bf0b3810b6fc833497ecd`.

## RED, GREEN, mutants, and neighbors

- Initial round-three RED: 2 focused failures and 18 passes. The polluted successful load lacked its own `quick_arm`; the volatile proxy leaked `SECOND_TRAVERSAL` from the redundant transform pass.
- Return-Zod-clone mutant: returning `validated.data` instead of the snapshot produced two targeted failures, including the inherited armed value and lost own cross-field data.
- Double-traversal mutant: adding a second `canonicalProjection(value)` made the volatile-input test fail on its first schema call.
- Safe policy neighbors: the checked-in bundle retains its exact bytes/hash, complete own inputs still validate under prototype pollution, invalid status/value pairs remain rejected, and valid cross-field data remains accepted from the snapshot.
- Safe custodian neighbors: valid own-data repins still work and a valid authenticated request with no `next_bundle` still returns a validated current policy.
- Every mutant was restored before final verification.

## Final verification

- `pnpm vitest run tests/unit/fix09-bundle.test.ts --reporter=verbose` — 21/21 passed after restoration; the final three-run evidence is recorded immediately before commit.
- `pnpm generate:contract` — passed with no generated delta.
- `pnpm typecheck` — no C1 diagnostic; exactly the documented eight pre-existing `tests/unit/s14-ui.test.ts` diagnostics remain.
- `pnpm audit:source` — no C1 finding; exactly the three documented pre-existing direct-environment findings under `packages/obs-capture/install/{api,runner,scheduler}.ts` remain.
- The independent hash, text-byte, static implementation, symlink, frozen-interface, and exact-scope checks are recorded immediately before commit.

This report records a C1 implementation milestone and does not constitute acceptance of FIX-09.
