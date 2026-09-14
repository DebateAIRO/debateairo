# FIX-02 PLAN-v3 — C2 current pool seam

Status: FROZEN — controller-ratified with `SPEC-v3.md` on 2026-09-04.

This plan controls C2 only. `PLAN-v2.md` still controls C1. C3, storage, the missing second wrapper, async joins, and V acceptance remain deferred.

## Trace

| Requirement | Step | Proof |
|---|---|---|
| FIX-02-R02 | C2.1–C2.3 | fixed message, exact code, original cause identity, existing-wrapper identity |
| FIX-02-R03 | C2.1–C2.3 | one fixed-code capture attempt, local catch, no console, no query, no raw text |
| FIX-02-R07 | C2.3 | typecheck delta and current caller paths |
| FIX-02-R08 | C2.4 | worker milestone stays separate from Done |

R04, R05, and R06 are deferred because the current seam has no second wrapper, no multi-rejection join, and no authorized stored-row work.

## C2 steps

1. **C2.1 — RED.** Add `tests/unit/fix02-pool-failure.test.ts`. Prove the exact fixed error shape and cause identity. Prove identity for an existing `DATABASE_POOL_FAILED` error. Cover callback, promise, and sync failure paths for pool query, pool connect, and leased-client query. Prove the first pool error makes one fixed capture attempt; a second event makes none; no base query and no console call occur; capture throw cannot change the terminal product error; fixed context has no raw detail. Update both named POL-03 tests so they require empty stderr and the fixed receipt message. Record the expected failures.
2. **C2.2 — GREEN.** Add the direct db → obs-capture package edge and lock importer. In the current wrapper region only, stop adding raw detail to the typed message, pass `{ cause: error }`, and call root `captureHandled` once for the first terminal event inside a local `try/catch`. Remove the pool console call. Do not add a second wrapper, join, global hook, database write, or caller wiring.
3. **C2.3 — falsify and verify.** Run the focused test three fresh times. Mutate one rule at a time: add raw detail to the message; drop the cause option; wrap the cause; query from the pool-error listener; add `console.error`; let capture throw; capture twice; replace the first terminal failure on a later event. Each mutant must fail a named test. Restore after each run. Run adjacent db/kernel/POL-03 tests, the obs import-graph test, typecheck, source audit, package/import checks, diff check, and scope check.
4. **C2.4 — commit and report.** Make new commits only. Write the normal implementation report under `.superpowers/sdd/PLAN-FixAgent/`. State that C3, storage, R04, R05, and V acceptance are not done.

## Commands

```text
pnpm exec vitest run tests/unit/fix02-pool-failure.test.ts --reporter=dot
pnpm exec vitest run tests/unit/fix02-pool-failure.test.ts tests/unit/pol03-pool-resilience.test.ts tests/unit/kernel.test.ts tests/unit/fix02-cause-chain.test.ts --reporter=dot
pnpm exec vitest run tests/architecture/obs-l2-s05-import-graph.test.ts --reporter=dot
pnpm typecheck
pnpm audit:source
git diff --check
git status --short
```

The focused command runs three times. Typecheck is compared with `docs/missions/observability-agents/TYPECHECK-BASELINE.md`. The pinned `tests/unit/s14-ui.test.ts` errors are reported, not changed. The real PostgreSQL POL-03 test runs only when its normal database fixture is available; its source contract is still updated in C2.
