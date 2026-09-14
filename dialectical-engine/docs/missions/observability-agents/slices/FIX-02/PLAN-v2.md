# FIX-02 PLAN-v2 — C1 only

Status: FROZEN — controller-ratified with `SPEC-v2.md` on 2026-09-04.

This plan replaces the empty C1 cells in `PLAN.md`. C2, C3, persistence, and V acceptance remain deferred.

## Trace

| Requirement | Step | Proof |
|---|---|---|
| FIX-02-R01 | C1.1–C1.3 | cause identity and exact constructor contract |
| FIX-02-R07 | C1.1–C1.3 | two-argument compatibility and typecheck delta |
| FIX-02-R08 | C1.3–C1.4 | worker milestone is kept separate from Done |

## C1 steps

1. **C1.1 — RED.** Create `tests/unit/fix02-cause-chain.test.ts`. Prove cause identity for an `Error`, a primitive, and `undefined`; prove an old two-argument call; assert stable `name`, `code`, `message`, and stack behavior. Run the focused test and record the expected failure caused by the missing third argument.
2. **C1.2 — GREEN.** Change only the `TypedDomainError` constructor. Add `options?: { cause?: unknown }`, pass it to `super(message, options)`, and leave the name assignment unchanged. Run the focused test until green.
3. **C1.3 — falsify and verify.** Run the focused test three times. Mutate, one at a time: drop `options` from `super`; wrap the cause in a new object; change the error name; remove the optional argument and break a two-argument call. Each mutant must make a named test or compile check fail. Restore after each run. Run the adjacent kernel test, contract generation, typecheck, source audit, diff check, and scope check.
4. **C1.4 — commit.** Commit only `packages/kernel/src/index.ts` and `tests/unit/fix02-cause-chain.test.ts` with subject `feat(kernel): FIX-02 C1 — TypedDomainError carries cause`.

## Commands

```text
pnpm exec vitest run tests/unit/fix02-cause-chain.test.ts --reporter=dot
pnpm exec vitest run tests/unit/kernel.test.ts tests/unit/fix02-cause-chain.test.ts --reporter=dot
pnpm generate:contract
pnpm typecheck
pnpm audit:source
git diff --check
git status --short
```

The focused command runs three times. Typecheck is compared with `docs/missions/observability-agents/TYPECHECK-BASELINE.md`; the eight pinned `tests/unit/s14-ui.test.ts` diagnostics are reported, not changed. No C1 command claims database work, production persistence, or V acceptance.
