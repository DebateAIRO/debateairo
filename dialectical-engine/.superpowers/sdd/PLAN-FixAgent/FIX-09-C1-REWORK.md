# FIX-09 C1 Sol-review rework report

## Scope

- Branch: `codex/oa-fix-09`
- Rework base: `1435a18c921a29150e46583b8687c5aa128bb486`
- Scope: C1 policy floor, loader/canonical/custodian boundaries, and independent regression fixtures only.
- The reviewer-authored `FIX-09-C1-SOL-REVIEW.md` remains untracked and is excluded from this implementation commit.
- Not performed: C2-C4, V acceptance, merge, board write, or operational arming.

## Corrections

### Frozen floor and path spelling

- Added the omitted live security-zone source and compiled-alternate paths, including `apps/api/src/mfa.ts`.
- Added nested `pnpm-lock.yaml` coverage plus the obs schema and register environment-loader paths named by the frozen floor.
- Paths now pass through one lexical normalizer. Absolute, drive-qualified, backslash, NUL, parent-segment, and empty paths fail closed; empty and `.` segments otherwise collapse once before matching.
- The focused suite covers canonical and `././` spellings plus adjacent floor-clear names.

### Independent pins and frozen interfaces

- Added a fixture containing the independently recorded canonical bundle hash, taxonomy, code-registry seed, and all register seeds.
- Added a standalone strict TypeScript fixture with independently declared incident, verdict, hook, and memberless-dispatch shapes.
- The focused Vitest command runs that isolated compiler fixture, so tracer or dispatch mutations fail the named C1 command rather than relying on the repository-wide typecheck.

### Strict data boundaries

- Added a recursive JSON syntax scanner that rejects duplicate object members before parsing the complete object.
- Canonical projection now accepts only own plain JSON data, reads property descriptors instead of property accessors, and rejects accessors, inherited data, symbols, array holes/extras, and non-plain prototypes.
- The policy schema applies the same own-plain-data boundary before Zod reads required members.
- Custodian authentication reads own data descriptors and maps missing, empty, non-string, or accessor-backed token material to `RepinRefusedError` / `REPIN_REFUSED` without leaking Node argument errors.

The canonical bundle hash changed from `53c0e932f6a2c045041d3fe7948d16cbd302590bbf276c133702da7c6f8301d5` to `aa76b3fe955ca5d46bcdf05d7b8f78ac27c25341104bf0b3810b6fc833497ecd`. Preserving the old semantic hash was not possible because the required frozen-floor members change policy content.

## RED, GREEN, mutants, and neighbors

- Initial review RED: the expanded focused suite reported 5 failures and 9 passes. It reproduced omitted/redundant floor paths, duplicate-member acceptance, prototype-backed `quick_arm`, accessor-backed changing hashes, and raw `ERR_INVALID_ARG_TYPE` for a missing token.
- Compiled-alternate floor RED: adding all eight frozen alternate paths produced one focused failure until the bundle recorded them.
- Registry-hash mutant: changing the ratified `code_seed.sha256` made the independent-pin test fail.
- Register-content mutant: changing `obs.captureQueueMax` from 1024 to 1025 changed the pinned hash and made the independent-pin test fail.
- Tracer mutants: changing `fingerprintVersion` from number to string and adding an optional incident member each made the focused interface compilation fail.
- Dispatch mutant: adding one member to `DispatchArm` made the focused interface compilation fail.
- Safe neighbor: changing only JSON whitespace kept all 14 focused tests green with the independently pinned canonical hash. Original formatting was restored.
- Path neighbors: adjacent MFA, lock, obs-schema, and environment-loader names, including a redundant `././` spelling of a floor-clear path, remain floor-clear.
- Every mutant was restored before final verification.

## Final verification

- `pnpm vitest run tests/unit/fix09-bundle.test.ts` — 14/14 passed on each of three consecutive runs.
- `pnpm generate:contract` — passed with no generated delta.
- `pnpm typecheck` — no C1 diagnostic; exactly the documented eight pre-existing `tests/unit/s14-ui.test.ts` diagnostics remain.
- `pnpm audit:source` — no C1 finding; exactly the three documented pre-existing direct-environment findings under `packages/obs-capture/install/{api,runner,scheduler}.ts` remain.
- `pnpm audit:text-bytes` — passed with `REPOSITORY_TEXT_CONTROL_BYTES=0`.
- Static implementation scan found no `occurrence_detail`, identity access, `@debateai/db`, `node:child_process`, provider access, or direct `process.env` read.
- The loader-independent hash fixture still imports only `node:crypto`.
- `DispatchArm` remains the exact one-line, 32-byte memberless export.
- `git diff --check` passed, and no directory named `node_modules` is a symlink.

This report records a C1 implementation milestone and does not constitute acceptance of FIX-09.
