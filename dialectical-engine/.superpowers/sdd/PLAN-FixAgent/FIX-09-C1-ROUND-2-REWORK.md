# FIX-09 C1 round-two rework report

## Scope

- Branch: `codex/oa-fix-09`
- Rework base: `c11eb3e6179741cb3eefc1f0b7d59d3454a03313`
- Scope: C1 policy snapshotting, custodian request selection, focused tests, and this report only.
- Both reviewer-authored Sol reports remain untracked and are excluded from the implementation commit.
- Not performed: C2-C4, V acceptance, merge, board write, or operational arming.

## Corrections

### Prototype-safe policy validation

- Canonical projection now recursively creates own-data object snapshots with null prototypes while preserving the canonical JSON bytes.
- The exported policy schema first validates the input as own plain JSON data, then passes the recursive snapshot—not the caller's object—to Zod.
- Missing top-level or nested fields therefore remain missing even if the process-wide `Object.prototype` carries matching non-enumerable values.
- Tests install both `quick_arm: OFF` and `quick_arm: ON` on the real global prototype, plus nested `severity_map.default` and `custodians[0].id` values, and restore every descriptor in `finally`.

### Descriptor-only `next_bundle` selection

- Authenticated requests select `next_bundle` from one own data descriptor without ordinary property access.
- A genuinely missing own member selects the already validated current bundle.
- An accessor, inherited member, descriptor trap, prototype trap, or prototype cycle returns the bounded `RepinRefusedError` / `REPIN_REFUSED` outcome.
- Valid own-data repins and authenticated requests with no `next_bundle` remain accepted neighbors.

The independent canonical bundle hash remains `aa76b3fe955ca5d46bcdf05d7b8f78ac27c25341104bf0b3810b6fc833497ecd`.

## RED, GREEN, mutants, and neighbors

- Initial round-two RED: 4 focused failures and 14 passes. Both global prototype values supplied missing `quick_arm`; two nested inherited fields were accepted; the authenticated getter ran once and leaked its sentinel; inherited/trapping `next_bundle` requests were not refused.
- Snapshot mutant: removing the snapshot transform made both global and nested prototype tests fail again.
- Getter mutant: replacing descriptor selection with `request.next_bundle` invoked the sentinel getter and failed the focused test.
- Safe policy neighbor: a complete bundle with its own `quick_arm` remains valid under either global prototype value.
- Safe custodian neighbors: a valid own-data `next_bundle` repins, and a valid authenticated request with no own `next_bundle` returns the unchanged current policy.
- Every mutant was restored before final verification.

## Final verification

- `pnpm vitest run tests/unit/fix09-bundle.test.ts` — 18/18 passed on each of three consecutive runs.
- `pnpm generate:contract` — passed with no generated delta.
- `pnpm typecheck` — no C1 diagnostic; exactly the documented eight pre-existing `tests/unit/s14-ui.test.ts` diagnostics remain.
- `pnpm audit:source` — no C1 finding; exactly the three documented pre-existing direct-environment findings under `packages/obs-capture/install/{api,runner,scheduler}.ts` remain.
- `pnpm audit:text-bytes` — passed with `REPOSITORY_TEXT_CONTROL_BYTES=0`.
- Static implementation and exact-scope checks are recorded immediately before commit.

This report records a C1 implementation milestone and does not constitute acceptance of FIX-09.
