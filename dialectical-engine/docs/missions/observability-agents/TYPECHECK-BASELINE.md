# TYPECHECK BASELINE — mission `observability-agents`

**Measured 2026-09-02 13:45 by the orchestrator, in a CLEAN worktree, with the exact command every coding seat runs.** Re-measure and re-pin this file whenever `dev` moves; a baseline quoted from memory is not a baseline.

## The pin

| Fact | Value |
|---|---|
| Base commit | `3503dcf8` (branch `dev`) |
| Worktree | `.worktrees/oa-fix-01/dialectical-engine`, freshly created, `git status --porcelain` = 0 entries |
| `pnpm generate:contract` | exit **0**, and leaves the tree clean (porcelain 0 after) |
| `pnpm typecheck` | exit **1**, **8** diagnostics |
| Where all 8 live | `tests/unit/s14-ui.test.ts` — every one of them |
| Diagnostics in observability paths | **0** |
| First diagnostic | `tests/unit/s14-ui.test.ts(19,8): error TS2307: Cannot find module '../../web/lib/v3Presentation.js'` |

## Why it is red, and whose it is

The `ui-overhaul` mission's consolidation commit `3e7d83e9` (2026-09-01 23:30) deleted the `web/` directory while `tests/unit/s14-ui.test.ts` still imports from it. One `TS2307` for the missing module, then seven downstream `TS18046` "is of type 'unknown'" errors that follow from it. **Not observability's, and not observability's to fix** — routed to that mission on ticket `t_1acc97c0`, and V row V-8 decides whether coders wait.

## The rule this baseline creates, binding on every coding packet and every review

**Assert the DELTA, never the absolute.** A seat's gate is *"`pnpm typecheck` reports no diagnostic that is not in this pin"* — not *"typecheck is green"*, which is unachievable today and would make every seat either lie or stall.

Three things a seat must do, and a reviewer must check:
1. **Run `pnpm generate:contract` FIRST and say you did.** The typecheck gate is fail-closed: without the generated contract the diagnostic count changes for a reason unrelated to the diff.
2. **Positively assert zero module-resolution escape from the worktree root.** A matching diagnostic count is not evidence of containment — a path escaping the worktree can produce the same number.
3. **Never "fix" a diagnostic in this pin.** It belongs to another mission; repairing it silently crosses a file contract and hides that mission's debt.

## What was also proven by this measurement

The per-slice worktree recipe (`logs/prep-slice-worktree.sh`) works end to end: it created `slice/oa-fix-01` at `dev`, APFS clone-copied **30** `node_modules` trees from the main checkout, and produced a tree that runs the real workspace commands with a clean porcelain. **Never symlink the root `node_modules` instead** — pnpm's workspace links live in per-package link farms, a root symlink breaks resolution, and `pnpm install` through a symlink writes into the main tree.
