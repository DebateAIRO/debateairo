# FIX-05 SPEC-v2 — provider capture dependency authority

Status: FROZEN — controller-ratified under the current approved FixAgent goal on 2026-09-05. This is planning authority only. It records no registry admission, persisted row, RP-0 completion, production acceptance, C1 PASS, or V attestation.

This file has higher precedence than `SPEC.md` §7 only for the bounded C1 dependency correction below. Every behavioral rule, privacy rule, emitted shape, retry invariant, acceptance step, and Done gate in `SPEC.md` remains unchanged. `SPEC.md`, `PLAN.md`, and all prior decision rows remain frozen.

The live Task 5 plan remains read-only. Its current C1/code-quality PASS wording predates the independent dependency review and is not readiness authority for this correction: the confirmed P2 must be corrected and independently reviewed before any new C1 verdict. This packet itself makes no C1 PASS claim.

## 1. Confirmed defect and root cause

The reviewed C1 implementation at `7459c3fc9709054c532942e063b46cf9fd8301ff` makes a runtime import from `packages/providers/src/index.ts` to `@debateai/obs-capture`, but `packages/providers/package.json` and the `packages/providers` importer in `pnpm-lock.yaml` omit that dependency. The root workspace imports successfully because its dev dependencies supply `@debateai/obs-capture`; that success does not prove the provider package's production dependency boundary.

A disposable production deploy of `@debateai/providers` succeeds at the reviewed commit, then importing the deployed `src/index.ts` fails with `ERR_MODULE_NOT_FOUND: Cannot find package '@debateai/obs-capture'`. The runner supplies the working control: `apps/runner/package.json` declares `"@debateai/obs-capture": "workspace:*"`, its lock importer records `link:../../packages/obs-capture`, and a provider import through that production deployment resolves.

Root-cause ruling: every package that directly imports `@debateai/obs-capture` declares it as a direct runtime dependency. A workspace-root dependency or a consumer's dependency is not a substitute for the importing package's declaration.

## 2. Required correction

1. `packages/providers/package.json` adds exactly one runtime dependency: `"@debateai/obs-capture": "workspace:*"`.
2. The `packages/providers` importer in `pnpm-lock.yaml` adds exactly:

```yaml
      '@debateai/obs-capture':
        specifier: workspace:*
        version: link:../obs-capture
```

3. The `providers` row in `tools/orphan-audit/src/index.ts` adds exactly `"obs-capture"` to its allowed workspace edges. No other row or edge changes.
4. `tests/architecture/fix05-import-graph.test.ts` gains a production-style isolation proof. It deploys `@debateai/providers` with production dependencies into a fresh temporary directory, imports that deployed package with Node and the workspace TSX loader, requires exit status `0`, and requires the deployed package to contain `node_modules/@debateai/obs-capture`.
5. The isolated import begins from the deployed `src/index.ts` outside the repository and uses the deployment directory as its current working directory. The root workspace's dev dependency cannot satisfy the provider import.
6. The same test file asserts the exact provider manifest value, exact provider lock-importer stanza, and exact provider audit row. It retains the existing proof that the loaded provider graph contains `packages/obs-capture/src/index.ts` and contains neither `pg` nor `@debateai/db`/`packages/db`.
7. A disposable missing-edge mutant removes only the deployed `node_modules/@debateai/obs-capture` entry and must produce nonzero status with both `ERR_MODULE_NOT_FOUND` and `@debateai/obs-capture` in stderr. The original root-level import-graph test is the inverse control: it is green before this correction while the new isolated production import is RED, proving that the new test covers a distinct package boundary.

## 3. Exact implementation surface

Allowed writes, and no others:

- `packages/providers/package.json` — add the one direct runtime dependency.
- `pnpm-lock.yaml` — add only the three-line `packages/providers` importer entry from §2.
- `tools/orphan-audit/src/index.ts` — add only `obs-capture` to the `providers` row.
- `tests/architecture/fix05-import-graph.test.ts` — add the structural, isolated-deploy, mutant, and inverse proof described in §2.

Read-only proof sources:

- `packages/providers/src/index.ts`
- `apps/runner/package.json`
- the `apps/runner` importer in `pnpm-lock.yaml`
- `package.json`
- `tests/unit/fix05-provider-exhaustion.test.ts`
- `packages/obs-capture/src/index.ts`

Forbidden: provider source changes; any `packages/obs-capture/**` change; any other manifest, lock importer, architecture row, dependency, or test; registry or safe-template admission; database, runner, scheduler, API, UI, migration, acceptance, or live-stack changes; and every path not listed in the allowed write set.

## 4. Verification contract

The correction is a worker milestone only when all of these are recorded:

1. **RED:** with only the new test present, the isolated provider production import fails specifically because `@debateai/obs-capture` is absent. The existing root import-graph assertion remains green.
2. **GREEN:** after the three metadata edits, the architecture file passes all four tests on three fresh runs. The isolated import exits `0`; the manifest, lock importer, and audit row equal the frozen strings in §2.
3. **Mutants:** removing each of the manifest value, provider lock stanza, provider allowlist member, and deployed runtime edge makes its named assertion RED. Restore the original bytes after each mutant and re-run GREEN.
4. **Inverse:** the pre-existing root load-only graph test is green on the pre-correction commit while the new isolated import is RED; after GREEN it still proves zero `pg` and zero product-database imports. No provider behavior test changes.
5. `tests/unit/fix05-provider-exhaustion.test.ts` plus the expanded architecture test pass together. `pnpm typecheck`, `pnpm audit:source`, and `pnpm audit:architecture` are compared honestly with their pinned unrelated baselines; no baseline file is edited.
6. `git diff --check` passes. The implementation diff contains exactly the four allowed paths. `packages/providers/src/index.ts`, `packages/obs-capture/**`, the frozen v1 FIX-05 documents, and the live Task 5 plan remain byte-identical.

## 5. Commit and claim boundary

The implementation commit subject is exactly:

```text
fix(providers): declare obs-capture dependency
```

This correction does not modify provider behavior, admit either provider code to the registry, satisfy RP-0, execute SPEC §5, establish a persisted row, establish C1 PASS, or authorize a V/Done claim.
