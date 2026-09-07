# FIX-09 C1 round-four rework report

## Scope

- Branch: `codex/oa-fix-09`
- Rework base: `1659c41add4a8766fc5f1b629238458d54591081`
- Scope: C1 canonical array snapshotting, total policy validation, focused tests, and this report only.
- All reviewer-authored Sol reports remain untracked and are excluded from the implementation commit.
- Not performed: C2-C4, V acceptance, merge, board write, or operational arming.

## Corrections

### Pollution-proof canonical arrays

- Canonical projection takes the array length and every element from own data descriptors.
- A fresh exact-length array receives each index through `Object.defineProperty`; no inherited numeric setter or non-writable prototype member can intercept an element write. Every required index is own before the array is frozen.
- Path normalization no longer uses array writes, so policy loading and live floor evaluation do not invoke an inherited numeric accessor outside projection either.
- Focused probes install accessor and non-writable `Object.prototype["0"]` values. The checked-in policy still returns dense own-indexed arrays, `quick_arm: OFF`, the exact floor/register values, a true registration-floor denial, and the unchanged canonical pin with zero accessor calls.

### Total malformed-value boundary

- One guarded canonical snapshot is the sole traversal of caller input. Validation and cross-field checks operate on that recursively frozen snapshot, and the exact snapshot—not an ordinary Zod clone—is returned.
- A pollution-safe structural preflight mirrors the content contract before any library validation-error path. All 16 register-seed and three slot `value` omissions therefore return `{ success: false }` without reading a hostile inherited getter or leaking a raw error.
- Zod remains a secondary content validator when numeric prototypes are clean. When a numeric prototype is polluted, the complete structural preflight and cross-field validation protect the boundary without exposing Zod's ordinary array reconstruction to inherited writes.
- `loadBundle` and authenticated custodian repins continue to translate validation failures into `PolicyBundleLoadError` and `RepinRefusedError` respectively.

The independent canonical bundle hash remains `aa76b3fe955ca5d46bcdf05d7b8f78ac27c25341104bf0b3810b6fc833497ecd`.

## RED, GREEN, mutants, and neighbors

- Initial round-four RED: 4 failures and 21 passes. The accessor and non-writable numeric prototype cases escaped raw errors; both 19-path missing-value matrices recorded zero bounded failures and 19 raw escapes. The throwing getter was invoked.
- Array-write mutant: replacing the own descriptor definition with ordinary indexed assignment failed both numeric-pollution regressions.
- Raw-Zod mutant: invoking the content schema before the total boundary failed both 19-path missing-value regressions with raw escapes.
- Safe neighbors: a complete bundle remains valid; numeric pollution cannot make invalid `quick_arm` or register status/value data pass; clean-prototype Zod validation remains active; exact snapshot, frozen-container, floor-denial, and canonical-hash assertions all pass.
- The cross-field safe neighbor exposed one remaining diagnostic-array `push`; replacing it with a single bounded issue result produced zero inherited setter calls for invalid cross-field input.
- Every mutant was restored before final verification.

## Final verification

- `pnpm vitest run tests/unit/fix09-bundle.test.ts --reporter=dot` — 25/25 passed on each of three consecutive runs.
- `pnpm generate:contract` — passed with no generated delta.
- `pnpm typecheck` — no C1 diagnostic; exactly the documented eight pre-existing `tests/unit/s14-ui.test.ts` diagnostics remain.
- `pnpm audit:source` — no C1 finding; exactly the three documented pre-existing direct-environment findings under `packages/obs-capture/install/{api,runner,scheduler}.ts` remain.
- `pnpm audit:text-bytes` — passed with `REPOSITORY_TEXT_CONTROL_BYTES=0`.
- The loader-independent fixture imports only `node:crypto` and produced the unchanged canonical bundle hash.
- The focused frozen-interface compilation passed. `DispatchArm` remains the 32-byte memberless interface.
- Static forbidden-import/environment scans found no C1 match. The worktree `node_modules` is a directory, not a symlink, and no nested `node_modules` symlink exists.
- `git diff --check` and the exact-scope readback are recorded immediately before commit.

This report records a C1 implementation milestone and does not constitute acceptance of FIX-09.
