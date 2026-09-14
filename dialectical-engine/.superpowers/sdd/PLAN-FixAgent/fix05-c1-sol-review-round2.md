# FIX-05 C1 review-fix round 2 — fresh independent review

Review date: 2026-09-05 (Europe/Bucharest)

Original reviewed endpoint: `7459c3fc9709054c532942e063b46cf9fd8301ff`  
Current reviewed endpoint: `ecbad9d60987a28d479dd13062fa763048aed4d8`  
Full authority-plus-fix range: `7459c3fc9709054c532942e063b46cf9fd8301ff..ecbad9d60987a28d479dd13062fa763048aed4d8`  
Immediate implementation range: `331cc95da841d474ac3ac35ee527948975360d2f..ecbad9d60987a28d479dd13062fa763048aed4d8`

## Verdicts

- **Original P2: ADDRESSED.** `@debateai/providers` now declares its direct runtime import of `@debateai/obs-capture`; the provider lock importer and provider audit row match; an isolated production-dependency deploy imports; removing that deployed edge recreates the exact missing-package failure.
- **SPEC: PASS for the bounded C1 dependency correction.** Every requirement in `SPEC-v2.md` is met, while the frozen C1 behavior remains byte-identical and passes its original five checks.
- **CODE QUALITY: PASS.** The dependency declaration is minimal, exact at all three accounting boundaries, acyclic, and guarded by a fail-closed four-test architecture file whose named assertions were independently falsified.
- **C1 readiness for the later RP-0/V gate: YES, as a reviewed worker candidate only.** RP-0 transcription is still absent and SPEC §5 live acceptance was not run. This is not V acceptance and is not a Done claim.

## Findings by priority

### P0

None.

### P1

None.

### P2

None. The prior P2 is addressed.

### P3

None.

## Authority and range proof

- Local authority commit `b0442fbfb7ae013ed5b71be3c9541feef1df0e51` has byte-for-byte the same patch as upstream authority commit `1f663d31aae41e70c7b22c60706fe6651e8a4b3d` (25,729 patch-output characters compared equal).
- Local authority commit `331cc95da841d474ac3ac35ee527948975360d2f` has byte-for-byte the same patch as upstream authority commit `b5ae558bdff12011dbf6f74f2a3655cbae5c724c` (13,164 patch-output characters compared equal).
- The linear post-original sequence is exactly:
  1. `b0442fbfb7ae013ed5b71be3c9541feef1df0e51` — `docs(obs): authorize FIX-05 dependency correction`
  2. `331cc95da841d474ac3ac35ee527948975360d2f` — `docs(obs): harden FIX-05 verification gates`
  3. `ecbad9d60987a28d479dd13062fa763048aed4d8` — `fix(providers): declare obs-capture dependency`
- `git merge-base --is-ancestor 7459c3fc... ecbad9d6...` exited 0.
- The full range contains exactly seven paths: the authorized decision append, `SPEC-v2.md`, `PLAN-v2.md`, and the four implementation paths.
- The immediate implementation commit contains exactly:
  - `dialectical-engine/packages/providers/package.json`
  - `dialectical-engine/pnpm-lock.yaml`
  - `dialectical-engine/tests/architecture/fix05-import-graph.test.ts`
  - `dialectical-engine/tools/orphan-audit/src/index.ts`
- Immediate numstat is respectively `1/1`, `3/0`, `90/1`, and `1/1`. Inspection of the patch confirms the lock change is only the provider importer and the audit change is only the provider row.
- `git diff --check` exits 0 for both review ranges.

## Independent defect reproduction and HEAD isolation proof

### Original endpoint

A disposable checkout was materialized from `7459c3fc9709054c532942e063b46cf9fd8301ff` under `/private/tmp`, using only tracked workspace inputs. The first restricted attempt was rejected as evidence because its temporary pnpm store lacked tarballs. The valid rerun used the repository store and network permission:

- `pnpm --filter @debateai/providers deploy --legacy --prod <deploy>`: exit 0.
- From the deploy directory, with `NODE_PATH` unset, Node imported the deployed `src/index.ts` through the workspace TSX loader: exit 1.
- Exact failure: `Error [ERR_MODULE_NOT_FOUND]: Cannot find package '@debateai/obs-capture' imported from <deploy>/src/index.ts`.
- The original committed root load-only architecture test remained green: 1 file, 1 test. Its traced product and capture source blobs are identical at the original and current endpoints.

This reproduces the prior P2 and confirms the old root-level green was an inverse control, not proof of the provider package boundary.

### Current endpoint

- Independent HEAD deploy to a fresh `/private/tmp` directory: deploy exit 0.
- Import from deployed `src/index.ts`, deploy directory as cwd, and `NODE_PATH` unset: exit 0.
- `node_modules/@debateai/obs-capture/package.json` exists in the deploy.
- pnpm's legacy deploy represents workspace dependencies as provider-owned symlinks to the declared workspace packages. This is not fallback through the root package's dev dependency: after deleting only the deployed provider's `node_modules/@debateai/obs-capture` link, the same import exits 1 with both `ERR_MODULE_NOT_FOUND` and `@debateai/obs-capture`, even though the workspace root dev dependency remains installed.
- The same deletion proof runs inside the committed architecture test and passed on every green run.

## Exact declaration review

- Provider manifest runtime dependency: `"@debateai/obs-capture":"workspace:*"`.
- Provider lock importer: exactly one provider-local stanza with `specifier: workspace:*` and `version: link:../obs-capture`.
- Provider audit row: exactly `kernel`, `register`, `ledger`, `obs-capture`; no other row changed in the implementation range.
- Independent package-graph parse: 31 workspace packages, 142 workspace edges, zero cycles. The provider points to kernel, register, ledger, and capture; capture points to no workspace package, so the new edge cannot return to providers.

## Test-strength and mutant review

The test separates three concerns: exact source metadata, production-dependency deployment/import, and runtime load graph. It fails closed on spawn/import errors, starts the deployed import outside the repository with deploy cwd, always cleans its fresh temporary directories, and retains the no-`pg`/no-product-database inverse. The absolute TSX loader is tooling only; removing the deployed capture link proves it cannot provide a root-resolution fallback.

Fresh source mutants were confined to a disposable HEAD copy and restored byte-for-byte before the final green:

| Mutant | Result | Named proof |
|---|---:|---|
| Remove provider manifest runtime value | 2 failed / 2 passed | exact manifest assertion plus isolated import |
| Move capture to provider `devDependencies` | 2 failed / 2 passed | runtime manifest assertion plus `--prod` isolated import |
| Remove only provider lock stanza | 1 failed / 3 passed | provider importer occurrence assertion |
| Move exact lock stanza under `packages/battery` | 1 failed / 3 passed | another importer cannot substitute for provider importer |
| Remove only provider allowlist member | 1 failed / 3 passed | exact provider row assertion |
| Move the allowlist member from providers to the graph row | 1 failed / 3 passed | another allowed edge cannot substitute for provider's edge |
| Remove deployed package edge | test remains green only after child import exits nonzero | stderr requires both missing-module code and package name |

Restored disposable hashes matched HEAD exactly:

- manifest `aee5b3c4290e7d070a6e363e54c2d9f26e6b92f4`
- lockfile `0820a2735418182cc9cefa32f6ed32c8e5e665b0`
- audit source `b0bf8856f14f40a8db1014e67e2ac7f0d5665efb`

The restored disposable architecture suite then passed 4/4.

## Fresh test receipts

- Architecture file, three separate runs: `4/4`, `4/4`, `4/4`; durations 5.67 s, 5.67 s, and 5.71 s.
- Corrected FIX-05 cluster: 2 files, `8/8`.
- Original C1 behavior slice using `-t 'emits|preserves|loads only'`: 2 files, `5 passed | 3 skipped`; the skips are exactly the three new package-boundary cases.
- Adjacent FIX-05/provider/FIX-03 set: 7 files, `65/65`. A restricted first attempt stalled at local child-process boundaries and was terminated with exit 130; it is not counted. The valid local-process-enabled rerun completed in 7.24 s.
- Broader provider set: 6 files, `26/26`.

The original behavior remains covered: single transport-exhaustion emission, no retry-success emission, single content-exhaustion emission with no free text, capture rejection/off product-semantics parity, and a provider load graph containing capture but neither `pg` nor the product database package.

## Generation, type, audit, static, and containment evidence

### Contract generation

The restricted TSX invocation failed with local IPC `EPERM` and is not counted. The valid local-process-enabled `pnpm generate:contract` exited 0. Before/after generated paths remained exactly the three expected files and their Git blob hashes were unchanged:

- `client.ts`: `7ce11eefd12811797bdea0249581969e030dd207`
- `field-inventory.json`: `dc38adc9df0a5a1e2894677e007619923eb531c1`
- `openapi.json`: `2a18acd8416e4b724f6a2e7a19fc296c90328e52`

HEAD, tracked diff, and index were unchanged by generation.

### Typecheck and positive containment

The fresh post-generation `pnpm typecheck` exited 1 with exactly the pinned eight diagnostics, all in `tests/unit/s14-ui.test.ts`, and none in FIX-05 paths:

1. `(19,8) TS2307` missing `../../web/lib/v3Presentation.js`
2. `(122,38) TS18046` `label` is unknown
3. `(128,71) TS18046` `label` is unknown
4. `(199,18) TS2339` missing `nodes`
5. `(200,18) TS2339` missing `placeholderEdges`
6. `(230,58) TS2307` missing `../../web/lib/api.js`
7. `(232,55) TS7006` implicit-any `input`
8. `(232,62) TS7006` implicit-any `init`

The independent full `tsc --noEmit --traceResolution` parser exited 0 after validating compiler status 1 against that pin: 5,625 absolute successful resolutions, zero outside this worktree, eight pinned diagnostics, zero FIX-05 diagnostics.

### Audits and static checks

- `pnpm audit:text-bytes`: exit 0, `REPOSITORY_TEXT_CONTROL_BYTES=0`.
- `pnpm audit:source`: exit 1 with exactly the five pinned unrelated rows:
  - `packages/obs-capture/install/api.ts reads the process environment outside the register loader`
  - `packages/obs-capture/install/runner.ts reads the process environment outside the register loader`
  - `packages/obs-capture/install/scheduler.ts reads the process environment outside the register loader`
  - `packages/obs-capture/src/runtime/config.ts reads the process environment outside the register loader`
  - `packages/obs-capture/src/runtime/index.ts reads the process environment outside the register loader`
- `pnpm audit:architecture`: exit 1 only because the recorded retired `web/package.json` is absent; it aborts at that pre-existing point. The exact provider row and independent cycle parse supply the bounded proof.
- Product-source scan finds exactly the capture root import and no `pg` or product database import. Runtime traces likewise contain capture core and zero `pg`/product-database resolutions.
- Registry scan returns no `PROVIDER_CALL_FAILED` or `PROVIDER_CONTENT_UNACCEPTED` registration. RP-0/S02 therefore remains pending.

## Byte preservation and scope proof

The original and current endpoints have identical protected Git identities:

- `packages/providers/src/index.ts`: blob `47ed0bba3ffb7bbfdd6e898da5f4447206c0156d`
- all tracked `packages/obs-capture/**`: tree `9931213faad4b484c290de60b7911306008ca432`
- `tests/unit/fix05-provider-exhaustion.test.ts`: blob `1b68ae80348da0d2f1e2102c8c63a8d6e9569c14`
- frozen v1 SPEC: blob `c14c53a0d315ba0bf82f38a9f252d24243f6bd7f`
- frozen v1 PLAN: blob `11694950b68f057f7df915f8b0aa70322a460263`

The current four implementation blobs are:

- provider manifest `aee5b3c4290e7d070a6e363e54c2d9f26e6b92f4`
- lockfile `0820a2735418182cc9cefa32f6ed32c8e5e665b0`
- architecture test `ebdcc3f36882f2dea603b3611bd3031c488c174b`
- audit source `b0bf8856f14f40a8db1014e67e2ac7f0d5665efb`

No provider behavior, capture package, original behavior test, frozen v1 authority, other manifest/importer/allowlist row, registry, database, runner, scheduler, API, UI, migration, or acceptance surface changed in the immediate implementation range.

## Claim boundary

This review establishes the C1 dependency correction and code-quality milestone only. It does not admit provider codes, transcribe RP-0, produce a persisted row, execute SPEC §5, establish V acceptance, or declare FIX-05 Done.

## HEAD and tracked-state proof

Pre-report checkpoint: branch `codex/oa-fix-05`; HEAD `ecbad9d60987a28d479dd13062fa763048aed4d8`; `git diff --quiet` exit 0; `git diff --cached --quiet` exit 0. The only untracked files were the pre-existing implementation report and first independent review.

Post-report readback found branch `codex/oa-fix-05` and HEAD `ecbad9d60987a28d479dd13062fa763048aed4d8`; `git diff --quiet` and `git diff --cached --quiet` both exited 0. Status contains exactly three untracked normal reports: the pre-existing implementation report, the pre-existing first review, and this round-2 report. No code, test, specification, plan, index, branch, or HEAD changed during review.
