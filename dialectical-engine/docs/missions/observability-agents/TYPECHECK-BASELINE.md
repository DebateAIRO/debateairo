# TYPECHECK BASELINE — mission `observability-agents`

**Measured 2026-09-03 09:44 EEST by the orchestrator, in a CLEAN worktree, with the exact command every coding seat runs.** V explicitly parked PR #8 for this ObservationAgent campaign: the security-hardening PR is not fetched, rebased, merged, closed, commented on, or otherwise touched. Re-measure and re-pin this file whenever `dev` moves; a baseline quoted from memory is not a baseline.

## The pin

| Fact | Value |
|---|---|
| Base commit | `2b670d3059c60d7262cf655bd5d402c88100dff3` (branch `dev`) |
| Worktree | `.worktrees/oa-obs-op0-probe/dialectical-engine`, `git status --porcelain` = 0 entries before and after |
| `pnpm generate:contract` | exit **0**, and leaves the tree clean (porcelain 0 after) |
| `pnpm typecheck` | exit **1**, **8** diagnostics |
| Where all 8 live | `tests/unit/s14-ui.test.ts` — every one of them |
| Diagnostics in observability paths | **0** |
| Diagnostic classes | 2 × `TS2307`, 2 × `TS18046`, 2 × `TS2339`, 2 × `TS7006` |
| First diagnostic | `tests/unit/s14-ui.test.ts(19,8): error TS2307: Cannot find module '../../web/lib/v3Presentation.js'` |
| Resolution containment | `tsc --traceResolution`: 5,517 successful resolutions, **0** resolved outside this worktree into the main checkout |

## Why it is red, and whose it is

The `ui-overhaul` mission's consolidation commit `3e7d83e9` (2026-09-01 23:30) deleted the `web/` directory while `tests/unit/s14-ui.test.ts` still imports from it. The current eight diagnostics comprise two missing-module errors and six downstream type errors. **Not observability's, and not observability's to fix** — routed to that mission on ticket `t_1acc97c0`; ObservationAgent seats use the delta rule and must not repair them.

## The rule this baseline creates, binding on every coding packet and every review

**Assert the DELTA, never the absolute.** A seat's gate is *"`pnpm typecheck` reports no diagnostic that is not in this pin"* — not *"typecheck is green"*, which is unachievable today and would make every seat either lie or stall.

Three things a seat must do, and a reviewer must check:
1. **Run `pnpm generate:contract` FIRST and say you did.** The typecheck gate is fail-closed: without the generated contract the diagnostic count changes for a reason unrelated to the diff.
2. **Positively assert zero module-resolution escape from the worktree root.** A matching diagnostic count is not evidence of containment — a path escaping the worktree can produce the same number.
3. **Never "fix" a diagnostic in this pin.** It belongs to another mission; repairing it silently crosses a file contract and hides that mission's debt.

## What was also proven by this measurement

The per-slice worktree recipe (`logs/prep-slice-worktree.sh`) works end to end: it created `slice/oa-obs-op0-probe` at `dev`, APFS clone-copied **30** `node_modules` trees from the main checkout, and produced a tree that runs the real workspace commands with a clean porcelain. **Never symlink the root `node_modules` instead** — pnpm's workspace links live in per-package link farms, a root symlink breaks resolution, and `pnpm install` through a symlink writes into the main tree.

## Op 0.2 companion gates at this pin

- `pnpm audit:source`: exit 1 with exactly three pre-existing blockers, all under `packages/obs-capture/install/{api,runner,scheduler}.ts`, each reading the process environment outside the register loader.
- D12, run with its declared Bash interpreter: **6 PASSED / 1 FAILED / 21 SKIPPED**. Only stage 16 fails because the demo rule rejects the intentional `packages/obs-capture/src/zone/manifest.ts`; the worktree stays clean.
- A discarded controller invocation under `zsh` produced false H1/stage-04 failures because the Bash script requires `BASH_SOURCE`. That harness error is not baseline evidence; the Bash rerun above is authoritative.
