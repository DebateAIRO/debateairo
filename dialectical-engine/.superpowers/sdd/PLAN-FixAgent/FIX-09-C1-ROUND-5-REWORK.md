# FIX-09 C1 round-five rework report

## Scope

- Branch: `codex/oa-fix-09`
- Rework base: `9afd1ef0b27e56c7dacaad1ab16d3e4d4ec0686b`
- Scope: C1 own-descriptor classification, canonical numeric-index projection, schema gating, focused tests, and this report only.
- All reviewer-authored Sol reports remain untracked and are excluded from the implementation commit.
- Not performed: C2-C4, V acceptance, merge, board write, or operational arming.

## Corrections

### Own descriptor values only

- Canonical JSON data and array-length classification now require `Object.hasOwn(descriptor, "value")`; inherited `value` accessors and data cannot turn a caller accessor into policy data.
- Token and optional `next_bundle` selection apply the same own-value rule and read each accepted descriptor value once into a local.
- All 19 accessor-backed register/slot value paths reject under both a mapping prototype getter and a matching inherited data value. Neither caller accessor nor inherited getter runs.
- Request token, environment token, and `next_bundle` accessor attacks return `RepinRefusedError` under mapping getter and matching-data variants with zero accessor calls.

### Canonical indices and fail-closed schema gate

- Canonical projection continues to allocate exact-length arrays and define every index as an own data property with `Object.defineProperty`; it never uses inherited indexed assignment.
- The loader recognizes every canonical array-index spelling from `0` through `2^32 - 2` on both `Array.prototype` and `Object.prototype`. Any such ambient descriptor returns bounded schema failure before Zod runs. Custodian repins map that refusal to `REPIN_REFUSED`.
- The frozen SPEC requires fail-closed bundle loading but does not require successful parsing under hostile global prototype mutation. The gate therefore refuses rather than mutating process-global prototypes or racing concurrent application code.
- Non-index spellings (`01`, `-0`, `1.0`, and `4294967295`) remain safe neighbors and do not trip the gate.
- Every accepted unpolluted snapshot still passes the declared Zod content schema. There is no polluted success branch or manual-validator acceptance shortcut. The unsafe-integer probe proves a Zod-skipping mutant cannot accept a structurally plausible but schema-invalid pin count.

Direct canonical projections remain dense, exact, recursively frozen and own-data under numeric prototype accessors/non-writable values. Their independent hash remains `aa76b3fe955ca5d46bcdf05d7b8f78ac27c25341104bf0b3810b6fc833497ecd`, and the registration floor remains denied.

## RED, GREEN, mutants, and neighbors

- Initial round-five RED: 5 failures and 23 passes. Numeric accessor/non-writable regressions first failed at index zero; both accessor-backed 19-path matrices returned zero refusals; descriptor-prototype custodian attacks returned without refusal.
- Inherited-descriptor mutant: restoring prototype-aware `"value" in descriptor` at all four product predicates caused three targeted failures, including both 19-path matrices and custodian selection.
- Index-zero-only mutant: reducing numeric detection to key zero caused both numeric matrix tests to fail at `Object.1`/`Object.113`.
- Skip-Zod mutant: replacing the declared schema parse with unconditional success accepted `Number.MAX_SAFE_INTEGER + 1` and failed the focused schema-authority test.
- Safe neighbors: clean complete parsing and repinning remain accepted; non-index numeric prototype names remain ignored; malformed nested omissions and unsafe counts reject; direct projections preserve the checked-in floor, register arrays, hash, and frozen own-data shape.
- Every mutant was restored before final verification.

## Final verification

- `pnpm vitest run tests/unit/fix09-bundle.test.ts --reporter=dot` — 29/29 passed on each of three consecutive runs.
- `pnpm generate:contract` — passed with no generated delta.
- `pnpm typecheck` — no C1 diagnostic; exactly the documented eight pre-existing `tests/unit/s14-ui.test.ts` diagnostics remain.
- `pnpm audit:source` — no C1 finding; exactly the three documented pre-existing direct-environment findings under `packages/obs-capture/install/{api,runner,scheduler}.ts` remain.
- `pnpm audit:text-bytes` — passed with `REPOSITORY_TEXT_CONTROL_BYTES=0`.
- The loader-independent fixture imports only `node:crypto` and produced the unchanged canonical bundle hash.
- The focused frozen-interface compilation passed; `DispatchArm` remains the 32-byte memberless interface.
- Descriptor/static scans found no prototype-aware `value` predicate or forbidden C1 import/environment access. The worktree dependency tree is a directory and contains no `node_modules` symlink.
- `git diff --check` and the exact five-file owned scope are clean immediately before commit.

This report records a C1 implementation milestone and does not constitute acceptance of FIX-09.
