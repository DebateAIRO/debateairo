# Review package — REV(S01) pass 1 · mission `free-public-debates` · assembled 2026-09-21 03:55

Frames only. The orchestrator's reading of any measurement is NOT in this package.

## 1. What is under review
- slice head: `db4758da` on `slice/free-public-debates-s01` · base: `5b6cc9b1` (`integration/all`) · the product diff: `/Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine/.worktrees/all/dialectical-engine/.hermes/reports/free-public-debates/review-packages/S01-p1/product.diff` (4270 lines) · stat: `/Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine/.worktrees/all/dialectical-engine/.hermes/reports/free-public-debates/review-packages/S01-p1/diffstat.txt`
- commits, oldest first:
  - 31d6dee5 2026-09-20 22:44:45 +0300 feat(db): add S01 C1 free-public binding
  - 11184e70 2026-09-21 03:06:47 +0300 feat(publication): add free public auto-publish
  - 63a97f31 2026-09-21 03:37:15 +0300 feat(api): refuse unpublishing bound free debates
  - db4758da 2026-09-21 03:52:26 +0300 feat: erase bound published debates
- `git diff --name-only 5b6cc9b1..db4758da -- apps/ui | wc -l` (run from the lane) = 0

## 2. The oracle (`ui: no` — the SPEC acceptance, not a DONE.md)
- `/Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine/.worktrees/all/dialectical-engine/docs/missions/free-public-debates/slices/S01/SPEC-v2.md` — requirements R-1…R-25 and section "## 4. Acceptance". `SPEC.md` is superseded.
- `/Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine/.worktrees/all/dialectical-engine/docs/missions/free-public-debates/slices/S01/DECISIONS.md` sections "## 10.", "## 20.", "## 21.", "## 22." (orchestrator folds and rulings) and "## 23."–"## 25." (the C4 authorization decision).
- `/Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine/.worktrees/all/dialectical-engine/docs/missions/free-public-debates/V-DECISIONS-PACKET.md` rows V-1…V-7: each default binds. V-7 was NOT plan-reviewed (the plan review reached its three-pass cap before the gap was found at BUILD).

## 3. Cluster map, commands, three-run tables
- the map and the ONE command per cluster: `/Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine/.worktrees/all/dialectical-engine/docs/missions/free-public-debates/slices/S01/PLAN.md` section "## 1. Clusters — build units, one verification command each" (Revision 4). Build order as run: C1 → C2 → C3 ∥ C4.
- each cluster's three-run table and RED frames are in its READY comment and self-report — the seats' CLAIMS, not measurements of this package:
  - BUILD-S01-C1: `/Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine/.worktrees/all/dialectical-engine/.hermes/reports/free-public-debates/agent-reports/BUILD-S01-C1.md` · run logs `/Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine/.worktrees/all/dialectical-engine/.hermes/reports/free-public-debates/probes/BUILD-S01-C1/`
  - BUILD-S01-C2: `/Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine/.worktrees/all/dialectical-engine/.hermes/reports/free-public-debates/agent-reports/BUILD-S01-C2.md` · run logs `/Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine/.worktrees/all/dialectical-engine/.hermes/reports/free-public-debates/probes/BUILD-S01-C2/`
  - BUILD-S01-C3: `/Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine/.worktrees/all/dialectical-engine/.hermes/reports/free-public-debates/agent-reports/BUILD-S01-C3.md` · run logs `/Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine/.worktrees/all/dialectical-engine/.hermes/reports/free-public-debates/probes/BUILD-S01-C3/`
  - BUILD-S01-C4: `/Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine/.worktrees/all/dialectical-engine/.hermes/reports/free-public-debates/agent-reports/BUILD-S01-C4.md` · run logs `/Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine/.worktrees/all/dialectical-engine/.hermes/reports/free-public-debates/probes/BUILD-S01-C4/`
- measured by the orchestrator at each landing (frames): `/Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine/.worktrees/all/dialectical-engine/.hermes/reports/free-public-debates/probes/orchestrator/base-frame-C2.txt` (at 31d6dee5) · `base-frame-C3.txt`, `base-frame-C4.txt` (at 11184e70) · `verify-C3-63a97f31.txt` · `base-frame-C4-r3.txt` (at 63a97f31) · `verify-head-db4758da.txt` and `typecheck-db4758da.log` (at the slice head).
- baseline at `5b6cc9b1`: the intake record `/Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine/.worktrees/all/dialectical-engine/docs/missions/free-public-debates/00-intake.md`, table "Baseline at `5b6cc9b1` in the lane" — four suites RED at base with named tests; typecheck 70 diagnostics (`/Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine/.worktrees/all/dialectical-engine/.hermes/reports/free-public-debates/logs/typecheck-base.log`).

## 4. Findings already on the board that the build raised (FACTS, each with its ticket — verify, do not trust)
- t_fe4dc229 — plan steps demanded `CLUSTER_RED` for expected-failure pairs (ruling DECISIONS "## 21.").
- t_dc955a68 — C2: PLAN omitted the adaptation of the existing v2 ref-binding trigger (`migrations/0067_system_run_publication.sql:43`); the constructor/interface change broke 16 type-level call sites in four existing suites until made compatible (`apps/api/src/publications.ts:127-190`); constants the seat chose: actor `system:free-public-auto-publish`, a FIXED visibility actor token `00000000-0000-4000-8000-0000000000f1`, 5-minute leases, batch 100, 30 s interval.
- t_e0574ee7 — plan guard rows labelled a 400 body EXACT while the shared error envelope adds `message` (ruling DECISIONS "## 22.").
- t_cb8f758f — C4: the erasure's PRIVATE visibility event vs the v2 ref-binding trigger; decided by ARCH-FIX (PLAN Revision 4; a second FIXED token `…00f2` admitted by the trigger as redefined in 0068) — V-7.
- t_d3cd954d — C3: stale anchors; the restore law's status-only proof cannot see a misplaced mutant in an already-modified file.
- t_0e8b69ee — ARCH-REV p3 N1-p3…N3-p3 (DECISIONS "## 20.").

## 5. Harness recipe — NO stack is served for this pass
- Every lens works in its OWN detached worktree at the slice head (its packet names it), byte-clean at handoff. `pnpm run generate:contract` has been run there.
- The slice is backend-only: exercise it in-process — `buildApi` as `tests/unit/s8-publication-http.test.ts` and `tests/unit/fpd-s01-c3-unpublish-http.test.ts` do, and the repo's own embedded-Postgres fixture as `tests/integration/fpd-s01-c2-system-publication.test.ts` does (it migrates, creates the roles, and can `SET ROLE debateai_runtime` / `debateai_erasure_runtime`). A superuser pool is privilege-blind: a claim about a new function or query is measured under the product's role.
- V's acceptance walk (SPEC-v2 §4) needs a served lane and V personally; a step you cannot execute in-process is UNVERIFIED, never assumed.
- Processes and files you start are named `<your seat>-*`; write `$!` to `/Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine/.worktrees/all/dialectical-engine/.hermes/reports/free-public-debates/logs/<seat>.<proc>.pid` and kill by that PID or by your own port — never `pkill -f` a shared filename. No-touch listeners at assembly time: `/Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine/.worktrees/all/dialectical-engine/.hermes/reports/free-public-debates/review-packages/S01-p1/listeners-at-assembly.txt`; also no-touch: `.local/**`, any live database, the main checkout.
