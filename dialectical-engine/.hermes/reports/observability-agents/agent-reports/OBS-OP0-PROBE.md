# OBS-OP0-PROBE — provisional clean-head baseline

Date: 2026-09-02
Scope: reversible rehearsal only; **not** the authoritative Op 0.2 pin because V has not ruled PR #8 merge-or-park.

## Worktree

- Git root: `/Users/vladmihaimiron/Documents/DebateAIRO`
- Worktree: `/Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine/.worktrees/oa-obs-op0-probe`
- Lane cwd: `/Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine/.worktrees/oa-obs-op0-probe/dialectical-engine`
- Branch: `slice/oa-obs-op0-probe`
- Base/HEAD: `2b670d30`
- Before measurement: clean; 30 cloned `node_modules` trees.

## Evidence

- `pnpm generate:contract` exited 0 through `prep-slice-worktree.sh --baseline`.
- `pnpm typecheck` exited 1 with exactly 8 diagnostics.
- All 8 diagnostics are in `tests/unit/s14-ui.test.ts`; none is in an ObservationAgent path.
- The exact diagnostic classes are 2 × TS2307, 2 × TS18046, 2 × TS2339, and 2 × TS7006; the raw log is `/tmp/oa-baseline-obs-op0-probe.log`.
- Worktree remained clean after generation/typecheck.
- First sandboxed `pnpm audit:source` attempt failed before the audit because `tsx` could not open its local IPC socket (`EPERM`).
- Escalated `pnpm audit:source` ran and exited 1 with exactly 3 blocking rows:
  - `packages/obs-capture/install/api.ts reads the process environment outside the register loader`
  - `packages/obs-capture/install/runner.ts reads the process environment outside the register loader`
  - `packages/obs-capture/install/scheduler.ts reads the process environment outside the register loader`
- A sandboxed `observability-demo.sh --quiet` run produced 6 PASSED / 2 FAILED / 20 SKIPPED because the real-product TSX fault driver itself hit sandbox IPC denial; that result is a sandbox artifact, not the product baseline.
- The required escalated read-only rerun produced the stable baseline: **6 PASSED / 1 FAILED / 21 SKIPPED**, exit 1. The only failure is stage 16, whose current demo rule rejects the intentional zone manifest: `packages/obs-capture/src/zone/manifest.ts`. The worktree remained clean.

## Disposition

This proves the current `dev @ 2b670d30` baseline is reproducible and matches the known eight typecheck diagnostics, three source-audit blockers, and D12 count 6/1/21. It does **not** satisfy Op 0.2 until V explicitly parks PR #8 or merges it and the measurement is rerun on the selected `dev` HEAD. No ObservationAgent code was written or dispatched.

## Base-neutral Op 0.6 ticket graph

Read back from the explicit `observability-agents` board after creation:

- V base gate: `t_975ae1bd` (`ready`)
- OBS-01 foundation: `t_9f418bcd` (`todo`, parent = V base gate)
- OBS-02 liveness: `t_5ab0220b` (`todo`, parent = OBS-01)
- OBS-03 detectors: `t_85095b1a` (`todo`, parent = OBS-02)
- OBS-04 capture health: `t_64b56dc6` (`todo`, parent = OBS-02)
- OBS-05 capacity: `t_109cb57a` (`todo`, parent = OBS-02)
- OBS-06 throughput: `t_7cd39674` (`todo`, parent = OBS-02)
- OBS-07 routing: `t_303af268` (`todo`, parent = OBS-02)

All seven code cards route to `gpt-5.6-sol`, require Grok 4.6 review and V's personal acceptance, and remain undispatched pending the V base ruling and authoritative Op 0.2 pin.

## Authoritative Op 0.2 close-out — 2026-09-03

V explicitly ruled that the security-hardening PR is not to be touched. PR #8 is therefore parked for this campaign, and `dev @ 2b670d3059c60d7262cf655bd5d402c88100dff3` is the selected base.

The controller reran the full baseline in the same clean worktree after the ruling:

- `pnpm generate:contract`: exit 0; clean tree.
- `pnpm typecheck`: exit 1; exactly 8 diagnostics, all in `tests/unit/s14-ui.test.ts`; diagnostic classes 2 × TS2307, 2 × TS18046, 2 × TS2339, 2 × TS7006.
- `tsc --traceResolution`: 5,517 successful resolutions and zero resolution into the main checkout outside the worktree.
- `pnpm audit:source`: exactly the three known obs-capture installer environment blockers.
- D12 under Bash: 6 PASSED / 1 FAILED / 21 SKIPPED; only stage 16; clean before and after.

One controller harness invocation incorrectly ran D12 under `zsh` and produced false H1/stage-04 failures; it was discarded and the correct Bash run is the evidence above. `TYPECHECK-BASELINE.md` now carries the authoritative pin. No security-hardening PR state or ref was changed.

Task-0 remaining gates were also read back: none of 0057/0058/0059/0060 exists in the selected 51-migration base; no readable `OBSERVATION_HATCHET_TOKEN_PATH` is present in the controller environment; and no `ops-alerts` board exists. D4 therefore gates only OBS-03/06 live REST acceptance and D7 only OBS-07 live ticket acceptance. Task 0 is closed for OBS-01 dispatch.
