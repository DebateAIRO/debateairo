# FIX-09 C1 implementation report

## Scope

- Branch: `codex/oa-fix-09`
- Worktree: `dialectical-engine/.worktrees/oa-fix-09`
- Base: `dev` at `2b670d3059c60d7262cf655bd5d402c88100dff3`
- Cluster delivered: C1 only — policy bundle, canonical hash, loader, custodian repin, frozen `TracerHook`, and empty `DispatchArm`.
- Not performed: C2-C4, V acceptance, merge, board write, or any operational arming.

## Implementation

- Added the complete fail-closed phase-one policy bundle with the frozen taxonomy, severity ladder, V-only routing, registry seed pins, register seeds with provenance, deferred RP slots, `quick_arm: OFF`, an empty allowlist, and one literal V custodian.
- Added recursive semantic JSON canonicalization and SHA-256 hashing. Object keys sort recursively; array order is preserved.
- Added a strict Zod loader, typed load failure, floor matcher, and fail-closed rejection of non-repository-relative candidate paths.
- Added token-gated repinning using SHA-256 digests and `timingSafeEqual`. The token environment is injected; product code does not read `process.env`.
- Added the frozen ten-verdict tracer interface and memberless dispatch-arm interface.
- Added one focused unit suite and a loader-independent hash fixture whose only import is `node:crypto`.

Canonical bundle hash at verification: `53c0e932f6a2c045041d3fe7948d16cbd302590bbf276c133702da7c6f8301d5`.

## TDD and mutation evidence

1. Genuine product RED: `pnpm vitest run tests/unit/fix09-bundle.test.ts` failed because `tools/obs-listener/policy/canonical.js` did not exist. No C1 product file existed at that point.
2. Initial GREEN: the focused suite passed after the minimum implementation.
3. Fail-closed RED: an added invalid-path case exposed empty, dot, backslash, and absolute-path acceptance. Tightening path validation made it GREEN.
4. Deferred-slot RED: a valid hash repin was rejected while the schema admitted only the initial null. Allowing a SHA-256 value behind the unchanged RP gate made it GREEN.
5. Harmful mutant: changing the bundle allowlist from `[]` to `["apps/api/src/public-health.ts"]` failed the focused suite (1 failed of 9). Restoring the empty allowlist returned 9/9 GREEN.
6. Neighbor proof: changing only JSON whitespace around `schema_version` kept all 9 tests GREEN. The original bytes were then restored.

## Verification

- Focused test, three consecutive final runs: `pnpm vitest run tests/unit/fix09-bundle.test.ts` — 9/9 passed on each run.
- Contract generation: `pnpm generate:contract` — passed.
- Repository typecheck: `pnpm typecheck` — no FIX-09 diagnostic. It retains the documented eight pre-existing `tests/unit/s14-ui.test.ts` diagnostics (TS2307 twice, TS18046 twice, TS2339 twice, and TS7006 twice).
- Source audit: `pnpm audit:source` — no FIX-09 finding. It retains the three pre-existing direct-environment findings in `packages/obs-capture/install/api.ts`, `runner.ts`, and `scheduler.ts`.
- Text-byte audit: `pnpm audit:text-bytes` — passed with `REPOSITORY_TEXT_CONTROL_BYTES=0`.
- Static source scan over the new TypeScript implementation found no `occurrence_detail`, identity access, `@debateai/db`, `node:child_process`, or provider access.
- Independent fixture import scan found exactly `node:crypto`.
- Dependency setup used the repository's approved APFS worktree copy procedure. The temporary dependency symlink was removed before product work continued, was never staged, and final verification found no directory named `node_modules` implemented as a symlink.

## Files

- `tools/obs-listener/policy/bundle.json`
- `tools/obs-listener/policy/canonical.ts`
- `tools/obs-listener/policy/loader.ts`
- `tools/obs-listener/policy/custodian.ts`
- `tools/obs-listener/src/daemon/tracer-hook.ts`
- `tools/obs-listener/src/daemon/dispatch-arm.ts`
- `tests/unit/fix09-bundle.test.ts`
- `tests/unit/fixtures/fix09-independent-hash.mjs`

This report records implementation evidence for C1 and does not constitute acceptance of FIX-09.
